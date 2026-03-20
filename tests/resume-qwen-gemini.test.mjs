/**
 * Тесты getResumeCommand для Qwen и Gemini адаптеров.
 * SESS-04..06: resume возвращает команду или бросает AdapterError.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let QwenAdapter, GeminiAdapter, AdapterError;

before(async () => {
   const qwenMod = await import('../dist/agents/qwen.js');
   QwenAdapter = qwenMod.QwenAdapter;
   const geminiMod = await import('../dist/agents/gemini.js');
   GeminiAdapter = geminiMod.GeminiAdapter;
   const errMod = await import('../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

// ─── Qwen ────────────────────────────────────────────────────────────────────

describe('QwenAdapter.getResumeCommand', () => {
   it('если qwen binary найден → возвращает [bin, --resume, sessionId]', () => {
      const adapter = new QwenAdapter();
      try {
         const cmd = adapter.getResumeCommand('test-session-id');
         assert.ok(Array.isArray(cmd), 'должен быть массив');
         assert.ok(cmd.length === 3, 'должно быть 3 элемента');
         assert.equal(cmd[1], '--resume');
         assert.equal(cmd[2], 'test-session-id');
      } catch (e) {
         // Если qwen не установлен — ожидаем AGENT_NOT_INSTALLED
         assert.ok(e instanceof AdapterError, 'должен быть AdapterError');
         assert.equal(e.code, 'AGENT_NOT_INSTALLED');
      }
   });

   it('если qwen binary не найден → бросает AdapterError AGENT_NOT_INSTALLED', () => {
      const adapter = new QwenAdapter();
      const info = adapter.detect();
      if (!info?.cliBin) {
         // binary не найден — ожидаем ошибку
         assert.throws(
            () => adapter.getResumeCommand('some-session'),
            (e) => e instanceof AdapterError && e.code === 'AGENT_NOT_INSTALLED',
         );
      } else {
         // binary найден — команда должна вернуть массив
         const cmd = adapter.getResumeCommand('some-session');
         assert.ok(Array.isArray(cmd));
      }
   });

   it('никогда не возвращает null — либо массив, либо ошибку', () => {
      const adapter = new QwenAdapter();
      try {
         const cmd = adapter.getResumeCommand('test-session-id');
         assert.notEqual(cmd, null, 'не должен возвращать null');
         assert.ok(Array.isArray(cmd));
      } catch (e) {
         assert.ok(e instanceof AdapterError, 'должен быть AdapterError, не null');
      }
   });
});

// ─── Gemini ──────────────────────────────────────────────────────────────────

describe('GeminiAdapter.getResumeCommand', () => {
   it('если gemini binary не найден → бросает AdapterError AGENT_NOT_INSTALLED', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (!info?.cliBin) {
         assert.throws(
            () => adapter.getResumeCommand('gemini-testproject'),
            (e) => e instanceof AdapterError && e.code === 'AGENT_NOT_INSTALLED',
         );
      }
   });

   it('если project directory не существует → бросает SESSION_NOT_FOUND', () => {
      const adapter = new GeminiAdapter();
      const info = adapter.detect();
      if (info?.cliBin) {
         // binary найден — несуществующий проект → SESSION_NOT_FOUND
         assert.throws(
            () => adapter.getResumeCommand('gemini-nonexistent-project-xyz-12345'),
            (e) => {
               assert.ok(e instanceof AdapterError, 'должен быть AdapterError');
               assert.equal(e.code, 'SESSION_NOT_FOUND');
               return true;
            },
         );
      }
   });

   it('если project существует → возвращает [bin]', () => {
      const adapter = new GeminiAdapter();
      // Получаем существующие сессии
      adapter.loadSessions({ limit: 1 }).then((sessions) => {
         if (sessions.length > 0 && adapter.detect()?.cliBin) {
            const session = sessions[0];
            const cmd = adapter.getResumeCommand(session.id);
            assert.ok(Array.isArray(cmd), 'должен быть массив');
            assert.ok(cmd.length >= 1, 'должен содержать binary');
         }
      });
   });

   it('никогда не возвращает null — либо массив, либо AdapterError', () => {
      const adapter = new GeminiAdapter();
      try {
         const cmd = adapter.getResumeCommand('gemini-any-project');
         // Если вернул — должен быть массив
         assert.notEqual(cmd, null);
         assert.ok(Array.isArray(cmd));
      } catch (e) {
         // Ошибка должна быть AdapterError
         assert.ok(e instanceof AdapterError, `должен быть AdapterError, получили: ${e}`);
      }
   });
});
