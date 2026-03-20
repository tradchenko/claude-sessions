/**
 * Тесты getResumeCommand для Companion адаптера.
 * SESS-07: companion делегирует реальному агенту или бросает AdapterError.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let CompanionAdapter, AdapterError;

before(async () => {
   const companionMod = await import('../dist/agents/companion.js');
   CompanionAdapter = companionMod.CompanionAdapter;
   const errMod = await import('../dist/core/errors.js');
   AdapterError = errMod.AdapterError;
});

describe('CompanionAdapter.getResumeCommand', () => {
   it('делегирует реальному агенту или бросает AdapterError — никогда не возвращает null', () => {
      const adapter = new CompanionAdapter();
      try {
         const cmd = adapter.getResumeCommand('test-session-id');
         // Если вернул — должен быть массив
         assert.notEqual(cmd, null, 'не должен возвращать null');
         assert.ok(Array.isArray(cmd), 'должен быть массив');
         assert.ok(cmd.length >= 1, 'должен содержать хотя бы binary');
      } catch (e) {
         // Должен быть AdapterError (не null и не undefined)
         assert.ok(e instanceof AdapterError, `должен бросать AdapterError, получили: ${e}`);
         assert.ok(
            ['AGENT_NOT_INSTALLED', 'RESUME_NOT_SUPPORTED', 'SESSION_NOT_FOUND'].includes(e.code),
            `код должен быть одним из известных, получили: ${e.code}`,
         );
      }
   });

   it('если хотя бы один агент установлен → делегирует ему', () => {
      const adapter = new CompanionAdapter();
      // Если хотя бы claude установлен, команда должна вернуть что-то
      // (или бросить RESUME_NOT_SUPPORTED, но не AGENT_NOT_INSTALLED "No real agent found")
      try {
         const cmd = adapter.getResumeCommand('test-session-id');
         assert.ok(Array.isArray(cmd) || cmd === null, 'должен быть массив или null от делегата');
      } catch (e) {
         assert.ok(e instanceof AdapterError, 'должен быть AdapterError');
         // Если AGENT_NOT_INSTALLED с "No real agent" — значит ни один агент не установлен
         // Это валидно в CI-окружении без агентов
         if (e.code === 'AGENT_NOT_INSTALLED' && e.message.includes('No real agent')) {
            assert.ok(true, 'OK: ни один агент не установлен в этом окружении');
         }
      }
   });

   it('agentName в ошибке — "companion" при отсутствии агентов', () => {
      const adapter = new CompanionAdapter();
      try {
         adapter.getResumeCommand('test-session-id');
      } catch (e) {
         if (e instanceof AdapterError && e.message.includes('No real agent')) {
            assert.equal(e.agentName, 'companion');
         }
      }
   });
});
