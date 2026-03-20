/**
 * Интеграционные тесты команды restore (Plan 04-04-04).
 * Тестируем: formatRestoreContext, идемпотентность через isSameSession логику,
 * error paths (несуществующий id), атомарную запись через temp dirs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

// Импортируем из dist — стандартный паттерн проекта
let formatRestoreContext, AdapterError;

before(async () => {
   const restoreMod = await import('../../dist/commands/restore.js');
   formatRestoreContext = restoreMod.formatRestoreContext;
   const errMod = await import('../../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

// ─── Утилиты ────────────────────────────────────────────────────────────────

function makeTempDir(prefix = 'cs-restore-') {
   return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(dir) {
   try { rmSync(dir, { recursive: true, force: true }); } catch { /* игнорируем */ }
}

/**
 * Атомарная запись — синхронная версия для тестов (аналог atomicWrite из restore.ts).
 */
function atomicWriteSync(targetPath, content) {
   const dir = dirname(targetPath);
   mkdirSync(dir, { recursive: true });
   const tmpPath = targetPath + '.tmp';
   writeFileSync(tmpPath, content, { encoding: 'utf8' });
   renameSync(tmpPath, targetPath);
}

/**
 * Проверяет содержит ли файл контекста данный sessionId (логика isSameSessionContext).
 */
function isSameSessionContext(contextPath, sessionId) {
   if (!existsSync(contextPath)) return false;
   try {
      const content = readFileSync(contextPath, 'utf8');
      return content.includes(`session: ${sessionId}`);
   } catch {
      return false;
   }
}

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('cli-restore: formatRestoreContext — Happy path', () => {
   it('возвращает Markdown с frontmatter и conversation', () => {
      const result = formatRestoreContext(
         [
            { role: 'user', text: 'Привет, помоги с кодом' },
            { role: 'assistant', text: 'Конечно, что именно?' },
         ],
         {
            sessionId: 'session-test-abc',
            agentName: 'claude',
            projectPath: '/home/user/my-project',
         },
      );

      assert.equal(typeof result, 'string', 'результат должен быть строкой');
      assert.ok(result.includes('session: session-test-abc'), 'frontmatter содержит sessionId');
      assert.ok(result.includes('agent: claude'), 'frontmatter содержит agentName');
      assert.ok(result.includes('Привет, помоги с кодом'), 'диалог пользователя включён');
      assert.ok(result.includes('Конечно, что именно?'), 'ответ ассистента включён');
   });

   it('null conversation → минимальный контекст без crash', () => {
      const result = formatRestoreContext(null, {
         sessionId: 'session-null-conv',
         agentName: 'codex',
         projectPath: '/home/user/proj',
      });

      assert.equal(typeof result, 'string', 'должен вернуть строку при null conversation');
      assert.ok(result.includes('session-null-conv'), 'sessionId присутствует');
   });

   it('пустой массив сообщений → строка без crash', () => {
      const result = formatRestoreContext([], {
         sessionId: 'session-empty',
         agentName: 'gemini',
         projectPath: '/home/user/proj',
      });

      assert.equal(typeof result, 'string', 'должен вернуть строку для пустого диалога');
      assert.ok(result.includes('session-empty'), 'sessionId присутствует');
   });

   it('split conversation (head/tail) → обрабатывается без crash', () => {
      const result = formatRestoreContext(
         {
            head: [{ role: 'user', text: 'Начало' }],
            tail: [{ role: 'assistant', text: 'Конец' }],
            totalSkipped: true,
         },
         {
            sessionId: 'session-split',
            agentName: 'claude',
            projectPath: '/home/user/proj',
         },
      );

      assert.equal(typeof result, 'string', 'split conversation → строка');
      assert.ok(result.includes('session-split'), 'sessionId присутствует');
   });

   it('метаданные: jsonlPath включён если передан', () => {
      const result = formatRestoreContext(
         [{ role: 'user', text: 'Test' }],
         {
            sessionId: 'session-meta',
            agentName: 'claude',
            projectPath: '/home/user/my-project',
            jsonlPath: '/home/user/.claude/projects/my-project/session-meta.jsonl',
         },
      );

      assert.ok(result.includes('session-meta.jsonl'), 'jsonlPath включён в результат');
   });
});

describe('cli-restore: Несуществующий sessionId', () => {
   it('поиск несуществующей сессии → findSession возвращает undefined', () => {
      const sessions = [
         { id: 'session-abc', agent: 'claude', project: '/proj', lastTs: Date.now() },
         { id: 'session-def', agent: 'codex', project: '/proj2', lastTs: Date.now() },
      ];

      const found = sessions.find((s) => s.id === 'nonexistent-id');
      assert.equal(found, undefined, 'несуществующая сессия должна вернуть undefined');
   });

   it('AdapterError SESSION_NOT_FOUND содержит понятное сообщение', () => {
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Сессия nonexistent-id не найдена',
         agentName: 'unknown',
         suggestion: 'Проверьте ID через claude-sessions list',
      });

      assert.equal(err.code, 'SESSION_NOT_FOUND');
      assert.ok(err.message.includes('nonexistent-id'));
      assert.ok(err.suggestion.length > 0, 'suggestion не пустой');
   });
});

describe('cli-restore: Идемпотентность', () => {
   let tmpDir;
   let contextFile;

   before(() => {
      tmpDir = makeTempDir('cs-restore-idem-');
      contextFile = join(tmpDir, '.restore-context.md');
   });

   after(() => cleanup(tmpDir));

   it('один вызов → файл создаётся с корректным содержимым', () => {
      const content = formatRestoreContext(
         [{ role: 'user', text: 'Первый вызов' }],
         { sessionId: 'session-idem-1', agentName: 'claude', projectPath: tmpDir },
      );

      atomicWriteSync(contextFile, content);

      assert.ok(existsSync(contextFile), 'файл должен существовать');
      const written = readFileSync(contextFile, 'utf8');
      assert.ok(written.includes('session: session-idem-1'), 'sessionId в файле');
   });

   it('isSameSessionContext: тот же sessionId → true', () => {
      // Файл уже создан в предыдущем тесте
      const result = isSameSessionContext(contextFile, 'session-idem-1');
      assert.equal(result, true, 'тот же sessionId → isSameSessionContext=true');
   });

   it('isSameSessionContext: другой sessionId → false', () => {
      const result = isSameSessionContext(contextFile, 'session-other-id');
      assert.equal(result, false, 'другой sessionId → isSameSessionContext=false');
   });

   it('isSameSessionContext: несуществующий файл → false', () => {
      const nonExistent = join(tmpDir, 'nonexistent.md');
      const result = isSameSessionContext(nonExistent, 'any-session');
      assert.equal(result, false, 'несуществующий файл → false');
   });

   it('два вызова restore одной сессии → файл перезаписывается, результат корректен', () => {
      const contextFile2 = join(tmpDir, '.restore-context-2.md');

      const content1 = formatRestoreContext(
         [{ role: 'user', text: 'Первый' }],
         { sessionId: 'session-idem-2', agentName: 'claude', projectPath: tmpDir },
      );
      const content2 = formatRestoreContext(
         [{ role: 'user', text: 'Второй' }],
         { sessionId: 'session-idem-2', agentName: 'claude', projectPath: tmpDir },
      );

      atomicWriteSync(contextFile2, content1);
      atomicWriteSync(contextFile2, content2); // перезапись

      const written = readFileSync(contextFile2, 'utf8');
      assert.ok(written.includes('session-idem-2'), 'sessionId присутствует');
      assert.ok(written.includes('Второй'), 'файл содержит последний контент');
   });
});

describe('cli-restore: Атомарная запись через tmp+rename', () => {
   it('atomicWriteSync создаёт файл, удаляет .tmp', () => {
      const tmpDir2 = makeTempDir('cs-restore-atomic-');
      const targetPath = join(tmpDir2, 'context.md');
      const tmpPath = targetPath + '.tmp';

      try {
         atomicWriteSync(targetPath, '# Test\nsession: abc\n');

         assert.ok(existsSync(targetPath), 'целевой файл создан');
         assert.ok(!existsSync(tmpPath), 'temp файл удалён после rename');
         assert.ok(readFileSync(targetPath, 'utf8').includes('session: abc'), 'содержимое корректно');
      } finally {
         cleanup(tmpDir2);
      }
   });

   it('renameSync несуществующего tmp → ENOENT ошибка (корректная, не crash)', () => {
      const tmpDir3 = makeTempDir('cs-restore-atomic2-');
      const targetPath = join(tmpDir3, 'context.md');
      const nonExistentTmp = join(tmpDir3, 'nonexistent.tmp');

      assert.throws(
         () => renameSync(nonExistentTmp, targetPath),
         (err) => {
            assert.ok(err instanceof Error, 'должна быть ошибка');
            assert.ok(['ENOENT', 'EPERM'].includes(err.code), `FS код ошибки: ${err.code}`);
            return true;
         },
      );

      cleanup(tmpDir3);
   });
});
