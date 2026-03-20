/**
 * Тесты парсинга JSONL edge cases на fixture-файлах.
 * Документируют ТЕКУЩЕЕ поведение парсера (snapshot before refactor).
 * Не импортируют из dist/ — тестируют логику inline через fs + JSON.parse.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

/**
 * Парсит JSONL строки: возвращает только валидные объекты, невалидные пропускает.
 * @param {string} content - содержимое JSONL файла
 * @returns {Array<object>} массив успешно распарсенных объектов
 */
function parseJsonlContent(content) {
   // Убираем BOM если есть
   const clean = content.startsWith('\uFEFF') ? content.slice(1) : content;
   return clean
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
         try {
            return [JSON.parse(line)];
         } catch {
            return [];
         }
      });
}

describe('DATA-01: невалидные строки пропускаются', () => {
   it('парсит только валидные строки из invalid-lines.jsonl', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'invalid-lines.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      // Только 3 валидных JSON объекта должны вернуться
      assert.equal(result.length, 3);
      assert.equal(result[0].sessionId, 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001');
      assert.equal(result[1].sessionId, 'aaaa2222-bbbb-cccc-dddd-eeeeeeee0002');
      assert.equal(result[2].sessionId, 'aaaa3333-bbbb-cccc-dddd-eeeeeeee0003');
   });

   it('plain text строки не попадают в результат', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'invalid-lines.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      // Ни один результат не должен быть строкой
      for (const item of result) {
         assert.equal(typeof item, 'object');
         assert.notEqual(item, null);
      }
   });
});

describe('DATA-04: обрезанный файл обрабатывается корректно', () => {
   it('обрезанная строка пропускается, остальные парсятся', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'truncated.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      // 3 валидных строки + 1 обрезанная (невалидный JSON) = 3 результата
      assert.equal(result.length, 3);
      assert.equal(result[0].sessionId, 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001');
      assert.equal(result[2].sessionId, 'aaaa3333-bbbb-cccc-dddd-eeeeeeee0003');
   });

   it('обрезанная строка не вызывает исключение', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'truncated.jsonl'), 'utf8');
      assert.doesNotThrow(() => parseJsonlContent(content));
   });
});

describe('DATA-05: BOM не мешает парсингу', () => {
   it('первая строка bom.jsonl парсится корректно несмотря на BOM', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'bom.jsonl'), 'utf8');

      // Убеждаемся что файл действительно начинается с BOM
      assert.ok(content.startsWith('\uFEFF'), 'fixture должен начинаться с BOM');

      const result = parseJsonlContent(content);

      // Обе строки должны парситься
      assert.equal(result.length, 2);
      assert.equal(result[0].sessionId, 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001');
      assert.equal(result[0].display, 'BOM first line');
   });

   it('все строки из bom.jsonl возвращаются', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'bom.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      assert.equal(result.length, 2);
      assert.equal(result[1].sessionId, 'aaaa2222-bbbb-cccc-dddd-eeeeeeee0002');
   });
});

describe('DATA-06: null-поля не крэшат парсер', () => {
   it('строки с null sessionId парсятся без ошибок', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'null-fields.jsonl'), 'utf8');
      assert.doesNotThrow(() => parseJsonlContent(content));
   });

   it('все 3 строки с null-полями возвращаются как объекты', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'null-fields.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      // Все строки валидный JSON — должны парситься
      assert.equal(result.length, 3);
   });

   it('null sessionId присутствует в результате как null', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'null-fields.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      assert.equal(result[0].sessionId, null);
   });

   it('null timestamp присутствует в результате как null', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'null-fields.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      assert.equal(result[1].timestamp, null);
   });

   it('null project присутствует в результате как null', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'null-fields.jsonl'), 'utf8');
      const result = parseJsonlContent(content);

      assert.equal(result[2].project, null);
   });
});

describe('Пустой файл', () => {
   it('пустой файл возвращает пустой массив', () => {
      const content = readFileSync(join(FIXTURES, 'shared', 'empty.jsonl'), 'utf8');
      const result = parseJsonlContent(content);
      assert.equal(result.length, 0);
   });
});
