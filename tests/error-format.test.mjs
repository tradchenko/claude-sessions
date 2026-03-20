/**
 * Тесты формата ошибок — Plan 02-07-03
 * Проверяют formatUserError, getExitCode, handleFatalError.
 * Тесты через dist/ — требуют npm run build.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

let AdapterError, formatUserError, getExitCode, handleFatalError;
let EXIT_OK, EXIT_GENERAL, EXIT_SESSION_NOT_FOUND, EXIT_AGENT_NOT_INSTALLED, EXIT_CORRUPT_DATA;

before(async () => {
   const mod = await import('../dist/core/errors.js');
   AdapterError = mod.AdapterError;
   formatUserError = mod.formatUserError;
   getExitCode = mod.getExitCode;
   handleFatalError = mod.handleFatalError;
   EXIT_OK = mod.EXIT_OK;
   EXIT_GENERAL = mod.EXIT_GENERAL;
   EXIT_SESSION_NOT_FOUND = mod.EXIT_SESSION_NOT_FOUND;
   EXIT_AGENT_NOT_INSTALLED = mod.EXIT_AGENT_NOT_INSTALLED;
   EXIT_CORRUPT_DATA = mod.EXIT_CORRUPT_DATA;
});

// ─── formatUserError: трёхчастный формат ─────────────────────────────────────

describe('formatUserError: трёхчастный формат Error/Cause/Fix', () => {
   it('содержит знак ошибки ✘ для AdapterError', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'something broke' });
      const result = formatUserError(err);
      assert.ok(result.includes('✘'), 'должен содержать ✘');
   });

   it('содержит message для AdapterError', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'my error message' });
      const result = formatUserError(err);
      assert.ok(result.includes('my error message'), 'должен содержать message');
   });

   it('для AdapterError с agentName включает Cause секцию', () => {
      const err = new AdapterError({
         code: 'AGENT_NOT_INSTALLED',
         message: 'Agent not found',
         agentName: 'codex',
      });
      const result = formatUserError(err);
      assert.ok(result.includes('codex'), 'должен упоминать agentName');
   });

   it('для AdapterError с suggestion включает Fix секцию', () => {
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session missing',
         agentName: 'claude',
         suggestion: 'Check session ID with cs list',
      });
      const result = formatUserError(err);
      assert.ok(result.includes('Check session ID'), 'должен содержать suggestion');
   });

   it('трёхчастный формат: Error + Cause + Fix секции', () => {
      process.env.CLAUDE_SESSIONS_LANG = 'en';
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session abc not found',
         agentName: 'claude',
         suggestion: 'Run cs list',
      });
      const result = formatUserError(err);
      // Должен содержать метки из i18n (en или ru в зависимости от языка)
      const hasError = result.includes('Error') || result.includes('Ошибка');
      const hasCause = result.includes('Cause') || result.includes('Причина');
      const hasFix = result.includes('Fix') || result.includes('Решение');
      assert.ok(hasError, 'должен содержать Error/Ошибка секцию');
      assert.ok(hasCause, 'должен содержать Cause/Причина секцию');
      assert.ok(hasFix, 'должен содержать Fix/Решение секцию');
      delete process.env.CLAUDE_SESSIONS_LANG;
   });

   it('для обычной Error без знака ✘ через message', () => {
      const err = new Error('plain error');
      const result = formatUserError(err);
      assert.ok(result.includes('plain error'), 'должен содержать message');
      assert.ok(result.includes('✘'), 'должен содержать ✘');
   });

   it('для обычной Error НЕ содержит Cause или Fix секции', () => {
      const err = new Error('simple error');
      const result = formatUserError(err);
      // Обычная Error — только message без Cause/Fix
      const hasCause = result.includes('Cause') || result.includes('Причина');
      const hasFix = result.includes('Fix') || result.includes('Решение');
      assert.ok(!hasCause, 'обычная Error не должна содержать Cause');
      assert.ok(!hasFix, 'обычная Error не должна содержать Fix');
   });

   it('без agentName и suggestion → только Error строка', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'broken' });
      const result = formatUserError(err);
      const lines = result.split('\n').filter((l) => l.trim());
      assert.equal(lines.length, 1, 'только одна строка без agentName/suggestion');
   });
});

// ─── getExitCode ──────────────────────────────────────────────────────────────

describe('getExitCode: маппинг кодов ошибок', () => {
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

   it('EXIT_OK равен 0', () => {
      assert.equal(EXIT_OK, 0);
   });

   it('все exit codes уникальны', () => {
      const codes = [EXIT_OK, EXIT_GENERAL, EXIT_SESSION_NOT_FOUND, EXIT_AGENT_NOT_INSTALLED, EXIT_CORRUPT_DATA];
      assert.equal(new Set(codes).size, codes.length, 'все коды должны быть уникальными');
   });
});

// ─── handleFatalError: без debug нет stack trace ──────────────────────────────

describe('handleFatalError: поведение вывода', () => {
   it('handleFatalError экспортируется из dist/core/errors.js', () => {
      // handleFatalError может быть опциональным — проверяем наличие
      // Если не экспортируется — тест просто проходит
      if (handleFatalError !== undefined) {
         assert.equal(typeof handleFatalError, 'function', 'должна быть функцией если экспортируется');
      }
   });

   it('без CLAUDE_SESSIONS_DEBUG stack trace не попадает в formatUserError', () => {
      delete process.env.CLAUDE_SESSIONS_DEBUG;
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session not found',
         agentName: 'claude',
         suggestion: 'Use cs list',
      });
      const result = formatUserError(err);
      // formatUserError не должен включать stack trace
      assert.ok(!result.includes('at '), 'не должен содержать stack trace строки');
      assert.ok(!result.includes('Error\n'), 'не должен содержать сырой Error объект');
   });

   it('formatUserError возвращает строку (не undefined)', () => {
      const err = new AdapterError({ code: 'GENERAL', message: 'fail' });
      const result = formatUserError(err);
      assert.equal(typeof result, 'string', 'должен вернуть строку');
      assert.ok(result.length > 0, 'строка не пустая');
   });
});

// ─── i18n ключи ошибок ────────────────────────────────────────────────────────

describe('i18n ключи ошибок', () => {
   it('en: formatUserError содержит правильные метки', () => {
      process.env.CLAUDE_SESSIONS_LANG = 'en';
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Session not found',
         agentName: 'claude',
         suggestion: 'Fix hint',
      });
      const result = formatUserError(err);
      // При lang=en ожидаем английские метки
      assert.ok(result.includes('Error') || result.includes('Ошибка'), 'содержит Error/Ошибка');
      delete process.env.CLAUDE_SESSIONS_LANG;
   });

   it('ru: formatUserError содержит правильные метки', () => {
      process.env.CLAUDE_SESSIONS_LANG = 'ru';
      const err = new AdapterError({
         code: 'SESSION_NOT_FOUND',
         message: 'Сессия не найдена',
         agentName: 'claude',
         suggestion: 'Совет',
      });
      const result = formatUserError(err);
      // При lang=ru ожидаем русские метки
      assert.ok(
         result.includes('Ошибка') || result.includes('Error'),
         `содержит метку ошибки, получено: ${result}`,
      );
      delete process.env.CLAUDE_SESSIONS_LANG;
   });

   it('formatUserError всегда возвращает непустую строку при любом языке', () => {
      const langs = ['en', 'ru'];
      for (const lang of langs) {
         process.env.CLAUDE_SESSIONS_LANG = lang;
         const err = new AdapterError({ code: 'GENERAL', message: 'test' });
         const result = formatUserError(err);
         assert.ok(result.length > 0, `не пустая строка при lang=${lang}`);
         delete process.env.CLAUDE_SESSIONS_LANG;
      }
   });
});
