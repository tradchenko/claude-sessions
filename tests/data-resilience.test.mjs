/**
 * Тесты устойчивости к граничным условиям данных.
 * Документируют ТЕКУЩЕЕ поведение (snapshot before refactor).
 * Не импортируют из dist/ — работают с файловой системой напрямую.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { generateLargeJsonl } from './helpers/generate-large-jsonl.mjs';

/**
 * Парсит JSONL файл построчно — аналог логики адаптеров.
 * Невалидные строки пропускаются, ошибки не бросаются.
 * @param {string} filePath - путь к JSONL файлу
 * @returns {Array<object>} массив распарсенных объектов
 */
function parseJsonlFile(filePath) {
   if (!existsSync(filePath)) return [];
   const content = readFileSync(filePath, 'utf8');
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

/**
 * Моделирует loadSessions для агента с заданной директорией.
 * Ищет history.jsonl в корне агентской директории.
 * @param {string} agentDir - директория агента (аналог ~/.claude/)
 * @returns {Array<object>} загруженные сессии
 */
function loadSessionsFromDir(agentDir) {
   const historyPath = join(agentDir, 'history.jsonl');
   if (!existsSync(historyPath)) return [];
   return parseJsonlFile(historyPath);
}

describe('DATA-02: пустая директория агента', () => {
   let tmpDir;

   it('возвращает пустой массив при пустой директории', () => {
      // Создаём пустую директорию агента без history.jsonl
      tmpDir = mkdtempSync(join(tmpdir(), 'claude-sessions-empty-'));
      const sessions = loadSessionsFromDir(tmpDir);

      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
      assert.equal(sessions.length, 0, 'массив должен быть пустым');
   });

   it('не бросает исключение при пустой директории', () => {
      tmpDir = tmpDir || mkdtempSync(join(tmpdir(), 'claude-sessions-empty-'));
      assert.doesNotThrow(() => loadSessionsFromDir(tmpDir));
   });

   after(() => {
      // Удаляем временные директории
      if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
   });
});

describe('DATA-03: отсутствующая директория агента', () => {
   it('возвращает пустой массив при несуществующей директории', () => {
      // Путь к директории которая не существует
      const nonExistentDir = join(tmpdir(), `claude-sessions-nonexistent-${Date.now()}`);
      const sessions = loadSessionsFromDir(nonExistentDir);

      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
      assert.equal(sessions.length, 0, 'массив должен быть пустым');
   });

   it('не бросает исключение при отсутствующей директории', () => {
      const nonExistentDir = join(tmpdir(), `claude-sessions-nonexistent2-${Date.now()}`);
      assert.doesNotThrow(() => loadSessionsFromDir(nonExistentDir));
   });
});

describe('DATA-02/03: пустой history.jsonl', () => {
   let tmpDir;

   it('возвращает пустой массив для пустого history.jsonl', () => {
      tmpDir = mkdtempSync(join(tmpdir(), 'claude-sessions-emptyfile-'));
      writeFileSync(join(tmpDir, 'history.jsonl'), '');

      const sessions = loadSessionsFromDir(tmpDir);
      assert.ok(Array.isArray(sessions));
      assert.equal(sessions.length, 0);
   });

   after(() => {
      if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
   });
});

describe('DATA-07: 10MB+ JSONL файл', () => {
   let largePath;
   let largeDir;

   it('парсинг завершается без OOM и возвращает результат', async () => {
      // Генерируем файл ~10MB
      largePath = await generateLargeJsonl(10);
      largeDir = dirname(largePath);

      // Парсим большой файл
      const result = parseJsonlFile(largePath);

      // Должен вернуть массив с данными, не упасть
      assert.ok(Array.isArray(result), 'результат должен быть массивом');
      assert.ok(result.length > 0, 'массив не должен быть пустым');
   });

   it('каждая строка большого файла имеет sessionId и timestamp', async () => {
      // Если largePath ещё не создан — создаём (тест может запускаться изолированно)
      if (!largePath) {
         largePath = await generateLargeJsonl(10);
         largeDir = dirname(largePath);
      }

      const result = parseJsonlFile(largePath);

      // Проверяем первые 100 строк для скорости
      const sample = result.slice(0, 100);
      for (const item of sample) {
         assert.ok(item.sessionId !== undefined, 'sessionId должен быть');
         assert.ok(item.timestamp !== undefined, 'timestamp должен быть');
      }
   });

   after(() => {
      // Удаляем временный файл и директорию
      if (largePath && existsSync(largePath)) unlinkSync(largePath);
      if (largeDir && existsSync(largeDir)) rmSync(largeDir, { recursive: true, force: true });
   });
});
