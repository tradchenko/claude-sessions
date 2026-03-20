/**
 * Тесты getResumeCommand для Claude и Codex адаптеров.
 * SESS-01..03: resume возвращает команду или бросает AdapterError.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

let ClaudeAdapter, CodexAdapter, AdapterError;

before(async () => {
   const claudeMod = await import('../dist/agents/claude.js');
   ClaudeAdapter = claudeMod.ClaudeAdapter;
   const codexMod = await import('../dist/agents/codex.js');
   CodexAdapter = codexMod.CodexAdapter;
   const errMod = await import('../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

// ─── Claude ─────────────────────────────────────────────────────────────────

describe('ClaudeAdapter.getResumeCommand', () => {
   it('если sessionId пустой → бросает AdapterError SESSION_NOT_FOUND', () => {
      const adapter = new ClaudeAdapter();
      assert.throws(
         () => adapter.getResumeCommand(''),
         (e) => e instanceof AdapterError && e.code === 'SESSION_NOT_FOUND',
      );
   });

   it('если claude binary найден → возвращает [bin, --resume, sessionId]', () => {
      const adapter = new ClaudeAdapter();
      // Только если claude установлен — иначе ожидаем AGENT_NOT_INSTALLED
      try {
         const cmd = adapter.getResumeCommand('test-session-id');
         assert.ok(Array.isArray(cmd), 'должен быть массив');
         assert.ok(cmd.length === 3, 'должно быть 3 элемента');
         assert.equal(cmd[1], '--resume');
         assert.equal(cmd[2], 'test-session-id');
      } catch (e) {
         // Если claude не установлен — ожидаем AGENT_NOT_INSTALLED
         assert.ok(e instanceof AdapterError, 'должен быть AdapterError');
         assert.equal(e.code, 'AGENT_NOT_INSTALLED');
      }
   });

   it('если claude binary не найден → бросает AdapterError AGENT_NOT_INSTALLED', () => {
      // Мокаем отсутствие binary через нестандартные пути PATH
      const origPath = process.env.PATH;
      process.env.PATH = '/nonexistent';
      const adapter = new ClaudeAdapter();
      // Только если claude не найден через кандидатов
      // Используем проверку через детект
      const info = adapter.detect();
      if (!info?.cliBin || !existsSync(info.cliBin)) {
         assert.throws(
            () => adapter.getResumeCommand('some-session'),
            (e) => e instanceof AdapterError && e.code === 'AGENT_NOT_INSTALLED',
         );
      }
      process.env.PATH = origPath;
   });
});

// ─── Codex ───────────────────────────────────────────────────────────────────

describe('CodexAdapter.getResumeCommand', () => {
   it('если codex binary найден → бросает AdapterError RESUME_NOT_SUPPORTED', () => {
      const adapter = new CodexAdapter();
      // Если codex установлен — ожидаем RESUME_NOT_SUPPORTED
      // Если не установлен — ожидаем AGENT_NOT_INSTALLED
      try {
         adapter.getResumeCommand('test-session-id');
         assert.fail('должен был бросить AdapterError');
      } catch (e) {
         assert.ok(e instanceof AdapterError, 'должен быть AdapterError');
         assert.ok(
            e.code === 'RESUME_NOT_SUPPORTED' || e.code === 'AGENT_NOT_INSTALLED',
            `код должен быть RESUME_NOT_SUPPORTED или AGENT_NOT_INSTALLED, получили: ${e.code}`,
         );
      }
   });

   it('всегда бросает AdapterError (никогда не возвращает null)', () => {
      const adapter = new CodexAdapter();
      assert.throws(
         () => adapter.getResumeCommand('any-session-id'),
         (e) => e instanceof AdapterError,
      );
   });

   it('suggestion содержит restore для RESUME_NOT_SUPPORTED', () => {
      const adapter = new CodexAdapter();
      try {
         adapter.getResumeCommand('test-session-id');
      } catch (e) {
         if (e instanceof AdapterError && e.code === 'RESUME_NOT_SUPPORTED') {
            assert.ok(e.suggestion.toLowerCase().includes('restore'), `suggestion должен упоминать restore: "${e.suggestion}"`);
         }
      }
   });
});
