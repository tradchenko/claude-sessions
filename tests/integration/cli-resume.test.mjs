/**
 * Интеграционные тесты команды resume (Plan 04-04-03).
 * Тестируем: dispatch логику, error paths (сессия не найдена, агент не установлен).
 * Реальный запуск агента не тестируется — только dispatch и error cases.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Импортируем AdapterError из dist для проверки типов ошибок
let AdapterError;
before(async () => {
   const errMod = await import('../../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** Создаёт уникальную temp-директорию */
function makeTempDir(prefix = 'cs-resume-') {
   return mkdtempSync(join(tmpdir(), prefix));
}

/** Удаляет директорию рекурсивно */
function cleanup(dir) {
   try { rmSync(dir, { recursive: true, force: true }); } catch { /* игнорируем */ }
}

// ─── Inline-логика dispatch resume ──────────────────────────────────────────

/**
 * Имитирует dispatch логику resume:
 * 1. Ищет сессию в списке
 * 2. Определяет агента
 * 3. Вызывает getResumeCommand адаптера
 *
 * Отражает паттерн из src/commands/restore.ts.
 */
async function dispatchResume(sessionId, sessions, adapterRegistry) {
   // Поиск сессии
   const session = sessions.find((s) => s.id === sessionId);

   if (!session) {
      throw new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: `Сессия ${sessionId} не найдена`,
         agentName: 'unknown',
         suggestion: 'Проверьте ID сессии через claude-sessions list',
      });
   }

   const agentId = session.agent ?? 'claude';
   const adapter = adapterRegistry[agentId];

   if (!adapter) {
      throw new AdapterError({
         code: 'AGENT_NOT_INSTALLED',
         message: `Агент ${agentId} не установлен`,
         agentName: agentId,
         suggestion: `Установите агент ${agentId}`,
      });
   }

   // Проверяем что агент поддерживает resume
   return adapter.getResumeCommand(sessionId);
}

// ─── Mock адаптеры для тестирования ─────────────────────────────────────────

/** Адаптер который успешно возвращает команду resume */
function makeWorkingAdapter(agentName) {
   return {
      detect: () => ({ cliBin: '/usr/bin/' + agentName }),
      getResumeCommand: (sessionId) => ['/usr/bin/' + agentName, '--resume', sessionId],
   };
}

/** Адаптер который бросает AGENT_NOT_INSTALLED */
function makeNotInstalledAdapter(agentName) {
   return {
      detect: () => null,
      getResumeCommand: (sessionId) => {
         throw new AdapterError({
            code: 'AGENT_NOT_INSTALLED',
            message: `${agentName} не найден в PATH`,
            agentName,
            suggestion: `Установите ${agentName}`,
         });
      },
   };
}

/** Адаптер который бросает RESUME_NOT_SUPPORTED */
function makeNoResumeAdapter(agentName) {
   return {
      detect: () => ({ cliBin: '/usr/bin/' + agentName }),
      getResumeCommand: (sessionId) => {
         throw new AdapterError({
            code: 'RESUME_NOT_SUPPORTED',
            message: `${agentName} не поддерживает resume`,
            agentName,
            suggestion: 'Используйте restore вместо resume',
         });
      },
   };
}

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('cli-resume: Сессия не найдена', () => {
   const emptySessions = [];
   const registry = { claude: makeWorkingAdapter('claude') };

   it('несуществующий sessionId → AdapterError SESSION_NOT_FOUND', async () => {
      await assert.rejects(
         () => dispatchResume('nonexistent-session-id', emptySessions, registry),
         (err) => {
            assert.ok(err instanceof AdapterError, 'должен быть AdapterError');
            assert.equal(err.code, 'SESSION_NOT_FOUND', 'код должен быть SESSION_NOT_FOUND');
            assert.ok(err.message.includes('nonexistent-session-id'), 'сообщение содержит ID');
            return true;
         },
      );
   });

   it('пустой sessionId → AdapterError SESSION_NOT_FOUND', async () => {
      await assert.rejects(
         () => dispatchResume('', emptySessions, registry),
         (err) => {
            assert.ok(err instanceof AdapterError, 'должен быть AdapterError');
            assert.equal(err.code, 'SESSION_NOT_FOUND');
            return true;
         },
      );
   });
});

describe('cli-resume: Агент не установлен', () => {
   const sessions = [
      { id: 'session-codex-1', agent: 'codex', project: '/home/user/proj', lastTs: Date.now() },
      { id: 'session-qwen-1', agent: 'qwen', project: '/home/user/proj2', lastTs: Date.now() },
   ];

   it('codex сессия, адаптер бросает AGENT_NOT_INSTALLED → ошибка проброшена', async () => {
      const registry = {
         codex: makeNotInstalledAdapter('codex'),
      };

      await assert.rejects(
         () => dispatchResume('session-codex-1', sessions, registry),
         (err) => {
            assert.ok(err instanceof AdapterError, 'должен быть AdapterError');
            assert.equal(err.code, 'AGENT_NOT_INSTALLED', 'код AGENT_NOT_INSTALLED');
            assert.equal(err.agentName, 'codex', 'агент codex');
            return true;
         },
      );
   });

   it('агент не зарегистрирован в registry → AdapterError AGENT_NOT_INSTALLED', async () => {
      const registry = {}; // пустой registry

      await assert.rejects(
         () => dispatchResume('session-qwen-1', sessions, registry),
         (err) => {
            assert.ok(err instanceof AdapterError, 'должен быть AdapterError');
            assert.equal(err.code, 'AGENT_NOT_INSTALLED');
            return true;
         },
      );
   });
});

describe('cli-resume: Dispatch логика', () => {
   const sessions = [
      { id: 'session-claude-1', agent: 'claude', project: '/home/user/proj', lastTs: Date.now() - 2000 },
      { id: 'session-codex-2', agent: 'codex', project: '/home/user/proj2', lastTs: Date.now() - 1000 },
      { id: 'session-qwen-3', agent: 'qwen', project: '/home/user/proj3', lastTs: Date.now() },
   ];

   it('claude сессия → dispatch вызывает claude адаптер', async () => {
      const registry = {
         claude: makeWorkingAdapter('claude'),
         codex: makeWorkingAdapter('codex'),
         qwen: makeWorkingAdapter('qwen'),
      };

      const cmd = await dispatchResume('session-claude-1', sessions, registry);

      assert.ok(Array.isArray(cmd), 'команда должна быть массивом');
      assert.ok(cmd[0].includes('claude'), 'первый элемент — путь к claude binary');
      assert.ok(cmd.includes('session-claude-1'), 'sessionId должен быть в команде');
   });

   it('codex сессия → dispatch вызывает codex адаптер', async () => {
      const registry = {
         claude: makeWorkingAdapter('claude'),
         codex: makeWorkingAdapter('codex'),
         qwen: makeWorkingAdapter('qwen'),
      };

      const cmd = await dispatchResume('session-codex-2', sessions, registry);

      assert.ok(Array.isArray(cmd), 'команда должна быть массивом');
      assert.ok(cmd[0].includes('codex'), 'первый элемент — путь к codex binary');
      assert.ok(cmd.includes('session-codex-2'), 'sessionId должен быть в команде');
   });

   it('агент не поддерживает resume → RESUME_NOT_SUPPORTED проброшен', async () => {
      const registry = {
         codex: makeNoResumeAdapter('codex'),
      };

      await assert.rejects(
         () => dispatchResume('session-codex-2', sessions, registry),
         (err) => {
            assert.ok(err instanceof AdapterError, 'должен быть AdapterError');
            assert.equal(err.code, 'RESUME_NOT_SUPPORTED', 'код RESUME_NOT_SUPPORTED');
            return true;
         },
      );
   });

   it('сессия без явного agent → fallback на claude адаптер', async () => {
      const sessionsWithFallback = [
         { id: 'session-no-agent', project: '/home/user/proj', lastTs: Date.now() },
         // agent не задан — должен использоваться 'claude' по умолчанию
      ];
      const registry = {
         claude: makeWorkingAdapter('claude'),
      };

      const cmd = await dispatchResume('session-no-agent', sessionsWithFallback, registry);

      assert.ok(Array.isArray(cmd), 'команда должна быть массивом');
      assert.ok(cmd[0].includes('claude'), 'fallback на claude');
   });
});

describe('cli-resume: AdapterError структура', () => {
   it('AdapterError содержит код, agentName, suggestion', async () => {
      const sessions = [];
      const registry = {};

      let caughtError = null;
      try {
         await dispatchResume('no-session', sessions, registry);
      } catch (e) {
         caughtError = e;
      }

      assert.ok(caughtError !== null, 'ошибка должна быть брошена');
      assert.ok(caughtError instanceof AdapterError, 'должен быть AdapterError');
      assert.ok('code' in caughtError, 'поле code должно присутствовать');
      assert.ok('agentName' in caughtError, 'поле agentName должно присутствовать');
      assert.ok('suggestion' in caughtError, 'поле suggestion должно присутствовать');
      assert.equal(typeof caughtError.message, 'string', 'message должен быть строкой');
   });
});
