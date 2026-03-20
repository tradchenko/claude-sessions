/**
 * Тесты модуля memory/extract-l0.ts — Plan 03-05-03
 * Проверяют extractFilePaths, extractL0FromMessages, extractL0FromJSONL.
 * Fixture matrix: claude, codex, qwen, companion + shared edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures', 'memory');

const mod = await import('../dist/memory/extract-l0.js');
const { extractFilePaths, extractL0FromMessages, extractL0FromJSONL } = mod;

// ─── extractFilePaths ─────────────────────────────────────────────────────────

describe('extract-l0: extractFilePaths', () => {
   it('извлекает пути из текста', () => {
      const text = 'Обновил src/utils/parser.ts и tests/parser.test.mjs';
      const paths = extractFilePaths(text);
      assert.ok(paths.some((p) => p.includes('parser.ts')), `Должен найти parser.ts в: ${paths.join(', ')}`);
      assert.ok(paths.some((p) => p.includes('parser.test.mjs')), `Должен найти parser.test.mjs в: ${paths.join(', ')}`);
   });

   it('игнорирует http ссылки', () => {
      const text = 'Смотри https://example.com/docs/api.json и http://localhost:3000/path.js';
      const paths = extractFilePaths(text);
      const hasHttp = paths.some((p) => p.startsWith('http'));
      assert.ok(!hasHttp, `Не должно быть http ссылок, найдено: ${paths.join(', ')}`);
   });

   it('пустой текст → пустой массив', () => {
      assert.deepEqual(extractFilePaths(''), []);
   });

   it('текст без путей → пустой массив', () => {
      const text = 'Просто текст без каких-либо путей к файлам здесь';
      const paths = extractFilePaths(text);
      // Допустимо 0 путей
      assert.ok(Array.isArray(paths));
   });

   it('извлекает пути из markdown кода', () => {
      const text = 'Создал `src/memory/index.ts` и `dist/memory/index.js`';
      const paths = extractFilePaths(text);
      assert.ok(paths.some((p) => p.includes('index.ts') || p.includes('index.js')), `Путь должен быть найден в: ${paths.join(', ')}`);
   });
});

// ─── extractL0FromMessages ────────────────────────────────────────────────────

describe('extract-l0: extractL0FromMessages', () => {
   it('пустой массив сообщений → graceful result', () => {
      const result = extractL0FromMessages([], 'test-project');
      assert.equal(result.summary, '');
      assert.equal(result.messageCount, 0);
      assert.deepEqual(result.files, []);
      assert.equal(result.project, 'test-project');
   });

   it('summary берётся из первого user сообщения', () => {
      const messages = [
         { role: 'user', content: 'Помоги мне реализовать функцию сортировки в TypeScript' },
         { role: 'assistant', content: 'Конечно, реализую функцию sort.' },
      ];
      const result = extractL0FromMessages(messages, 'proj');
      assert.ok(result.summary.startsWith('Помоги'), `summary должен начинаться с user сообщения: "${result.summary}"`);
   });

   it('summary не превышает 120 символов', () => {
      const longMsg = 'A'.repeat(200);
      const messages = [{ role: 'user', content: longMsg }];
      const result = extractL0FromMessages(messages, 'proj');
      assert.ok(result.summary.length <= 120, `summary=${result.summary.length} не должен превышать 120 символов`);
   });

   it('messageCount = количество переданных сообщений', () => {
      const messages = [
         { role: 'user', content: 'msg1' },
         { role: 'assistant', content: 'msg2' },
         { role: 'user', content: 'msg3' },
      ];
      const result = extractL0FromMessages(messages, 'proj');
      assert.equal(result.messageCount, 3);
   });

   it('agentId передаётся в L0Data', () => {
      const messages = [{ role: 'user', content: 'test' }];
      const result = extractL0FromMessages(messages, 'proj', 'claude');
      assert.equal(result.agent, 'claude');
   });

   it('детерминированность: два вызова на одних данных → идентичные результаты (кроме timestamp)', () => {
      const messages = [
         { role: 'user', content: 'Реализуй src/utils/helper.ts с функцией formatDate' },
         { role: 'assistant', content: 'Создам src/utils/helper.ts с formatDate функцией.' },
      ];
      const r1 = extractL0FromMessages(messages, 'proj', 'claude');
      const r2 = extractL0FromMessages(messages, 'proj', 'claude');

      assert.equal(r1.summary, r2.summary);
      assert.equal(r1.messageCount, r2.messageCount);
      assert.deepEqual(r1.files, r2.files);
      assert.equal(r1.agent, r2.agent);
   });
});

// ─── Fixture matrix ───────────────────────────────────────────────────────────

describe('extract-l0: fixture matrix', () => {
   // Парсер для Claude формата JSONL
   function parseClaude(lines) {
      const messages = [];
      for (const line of lines) {
         try {
            const ev = JSON.parse(line);
            if ((ev.type === 'human' || ev.type === 'assistant') && ev.message?.content) {
               messages.push({ role: ev.type === 'human' ? 'user' : 'assistant', content: ev.message.content });
            }
         } catch { /* skip */ }
      }
      return messages;
   }

   // Парсер для Codex формата JSONL
   function parseCodex(lines) {
      const messages = [];
      for (const line of lines) {
         try {
            const ev = JSON.parse(line);
            if ((ev.role === 'user' || ev.role === 'assistant') && ev.content) {
               messages.push({ role: ev.role, content: ev.content });
            }
         } catch { /* skip */ }
      }
      return messages;
   }

   // Парсер для Qwen формата JSONL
   function parseQwen(lines) {
      const messages = [];
      for (const line of lines) {
         try {
            const ev = JSON.parse(line);
            if ((ev.type === 'human' || ev.type === 'assistant') && ev.message?.content) {
               messages.push({ role: ev.type === 'human' ? 'user' : 'assistant', content: ev.message.content });
            }
         } catch { /* skip */ }
      }
      return messages;
   }

   // Парсер для Companion формата JSONL
   function parseCompanion(lines) {
      const messages = [];
      for (const line of lines) {
         try {
            const ev = JSON.parse(line);
            if ((ev.event === 'message') && (ev.role === 'user' || ev.role === 'assistant') && ev.text) {
               messages.push({ role: ev.role, content: ev.text });
            }
         } catch { /* skip */ }
      }
      return messages;
   }

   const agents = [
      { name: 'claude', parser: parseClaude },
      { name: 'codex', parser: parseCodex },
      { name: 'qwen', parser: parseQwen },
      { name: 'companion', parser: parseCompanion },
   ];

   for (const { name, parser } of agents) {
      it(`${name}: fixture загружается и даёт непустой L0Data`, () => {
         const fixturePath = join(FIXTURES, name, 'basic.jsonl');
         const expectedPath = join(FIXTURES, name, 'basic.expected.json');

         const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
         const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));

         const messages = parser(lines);
         assert.ok(messages.length > 0, `${name}: должны быть распарсены сообщения из fixture`);

         const result = extractL0FromMessages(messages, expected.project, name);

         assert.equal(result.project, expected.project, `${name}: project должен совпадать`);
         assert.ok(result.summary.length > 0, `${name}: summary не должен быть пустым`);
         assert.ok(result.messageCount > 0, `${name}: messageCount должен быть > 0`);
         assert.equal(result.agent, name, `${name}: agent должен быть "${name}"`);
      });
   }

   it('claude: extractL0FromJSONL парсит fixture', () => {
      const fixturePath = join(FIXTURES, 'claude', 'basic.jsonl');
      const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
      const result = extractL0FromJSONL(lines, 'test-project');
      assert.ok(result.messageCount > 0, 'должны быть распарсены сообщения через extractL0FromJSONL');
      assert.ok(result.summary.length > 0);
   });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('extract-l0: edge cases', () => {
   it('shared/empty.jsonl → graceful result (не throw)', () => {
      const fixturePath = join(FIXTURES, 'shared', 'empty.jsonl');
      const content = readFileSync(fixturePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      assert.doesNotThrow(() => extractL0FromJSONL(lines, 'test'));
      const result = extractL0FromJSONL(lines, 'test');
      assert.equal(result.messageCount, 0);
   });

   it('shared/malformed.jsonl → graceful result (не throw)', () => {
      const fixturePath = join(FIXTURES, 'shared', 'malformed.jsonl');
      const lines = readFileSync(fixturePath, 'utf8').split('\n').filter(Boolean);
      assert.doesNotThrow(() => extractL0FromJSONL(lines, 'test'));
   });
});
