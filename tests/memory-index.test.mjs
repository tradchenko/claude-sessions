/**
 * Тесты модуля memory/index.ts — Plan 03-05-03
 * Проверяют readIndex, writeIndex, acquireLock, releaseLock, stale tmp cleanup.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, unlinkSync, utimesSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mod = await import('../dist/memory/index.js');
const { readIndex, writeIndex, acquireLock, releaseLock } = mod;

// Временная директория для тестов
const TEST_DIR = join(tmpdir(), `memory-index-test-${Date.now()}`);

before(() => {
   mkdirSync(TEST_DIR, { recursive: true });
});

after(() => {
   // Очистка временной директории
   try {
      rmSync(TEST_DIR, { recursive: true, force: true });
   } catch {
      // Игнорируем ошибки очистки
   }
});

// ─── writeIndex ───────────────────────────────────────────────────────────────

describe('index: writeIndex', () => {
   it('записывает корректный JSON в файл', () => {
      const indexPath = join(TEST_DIR, 'write-test.json');
      const data = {
         version: 1,
         memories: {
            'cases/test': {
               name: 'test',
               category: 'cases',
               description: 'test desc',
               content: 'test content',
               hotness: 0.5,
               active_count: 1,
               created: '2024-01-01T00:00:00.000Z',
               updated: '2024-01-01T00:00:00.000Z',
               source_sessions: [],
               projects: [],
            },
         },
         sessions: {},
      };

      writeIndex(indexPath, data);

      assert.ok(existsSync(indexPath), 'index файл должен существовать после writeIndex');

      // Tmp файл должен быть удалён после rename
      const files = readdirSync(TEST_DIR);
      const tmpFiles = files.filter((f) => f.startsWith('write-test.json.tmp.'));
      assert.equal(tmpFiles.length, 0, `Tmp файлы должны быть удалены после rename, найдено: ${tmpFiles.join(', ')}`);
   });

   it('записанный файл содержит валидный JSON с ожидаемой структурой', () => {
      const indexPath = join(TEST_DIR, 'write-read-test.json');
      const data = {
         version: 1,
         memories: { 'patterns/foo': { name: 'foo', category: 'patterns', description: '', content: 'bar', hotness: 0.3, active_count: 0, created: '', updated: '', source_sessions: [], projects: [] } },
         sessions: { 'sess-001': { summary: 'test', project: 'proj', lastActive: 1000 } },
      };

      writeIndex(indexPath, data);
      const back = readIndex(indexPath);

      assert.equal(back.version, 1);
      assert.ok(back.memories['patterns/foo'], 'memory должна присутствовать');
      assert.equal(back.memories['patterns/foo'].content, 'bar');
   });

   it('атомарная запись: перезапись существующего файла не кидает', () => {
      const indexPath = join(TEST_DIR, 'overwrite-test.json');
      const data1 = { version: 1, memories: {}, sessions: {} };
      const data2 = { version: 1, memories: { 'cases/x': { name: 'x', category: 'cases', description: '', content: 'new', hotness: 0, active_count: 0, created: '', updated: '', source_sessions: [], projects: [] } }, sessions: {} };

      writeIndex(indexPath, data1);
      assert.doesNotThrow(() => writeIndex(indexPath, data2));

      const result = readIndex(indexPath);
      assert.ok(result.memories['cases/x'], 'новые данные должны быть записаны');
   });
});

// ─── readIndex ────────────────────────────────────────────────────────────────

describe('index: readIndex', () => {
   it('несуществующий файл → возвращает пустой индекс', () => {
      const indexPath = join(TEST_DIR, 'nonexistent-12345.json');
      const result = readIndex(indexPath);
      assert.deepEqual(result.memories, {});
      assert.deepEqual(result.sessions, {});
   });

   it('невалидный JSON → возвращает пустой индекс', () => {
      const indexPath = join(TEST_DIR, 'invalid.json');
      writeFileSync(indexPath, 'not valid json { broken', 'utf8');
      const result = readIndex(indexPath);
      assert.deepEqual(result.memories, {});
   });

   it('удаляет stale tmp файлы старше 5 минут', () => {
      const indexPath = join(TEST_DIR, 'stale-test.json');
      writeIndex(indexPath, { version: 1, memories: {}, sessions: {} });

      // Создаём stale tmp файл
      const staleTmpPath = `${indexPath}.tmp.99999`;
      writeFileSync(staleTmpPath, '{}', 'utf8');

      // Устанавливаем время модификации 6 минут назад
      const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
      utimesSync(staleTmpPath, sixMinAgo, sixMinAgo);

      assert.ok(existsSync(staleTmpPath), 'stale tmp файл должен существовать до readIndex');

      readIndex(indexPath);

      assert.ok(!existsSync(staleTmpPath), 'stale tmp файл должен быть удалён после readIndex');
   });

   it('свежий tmp файл (< 5 мин) НЕ удаляется', () => {
      const indexPath = join(TEST_DIR, 'fresh-tmp-test.json');
      writeIndex(indexPath, { version: 1, memories: {}, sessions: {} });

      // Создаём свежий tmp файл
      const freshTmpPath = `${indexPath}.tmp.88888`;
      writeFileSync(freshTmpPath, '{}', 'utf8');
      // Время модификации — сейчас (свежий)

      readIndex(indexPath);

      assert.ok(existsSync(freshTmpPath), 'свежий tmp файл НЕ должен быть удалён');

      // Чистим вручную
      unlinkSync(freshTmpPath);
   });
});

// ─── acquireLock / releaseLock ────────────────────────────────────────────────

describe('index: acquireLock / releaseLock', () => {
   it('базовый lock/unlock цикл', () => {
      const lockPath = join(TEST_DIR, 'test.lock');

      const acquired = acquireLock(lockPath);
      assert.ok(acquired, 'первый acquireLock должен вернуть true');
      assert.ok(existsSync(lockPath), 'lock файл должен существовать');

      releaseLock(lockPath);
      assert.ok(!existsSync(lockPath), 'lock файл должен быть удалён после releaseLock');
   });

   it('повторный acquireLock возвращает false если lock держит живой процесс', () => {
      const lockPath = join(TEST_DIR, 'double.lock');

      const first = acquireLock(lockPath);
      assert.ok(first, 'первый lock должен успешно захватиться');

      const second = acquireLock(lockPath);
      assert.ok(!second, 'второй acquireLock должен вернуть false (lock уже захвачен)');

      releaseLock(lockPath);
   });

   it('stale lock (мёртвый pid) → захватывается', () => {
      const lockPath = join(TEST_DIR, 'stale.lock');

      // Создаём stale lock с заведомо несуществующим pid
      writeFileSync(lockPath, '999999999', 'utf8'); // несуществующий pid

      const acquired = acquireLock(lockPath);
      assert.ok(acquired, 'stale lock должен быть захвачен (pid не существует)');

      releaseLock(lockPath);
   });

   it('releaseLock несуществующего файла не кидает ошибку', () => {
      const lockPath = join(TEST_DIR, 'nonexistent.lock');
      assert.doesNotThrow(() => releaseLock(lockPath));
   });
});
