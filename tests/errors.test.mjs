/**
 * Тесты модуля структурированных ошибок (src/core/errors.ts).
 * Проверяют форматирование, exit codes и handleFatalError.
 * Запускаются через dist/ — требуют npm run build перед запуском.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Динамический импорт из dist/ (проект компилируется в ESM)
let AdapterError, formatUserError, getExitCode;
let EXIT_OK, EXIT_GENERAL, EXIT_SESSION_NOT_FOUND, EXIT_AGENT_NOT_INSTALLED, EXIT_CORRUPT_DATA;

before(async () => {
   const mod = await import('../dist/core/errors.js');
   AdapterError = mod.AdapterError;
   formatUserError = mod.formatUserError;
   getExitCode = mod.getExitCode;
   EXIT_OK = mod.EXIT_OK;
   EXIT_GENERAL = mod.EXIT_GENERAL;
   EXIT_SESSION_NOT_FOUND = mod.EXIT_SESSION_NOT_FOUND;
   EXIT_AGENT_NOT_INSTALLED = mod.EXIT_AGENT_NOT_INSTALLED;
   EXIT_CORRUPT_DATA = mod.EXIT_CORRUPT_DATA;
});

describe('exit codes', () => {
   it('EXIT_OK равен 0', () => assert.equal(EXIT_OK, 0));
   it('EXIT_GENERAL равен 1', () => assert.equal(EXIT_GENERAL, 1));
   it('EXIT_SESSION_NOT_FOUND равен 2', () => assert.equal(EXIT_SESSION_NOT_FOUND, 2));
   it('EXIT_AGENT_NOT_INSTALLED равен 3', () => assert.equal(EXIT_AGENT_NOT_INSTALLED, 3));
   it('EXIT_CORRUPT_DATA равен 4', () => assert.equal(EXIT_CORRUPT_DATA, 4));
   it('все коды уникальны', () => {
      const codes = [EXIT_OK, EXIT_GENERAL, EXIT_SESSION_NOT_FOUND, EXIT_AGENT_NOT_INSTALLED, EXIT_CORRUPT_DATA];
      assert.equal(new Set(codes).size, codes.length);
   });
});

describe('AdapterError', () => {
   it('является подклассом Error', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'test' });
      assert.ok(err instanceof Error);
      assert.ok(err instanceof AdapterError);
   });

   it('сохраняет code, message, agentName, suggestion', () => {
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session abc not found',
         agentName: 'claude',
         suggestion: 'Check session ID',
      });
      assert.equal(err.code, 'SESSION_NOT_FOUND');
      assert.equal(err.message, 'Session abc not found');
      assert.equal(err.agentName, 'claude');
      assert.equal(err.suggestion, 'Check session ID');
   });

   it('agentName и suggestion по умолчанию пустые строки', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'fail' });
      assert.equal(err.agentName, '');
      assert.equal(err.suggestion, '');
   });

   it('name равен AdapterError', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'fail' });
      assert.equal(err.name, 'AdapterError');
   });
});

describe('getExitCode', () => {
   it('SESSION_NOT_FOUND → EXIT_SESSION_NOT_FOUND (2)', () => {
      const err = new AdapterError({ code: 'SESSION_NOT_FOUND', message: 'x' });
      assert.equal(getExitCode(err), EXIT_SESSION_NOT_FOUND);
      assert.equal(getExitCode(err), 2);
   });

   it('AGENT_NOT_INSTALLED → EXIT_AGENT_NOT_INSTALLED (3)', () => {
      const err = new AdapterError({ code: 'AGENT_NOT_INSTALLED', message: 'x' });
      assert.equal(getExitCode(err), EXIT_AGENT_NOT_INSTALLED);
      assert.equal(getExitCode(err), 3);
   });

   it('CORRUPT_DATA → EXIT_CORRUPT_DATA (4)', () => {
      const err = new AdapterError({ code: 'CORRUPT_DATA', message: 'x' });
      assert.equal(getExitCode(err), EXIT_CORRUPT_DATA);
      assert.equal(getExitCode(err), 4);
   });

   it('RESUME_NOT_SUPPORTED → EXIT_GENERAL (1)', () => {
      const err = new AdapterError({ code: 'RESUME_NOT_SUPPORTED', message: 'x' });
      assert.equal(getExitCode(err), EXIT_GENERAL);
      assert.equal(getExitCode(err), 1);
   });

   it('GENERAL → EXIT_GENERAL (1)', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'x' });
      assert.equal(getExitCode(err), EXIT_GENERAL);
      assert.equal(getExitCode(err), 1);
   });
});

describe('formatUserError', () => {
   it('для обычной Error — только message со знаком ✘', () => {
      const err = new Error('something went wrong');
      const result = formatUserError(err);
      assert.ok(result.includes('✘'));
      assert.ok(result.includes('something went wrong'));
   });

   it('для AdapterError без agentName/suggestion — только Error строка', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'session broken' });
      const result = formatUserError(err);
      assert.ok(result.includes('✘'));
      assert.ok(result.includes('session broken'));
   });

   it('для AdapterError с agentName включает Cause', () => {
      const err = new AdapterError({ code: 'AGENT_NOT_INSTALLED', message: 'Agent not found', agentName: 'codex' });
      const result = formatUserError(err);
      assert.ok(result.includes('codex'));
   });

   it('для AdapterError с suggestion включает Fix', () => {
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session missing',
         agentName: 'claude',
         suggestion: 'Check session ID',
      });
      const result = formatUserError(err);
      assert.ok(result.includes('Check session ID'));
   });

   it('трёхчастный формат: содержит Error, Cause, Fix строки', () => {
      process.env.CLAUDE_SESSIONS_LANG = 'en';
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session abc not found',
         agentName: 'claude',
         suggestion: 'Check ID',
      });
      const result = formatUserError(err);
      // Должен содержать метки из i18n
      assert.ok(result.includes('Error') || result.includes('Ошибка'));
      assert.ok(result.includes('Cause') || result.includes('Причина'));
      assert.ok(result.includes('Fix') || result.includes('Решение'));
      delete process.env.CLAUDE_SESSIONS_LANG;
   });
});
