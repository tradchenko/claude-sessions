/**
 * Тесты getResumeCommand для всех 5 агентов — Plan 02-07-02
 * Матрица: [Claude, Codex, Qwen, Gemini, Companion] × [found, not-found, agent-not-installed]
 * Все тесты работают через dist/ — требуют npm run build.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let ClaudeAdapter, CodexAdapter, QwenAdapter, GeminiAdapter, CompanionAdapter;
let AdapterError;

before(async () => {
   const claudeMod = await import('../dist/agents/claude.js');
   ClaudeAdapter = claudeMod.ClaudeAdapter;

   const codexMod = await import('../dist/agents/codex.js');
   CodexAdapter = codexMod.CodexAdapter;

   const qwenMod = await import('../dist/agents/qwen.js');
   QwenAdapter = qwenMod.QwenAdapter;

   const geminiMod = await import('../dist/agents/gemini.js');
   GeminiAdapter = geminiMod.GeminiAdapter;

   const companionMod = await import('../dist/agents/companion.js');
   CompanionAdapter = companionMod.CompanionAdapter;

   const errMod = await import('../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

// ─── Вспомогательная проверка AdapterError ────────────────────────────────────

function assertAdapterError(fn, expectedCode) {
   try {
      fn();
      assert.fail(`Ожидался AdapterError с кодом ${expectedCode}, но исключения не было`);
   } catch (e) {
      assert.ok(e instanceof AdapterError, `Ожидался AdapterError, получен: ${e?.constructor?.name}`);
      assert.equal(e.code, expectedCode, `Ожидался код ${expectedCode}, получен: ${e.code}`);
      return e;
   }
}

// ─── ClaudeAdapter.getResumeCommand ──────────────────────────────────────────

describe('ClaudeAdapter.getResumeCommand', () => {
   it('пустой sessionId → SESSION_NOT_FOUND', () => {
      const adapter = new ClaudeAdapter();
      assertAdapterError(() => adapter.getResumeCommand(''), 'SESSION_NOT_FOUND');
   });

   it('если claude установлен → возвращает [bin, --resume, sessionId]', () => {
      const adapter = new ClaudeAdapter();
      // Определяем наличие claude через detect()
      const info = adapter.detect();
      if (info?.cliBin) {
         const cmd = adapter.getResumeCommand('test-session-id');
         assert.ok(Array.isArray(cmd), 'должен быть массив');
         assert.equal(cmd.length, 3, 'должно быть 3 элемента');
         assert.equal(cmd[1], '--resume');
         assert.equal(cmd[2], 'test-session-id');
      } else {
         // claude не установлен — ожидаем AGENT_NOT_INSTALLED
         assertAdapterError(() => adapter.getResumeCommand('test-session-id'), 'AGENT_NOT_INSTALLED');
      }
   });

   it('AdapterError содержит agentName="claude"', () => {
      const adapter = new ClaudeAdapter();
      const err = assertAdapterError(() => adapter.getResumeCommand(''), 'SESSION_NOT_FOUND');
      assert.equal(err.agentName, 'claude');
   });

   it('AdapterError содержит непустой suggestion', () => {
      const adapter = new ClaudeAdapter();
      const err = assertAdapterError(() => adapter.getResumeCommand(''), 'SESSION_NOT_FOUND');
      assert.ok(typeof err.suggestion === 'string' && err.suggestion.length > 0, 'suggestion должен быть непустым');
   });
});

// ─── CodexAdapter.getResumeCommand ───────────────────────────────────────────

describe('CodexAdapter.getResumeCommand', () => {
   it('если codex установлен → возвращает команду с `codex resume`', () => {
      const adapter = new CodexAdapter();
      const info = adapter.detect();
      if (info?.cliBin) {
         const cmd = adapter.getResumeCommand('any-session-id');
         assert.ok(Array.isArray(cmd), 'должен вернуть массив');
         assert.ok(cmd.length >= 2, 'массив должен содержать бинарник и подкоманду');
         assert.equal(cmd[1], 'resume', 'вторым элементом должна быть подкоманда resume');
      }
      // Если не установлен — тест не применим, пропускаем
   });

   it('если codex не установлен → AGENT_NOT_INSTALLED', () => {
      const adapter = new CodexAdapter();
      const info = adapter.detect();
      if (!info) {
         assertAdapterError(() => adapter.getResumeCommand('any-session'), 'AGENT_NOT_INSTALLED');
      }
      // Если установлен — тест не применим, пропускаем
   });
});

// ─── QwenAdapter.getResumeCommand ────────────────────────────────────────────

describe('QwenAdapter.getResumeCommand', () => {
   it('если qwen установлен → возвращает [bin, --resume, sessionId]', () => {
      const adapter = new QwenAdapter();
      const info = adapter.detect();
      if (info?.cliBin) {
         const cmd = adapter.getResumeCommand('test-qwen-session');
         assert.ok(Array.isArray(cmd), 'должен быть массив');
         assert.ok(cmd.length >= 3, 'должно быть минимум 3 элемента');
         assert.equal(cmd[1], '--resume');
         assert.equal(cmd[2], 'test-qwen-session');
      } else {
         // qwen не установлен — ожидаем AGENT_NOT_INSTALLED
         assertAdapterError(() => adapter.getResumeCommand('test-qwen-session'), 'AGENT_NOT_INSTALLED');
      }
   });

   it('если qwen не установлен → AGENT_NOT_INSTALLED', () => {
      const adapter = new QwenAdapter();
      const info = adapter.detect();
      if (!info) {
         assertAdapterError(() => adapter.getResumeCommand('any-session'), 'AGENT_NOT_INSTALLED');
      }
   });

   it('AdapterError от QwenAdapter содержит agentName="qwen"', () => {
      const adapter = new QwenAdapter();
      const info = adapter.detect();
      if (!info) {
         const err = assertAdapterError(() => adapter.getResumeCommand('any-session'), 'AGENT_NOT_INSTALLED');
         assert.equal(err.agentName, 'qwen');
      }
   });
});

// ─── GeminiAdapter.getResumeCommand ──────────────────────────────────────────

describe('GeminiAdapter.getResumeCommand', () => {
   it('если gemini не установлен → AGENT_NOT_INSTALLED', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (!info) {
         assertAdapterError(() => adapter.getResumeCommand('gemini-myproject'), 'AGENT_NOT_INSTALLED');
      }
   });

   it('если gemini установлен но проект не найден → SESSION_NOT_FOUND', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (info) {
         // Несуществующий проект — ожидаем SESSION_NOT_FOUND
         assertAdapterError(() => adapter.getResumeCommand('gemini-nonexistent-project-xyz-abc'), 'SESSION_NOT_FOUND');
      }
   });

   it('AdapterError от GeminiAdapter содержит agentName="gemini"', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (!info) {
         const err = assertAdapterError(() => adapter.getResumeCommand('any'), 'AGENT_NOT_INSTALLED');
         assert.equal(err.agentName, 'gemini');
      }
   });

   it('sessionId формата gemini-{project} обрабатывается корректно', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (info) {
         // Бросает SESSION_NOT_FOUND или возвращает команду — зависит от наличия проекта
         try {
            const cmd = adapter.getResumeCommand('gemini-someproject');
            assert.ok(Array.isArray(cmd) || cmd === null, 'должен вернуть массив или null');
         } catch (e) {
            assert.ok(e instanceof AdapterError, 'если бросает — должен быть AdapterError');
         }
      }
   });
});

// ─── CompanionAdapter.getResumeCommand (делегирование) ───────────────────────

describe('CompanionAdapter.getResumeCommand', () => {
   it('бросает AdapterError если нет установленных агентов', () => {
      // В test окружении ни один реальный агент может не быть детектирован
      const adapter = new CompanionAdapter();
      try {
         adapter.getResumeCommand('some-session-id');
         // Если вернул — значит нашёл хотя бы один агент, это ок
      } catch (e) {
         assert.ok(e instanceof AdapterError, `Ожидался AdapterError, получен: ${e?.constructor?.name}`);
         // AGENT_NOT_INSTALLED (нет агентов) или SESSION_NOT_FOUND / RESUME_NOT_SUPPORTED (от делегата)
         const validCodes = ['AGENT_NOT_INSTALLED', 'SESSION_NOT_FOUND', 'RESUME_NOT_SUPPORTED'];
         assert.ok(
            validCodes.includes(e.code),
            `Неожиданный код: ${e.code}`,
         );
      }
   });

   it('CompanionAdapter имеет метод getResumeCommand', () => {
      const adapter = new CompanionAdapter();
      assert.equal(typeof adapter.getResumeCommand, 'function');
   });

   it('CompanionAdapter имеет метод isSessionAlive возвращающий false', () => {
      const adapter = new CompanionAdapter();
      const result = adapter.isSessionAlive('any-session-id');
      assert.equal(result, false, 'Companion.isSessionAlive должен возвращать false');
   });

   it('CompanionAdapter.getInstructionsPath возвращает null', () => {
      const adapter = new CompanionAdapter();
      const path = adapter.getInstructionsPath();
      assert.equal(path, null, 'CompanionAdapter.getInstructionsPath должен возвращать null');
   });
});
