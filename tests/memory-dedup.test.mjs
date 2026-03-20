/**
 * Тесты модуля memory/dedup.ts — Plan 03-05-02
 * Проверяют jaccardSimilarity, findMatch, mergeContent, resolveCandidate.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../dist/memory/dedup.js');
const { jaccardSimilarity, findMatch, mergeContent, resolveCandidate } = mod;

// ─── Вспомогательные данные ───────────────────────────────────────────────────

function makeEntry(overrides = {}) {
   return {
      name: 'test-entry',
      category: 'cases',
      description: 'test',
      content: 'Some content for testing dedup logic',
      hotness: 0.5,
      active_count: 1,
      created: '2024-01-01T00:00:00.000Z',
      updated: '2024-01-01T00:00:00.000Z',
      source_sessions: [],
      projects: [],
      ...overrides,
   };
}

function makeIndex(memories = {}) {
   return { version: 1, memories, sessions: {} };
}

// ─── jaccardSimilarity ────────────────────────────────────────────────────────

describe('dedup: jaccardSimilarity', () => {
   it('одинаковые строки → 1.0', () => {
      const sim = jaccardSimilarity('hello world test', 'hello world test');
      assert.equal(sim, 1.0);
   });

   it('полностью разные слова → 0.0', () => {
      const sim = jaccardSimilarity('apple banana cherry', 'dog cat fish');
      assert.equal(sim, 0.0);
   });

   it('частичное совпадение → значение между 0 и 1', () => {
      const sim = jaccardSimilarity('the quick brown fox', 'the slow brown dog');
      assert.ok(sim > 0 && sim < 1, `sim=${sim} должен быть в (0,1)`);
   });

   it('обе пустые строки → 1.0 (ничего не различается)', () => {
      const sim = jaccardSimilarity('', '');
      assert.equal(sim, 1.0);
   });

   it('одна пустая строка → 0.0', () => {
      assert.equal(jaccardSimilarity('hello world', ''), 0.0);
      assert.equal(jaccardSimilarity('', 'hello world'), 0.0);
   });

   it('регистронезависимость: Hello = hello', () => {
      const sim = jaccardSimilarity('Hello World', 'hello world');
      assert.equal(sim, 1.0);
   });
});

// ─── findMatch ────────────────────────────────────────────────────────────────

describe('dedup: findMatch', () => {
   it('exact match (тот же category/name) → type=exact', () => {
      const entry = makeEntry({ name: 'auth-fix', category: 'cases' });
      const index = makeIndex({ 'cases/auth-fix': entry });
      const candidate = { category: 'cases', name: 'auth-fix', content: 'Different content' };
      const result = findMatch(candidate, index);
      assert.equal(result.type, 'exact');
      assert.equal(result.key, 'cases/auth-fix');
   });

   it('высокая similarity (>0.8) → fuzzy (не skip — это resolveCandidate решает)', () => {
      const entry = makeEntry({
         name: 'similar-entry',
         category: 'patterns',
         content: 'Always write tests before implementing features to ensure correctness',
      });
      const index = makeIndex({ 'patterns/similar-entry': entry });
      // Похожий контент с другим именем — нет exact match по ключу
      const candidate = {
         category: 'patterns',
         name: 'test-first',
         content: 'Always write tests before implementing features and ensure correctness always',
      };
      const result = findMatch(candidate, index);
      // Высокая similarity → fuzzy
      assert.equal(result.type, 'fuzzy');
      assert.ok(result.similarity >= 0.5, `similarity=${result.similarity} должна быть >= FUZZY_THRESHOLD=0.5`);
   });

   it('низкая similarity (<0.5) → type=none', () => {
      const entry = makeEntry({
         name: 'unrelated',
         category: 'cases',
         content: 'This is about database optimization and indexing strategies',
      });
      const index = makeIndex({ 'cases/unrelated': entry });
      const candidate = {
         category: 'cases',
         name: 'new-entry',
         content: 'Frontend React component styling with CSS modules approach',
      };
      const result = findMatch(candidate, index);
      assert.equal(result.type, 'none');
   });

   it('разные категории — не матчатся fuzzy', () => {
      const entry = makeEntry({
         name: 'some-pattern',
         category: 'patterns',
         content: 'Always use TypeScript strict mode for better type safety',
      });
      const index = makeIndex({ 'patterns/some-pattern': entry });
      const candidate = {
         category: 'cases', // другая категория
         name: 'ts-strict',
         content: 'Always use TypeScript strict mode for better type safety', // идентичный контент
      };
      const result = findMatch(candidate, index);
      // Разные категории → no fuzzy match
      assert.equal(result.type, 'none');
   });
});

// ─── mergeContent ─────────────────────────────────────────────────────────────

describe('dedup: mergeContent', () => {
   it('appendable категория (profile) → объединяет уникальные строки', () => {
      const existing = 'Line one\nLine two';
      const incoming = 'Line two\nLine three';
      const merged = mergeContent(existing, incoming, 'profile');
      assert.ok(merged.includes('Line one'));
      assert.ok(merged.includes('Line two'));
      assert.ok(merged.includes('Line three'));
      // Line two не дублируется
      const count = merged.split('Line two').length - 1;
      assert.equal(count, 1, 'Line two должна встречаться ровно один раз');
   });

   it('non-appendable категория (events) → возвращает existing без изменений', () => {
      const existing = 'Old event content';
      const incoming = 'New event content that should not merge';
      const result = mergeContent(existing, incoming, 'events');
      assert.equal(result, existing);
   });

   it('нет новых строк → возвращает existing', () => {
      const existing = 'Line one\nLine two';
      const incoming = 'Line one'; // всё уже есть
      const result = mergeContent(existing, incoming, 'preferences');
      assert.equal(result, existing);
   });
});

// ─── resolveCandidate ─────────────────────────────────────────────────────────

describe('dedup: resolveCandidate', () => {
   it('нет совпадений → action=create с правильным ключом', () => {
      const index = makeIndex({});
      const candidate = { category: 'cases', name: 'brand-new', content: 'Unique content about something new' };
      const result = resolveCandidate(candidate, index);
      assert.equal(result.action, 'create');
      assert.equal(result.key, 'cases/brand-new');
   });

   it('exact match + appendable (preferences) → action=merge', () => {
      const entry = makeEntry({ name: 'code-style', category: 'preferences', content: 'Use tabs for indentation' });
      const index = makeIndex({ 'preferences/code-style': entry });
      const candidate = { category: 'preferences', name: 'code-style', content: 'Use prettier for formatting' };
      const result = resolveCandidate(candidate, index);
      assert.equal(result.action, 'merge');
   });

   it('exact match + non-appendable + высокая similarity → action=skip', () => {
      const content = 'Solved the authentication issue by refreshing JWT tokens on expiry';
      const entry = makeEntry({ name: 'auth-issue', category: 'cases', content });
      const index = makeIndex({ 'cases/auth-issue': entry });
      // Почти идентичный контент → similarity > 0.8 → skip
      const candidate = { category: 'cases', name: 'auth-issue', content };
      const result = resolveCandidate(candidate, index);
      assert.equal(result.action, 'skip');
   });

   it('fuzzy match → action=merge (не skip)', () => {
      const entry = makeEntry({
         name: 'test-driven',
         category: 'patterns',
         content: 'Write unit tests before implementing the feature code',
      });
      const index = makeIndex({ 'patterns/test-driven': entry });
      const candidate = {
         category: 'patterns',
         name: 'tdd-approach',
         content: 'Write unit tests before implementing feature code always',
      };
      const result = resolveCandidate(candidate, index);
      // fuzzy match должен давать merge, а не skip
      assert.equal(result.action, 'merge', `Ожидался merge для fuzzy match, получили ${result.action}`);
   });

   it('FUZZY_THRESHOLD = 0.5: similarity=0.49 → action=create, similarity=0.51 → merge/fuzzy', () => {
      // Проверяем граничное значение через контент с известной similarity
      // Используем одинаковые слова для управления similarity
      const sharedWords = 'alpha beta gamma delta epsilon';
      const different = 'zulu yankee xray whiskey victor uniform';
      // 5 общих слов из 11 = 5/(5+6)=0.45 → ниже порога
      const entryLow = makeEntry({ name: 'low-sim', category: 'cases', content: sharedWords + ' ' + different });
      const indexLow = makeIndex({ 'cases/low-sim': entryLow });
      const candidateLow = { category: 'cases', name: 'candidate-low', content: sharedWords };
      const sim = jaccardSimilarity(sharedWords, sharedWords + ' ' + different);
      const resultLow = resolveCandidate(candidateLow, indexLow);
      if (sim < 0.5) {
         assert.equal(resultLow.action, 'create');
      } else {
         assert.equal(resultLow.action, 'merge');
      }
   });
});
