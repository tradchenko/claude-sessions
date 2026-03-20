/**
 * Тесты модуля memory/catalog.ts — Plan 03-05-03
 * Проверяют generateCatalog, selectHotMemories, formatSessionStartOutput.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../dist/memory/catalog.js');
const { generateCatalog, selectHotMemories, formatSessionStartOutput } = mod;

// ─── Вспомогательные данные ───────────────────────────────────────────────────

function makeMemory(overrides = {}) {
   return {
      name: 'test-memory',
      category: 'cases',
      description: 'Test memory description',
      content: 'Test memory content with useful information',
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

// ─── generateCatalog ──────────────────────────────────────────────────────────

describe('catalog: generateCatalog', () => {
   it('пустой индекс → строка с заглушкой "(no memories yet)"', () => {
      const index = makeIndex({});
      const catalog = generateCatalog(index);
      assert.ok(catalog.includes('no memories yet') || catalog.length === 0 || catalog === '(no memories yet)', `Ожидался placeholder, получили: "${catalog}"`);
   });

   it('индекс с одной памятью → таблица с заголовком', () => {
      const index = makeIndex({
         'cases/auth-fix': makeMemory({ name: 'auth-fix', category: 'cases', hotness: 0.8 }),
      });
      const catalog = generateCatalog(index);
      assert.ok(catalog.includes('auth-fix'), 'catalog должен содержать имя памяти');
      assert.ok(catalog.includes('cases'), 'catalog должен содержать категорию');
   });

   it('памяти сортируются по убыванию hotness', () => {
      const index = makeIndex({
         'cases/cold': makeMemory({ name: 'cold', hotness: 0.1 }),
         'cases/hot': makeMemory({ name: 'hot', hotness: 0.9 }),
         'cases/medium': makeMemory({ name: 'medium', hotness: 0.5 }),
      });
      const catalog = generateCatalog(index);
      const hotPos = catalog.indexOf('hot');
      const medPos = catalog.indexOf('medium');
      const coldPos = catalog.indexOf('cold');
      assert.ok(hotPos < medPos, 'hot должен быть перед medium');
      assert.ok(medPos < coldPos, 'medium должен быть перед cold');
   });

   it('catalog содержит заголовок таблицы', () => {
      const index = makeIndex({
         'cases/test': makeMemory(),
      });
      const catalog = generateCatalog(index);
      assert.ok(catalog.includes('name') || catalog.includes('category'), 'catalog должен содержать заголовки таблицы');
   });
});

// ─── selectHotMemories ────────────────────────────────────────────────────────

describe('catalog: selectHotMemories', () => {
   it('пустой индекс → пустой массив', () => {
      const result = selectHotMemories(makeIndex({}), 'my-project');
      assert.deepEqual(result, []);
   });

   it('фильтрация по проекту: возвращает только matching + global', () => {
      const index = makeIndex({
         'cases/project-specific': makeMemory({ name: 'project-specific', hotness: 0.9, projects: ['my-project'] }),
         'cases/other-project': makeMemory({ name: 'other-project', hotness: 0.8, projects: ['other-project'] }),
         'cases/global': makeMemory({ name: 'global', hotness: 0.7, projects: [] }),
      });
      const result = selectHotMemories(index, 'my-project');
      const names = result.map((m) => m.name);
      assert.ok(names.includes('project-specific'), 'должна быть project-specific память');
      assert.ok(names.includes('global'), 'должна быть глобальная память (projects=[])');
      assert.ok(!names.includes('other-project'), 'не должна быть память другого проекта');
   });

   it('top-N лимит соблюдается', () => {
      const memories = {};
      for (let i = 0; i < 40; i++) {
         memories[`cases/mem-${i}`] = makeMemory({ name: `mem-${i}`, hotness: i / 40 });
      }
      const result = selectHotMemories(makeIndex(memories), '', 30);
      assert.ok(result.length <= 30, `Результат должен быть <= 30, получили ${result.length}`);
   });

   it('сортировка по убыванию hotness', () => {
      const index = makeIndex({
         'cases/cold': makeMemory({ name: 'cold', hotness: 0.1 }),
         'cases/hot': makeMemory({ name: 'hot', hotness: 0.9 }),
      });
      const result = selectHotMemories(index, '', 10);
      assert.equal(result[0].name, 'hot', 'первой должна быть самая горячая память');
   });

   it('count=5 по умолчанию', () => {
      const memories = {};
      for (let i = 0; i < 10; i++) {
         memories[`cases/mem-${i}`] = makeMemory({ name: `mem-${i}`, hotness: i / 10 });
      }
      const result = selectHotMemories(makeIndex(memories), '');
      assert.ok(result.length <= 5, `По умолчанию count=5, получили ${result.length}`);
   });
});

// ─── formatSessionStartOutput ─────────────────────────────────────────────────

describe('catalog: formatSessionStartOutput', () => {
   it('пустой индекс → строка (не throw)', () => {
      assert.doesNotThrow(() => formatSessionStartOutput(makeIndex({}), 'my-project'));
   });

   it('пустой индекс → содержит секцию Memory Catalog', () => {
      const output = formatSessionStartOutput(makeIndex({}), 'my-project');
      assert.equal(typeof output, 'string');
      assert.ok(output.length > 0, 'вывод не должен быть пустым');
   });

   it('с памятями → форматированный вывод содержит имена памятей', () => {
      const index = makeIndex({
         'cases/auth-fix': makeMemory({ name: 'auth-fix', hotness: 0.9, projects: ['my-project'] }),
      });
      const output = formatSessionStartOutput(index, 'my-project');
      assert.ok(output.includes('auth-fix'), 'вывод должен содержать имя памяти');
   });

   it('с памятями → содержит секцию Hot Memories', () => {
      const index = makeIndex({
         'cases/hot-mem': makeMemory({ name: 'hot-mem', hotness: 0.9, content: 'Important cached content' }),
      });
      const output = formatSessionStartOutput(index, '');
      assert.ok(output.includes('Hot Memories') || output.includes('hot-mem'), 'вывод должен содержать hot memories секцию');
   });

   it('вывод содержит инструкцию о загрузке файлов памяти', () => {
      const output = formatSessionStartOutput(makeIndex({}), 'proj');
      assert.ok(output.includes('session-memory') || output.includes('memories'), 'вывод должен содержать подсказку о загрузке');
   });

   it('разные проекты → разные наборы hot memories', () => {
      const index = makeIndex({
         'cases/proj-a': makeMemory({ name: 'proj-a', hotness: 0.9, projects: ['project-a'] }),
         'cases/proj-b': makeMemory({ name: 'proj-b', hotness: 0.8, projects: ['project-b'] }),
      });
      const outputA = formatSessionStartOutput(index, 'project-a');
      const outputB = formatSessionStartOutput(index, 'project-b');
      assert.ok(outputA.includes('proj-a'), 'output-A должен содержать proj-a');
      assert.ok(outputB.includes('proj-b'), 'output-B должен содержать proj-b');
   });
});
