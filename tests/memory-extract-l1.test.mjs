/**
 * Тесты модуля memory/extract-l1.ts — Plan 03-05-03
 * Проверяют buildExtractionPrompt и parseLLMResponse.
 * Только pure-функции (без LLM вызовов).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../dist/memory/extract-l1.js');
const { buildExtractionPrompt, parseLLMResponse } = mod;

// ─── buildExtractionPrompt ────────────────────────────────────────────────────

describe('extract-l1: buildExtractionPrompt', () => {
   it('промпт содержит переданные сообщения', () => {
      const messages = [
         { role: 'user', content: 'Помоги с TypeScript конфигурацией' },
         { role: 'assistant', content: 'Создам tsconfig.json с strict mode' },
      ];
      const prompt = buildExtractionPrompt(messages);
      assert.ok(prompt.includes('Помоги с TypeScript конфигурацией'), 'промпт должен содержать user сообщение');
      assert.ok(prompt.includes('Создам tsconfig.json'), 'промпт должен содержать assistant сообщение');
   });

   it('промпт содержит инструкцию для извлечения JSON', () => {
      const messages = [{ role: 'user', content: 'test' }];
      const prompt = buildExtractionPrompt(messages);
      assert.ok(prompt.includes('JSON'), 'промпт должен упоминать JSON');
      assert.ok(prompt.includes('category'), 'промпт должен содержать поле category');
      assert.ok(prompt.includes('content'), 'промпт должен содержать поле content');
   });

   it('промпт содержит все 6 категорий', () => {
      const messages = [{ role: 'user', content: 'test' }];
      const prompt = buildExtractionPrompt(messages);
      const cats = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
      for (const cat of cats) {
         assert.ok(prompt.includes(cat), `промпт должен содержать категорию "${cat}"`);
      }
   });

   it('формат: role: content для каждого сообщения', () => {
      const messages = [
         { role: 'user', content: 'Hello test message' },
         { role: 'assistant', content: 'Response test message' },
      ];
      const prompt = buildExtractionPrompt(messages);
      assert.ok(prompt.includes('user: Hello test message'), 'формат "user: content"');
      assert.ok(prompt.includes('assistant: Response test message'), 'формат "assistant: content"');
   });

   it('пустой массив сообщений → возвращает строку (не кидает)', () => {
      assert.doesNotThrow(() => buildExtractionPrompt([]));
      const prompt = buildExtractionPrompt([]);
      assert.equal(typeof prompt, 'string');
   });
});

// ─── parseLLMResponse ─────────────────────────────────────────────────────────

describe('extract-l1: parseLLMResponse', () => {
   it('пустой ответ → пустой массив', () => {
      assert.deepEqual(parseLLMResponse(''), []);
      assert.deepEqual(parseLLMResponse('   '), []);
   });

   it('null/undefined → пустой массив', () => {
      assert.deepEqual(parseLLMResponse(null), []);
      assert.deepEqual(parseLLMResponse(undefined), []);
   });

   it('валидный JSON массив → массив кандидатов', () => {
      const response = JSON.stringify([
         { category: 'cases', name: 'auth-fix', content: 'Fixed JWT token expiry issue' },
         { category: 'preferences', name: 'ts-strict', content: 'Always use TypeScript strict mode' },
      ]);
      const result = parseLLMResponse(response);
      assert.equal(result.length, 2);
      assert.equal(result[0].category, 'cases');
      assert.equal(result[0].name, 'auth-fix');
      assert.equal(result[1].category, 'preferences');
   });

   it('JSON внутри markdown блока → корректный массив', () => {
      const response = `Here are the extracted memories:

\`\`\`json
[{"category":"patterns","name":"tdd","content":"Write tests first before implementation"}]
\`\`\`

That's what I found.`;
      const result = parseLLMResponse(response);
      assert.equal(result.length, 1);
      assert.equal(result[0].category, 'patterns');
      assert.equal(result[0].name, 'tdd');
   });

   it('JSON в тексте без markdown → корректный массив', () => {
      const response = 'Based on the conversation: [{"category":"entities","name":"my-service","content":"Main backend service for auth"}] - these are the memories.';
      const result = parseLLMResponse(response);
      assert.equal(result.length, 1);
      assert.equal(result[0].category, 'entities');
   });

   it('кандидат с пустым content → отфильтрован', () => {
      const response = JSON.stringify([
         { category: 'cases', name: 'valid', content: 'Valid non-empty content here' },
         { category: 'cases', name: 'empty-content', content: '' },
         { category: 'cases', name: 'whitespace-content', content: '   ' },
      ]);
      const result = parseLLMResponse(response);
      assert.equal(result.length, 1, 'Только валидный кандидат должен остаться');
      assert.equal(result[0].name, 'valid');
   });

   it('кандидат с неизвестной категорией → отфильтрован', () => {
      const response = JSON.stringify([
         { category: 'cases', name: 'valid', content: 'Valid content' },
         { category: 'unknown-category', name: 'invalid', content: 'Some content' },
         { category: 'CASES', name: 'wrong-case', content: 'Content with wrong case category' },
      ]);
      const result = parseLLMResponse(response);
      assert.equal(result.length, 1, 'Только кандидат с валидной категорией');
      assert.equal(result[0].name, 'valid');
   });

   it('кандидат без обязательных полей → отфильтрован', () => {
      const response = JSON.stringify([
         { category: 'cases', name: 'valid', content: 'Valid content' },
         { category: 'cases', content: 'Missing name field' }, // без name
         { name: 'missing-category', content: 'No category' }, // без category
         { category: 'cases', name: 'no-content' }, // без content
      ]);
      const result = parseLLMResponse(response);
      assert.equal(result.length, 1, 'Только полный валидный кандидат');
   });

   it('невалидный JSON → пустой массив (не throw)', () => {
      assert.doesNotThrow(() => parseLLMResponse('not json at all'));
      assert.deepEqual(parseLLMResponse('not json at all'), []);
   });

   it('массив примитивов → пустой массив', () => {
      const response = JSON.stringify([1, 'string', null, true]);
      const result = parseLLMResponse(response);
      assert.deepEqual(result, []);
   });

   it('все 6 категорий принимаются', () => {
      const cats = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
      const response = JSON.stringify(cats.map((cat) => ({ category: cat, name: `test-${cat}`, content: `Content for ${cat} category` })));
      const result = parseLLMResponse(response);
      assert.equal(result.length, 6, 'Все 6 категорий должны быть приняты');
   });
});
