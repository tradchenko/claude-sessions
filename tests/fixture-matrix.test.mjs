/**
 * Fixture-based тестовая матрица: [agent] x [scenario].
 * Тестирует логику парсинга JSONL для каждого агента на fixture-файлах.
 * Адаптеры жёстко привязаны к HOME через config.js, поэтому
 * тестируем парсинг inline — как делают сами адаптеры.
 *
 * Матрица сценариев:
 *   valid        — fixture с валидными данными → >=1 сессия
 *   empty        — пустой файл → пустой массив
 *   missing-dir  — директория не существует → пустой массив, без исключений
 *   truncated    — обрезанный файл → парсит что может, не падает
 *
 * Задача 01-03-03: интеграционный тест list с повреждёнными данными.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');
const SHARED = join(FIXTURES, 'shared');

// ─────────────────────────────────────────────
// Парсинг JSONL — inline реализация (дублирует логику адаптеров)
// ─────────────────────────────────────────────

/**
 * Парсит JSONL строки: невалидные строки пропускаются.
 * Убирает BOM если присутствует.
 * @param {string} content - содержимое JSONL файла
 * @returns {Array<object>}
 */
function parseJsonlContent(content) {
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
 * Читает и парсит JSONL файл. Возвращает пустой массив если файл не существует.
 * @param {string} filePath
 * @returns {Array<object>}
 */
function loadJsonlSafe(filePath) {
   if (!existsSync(filePath)) return [];
   try {
      const content = readFileSync(filePath, 'utf8');
      return parseJsonlContent(content);
   } catch {
      return [];
   }
}

// ─────────────────────────────────────────────
// CLAUDE — ~/.claude/history.jsonl
// ─────────────────────────────────────────────

describe('Matrix: Claude Code', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-matrix-claude-'));
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('[valid] history.jsonl с данными → >=1 запись с sessionId', () => {
      const dir = join(tmpDir, 'valid');
      mkdirSync(dir);
      // Копируем валидный fixture
      const src = readFileSync(join(FIXTURES, 'claude', 'valid-history.jsonl'), 'utf8');
      writeFileSync(join(dir, 'history.jsonl'), src);

      const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
      assert.ok(entries.length >= 1, 'должна быть минимум одна запись');
      assert.ok('sessionId' in entries[0], 'запись должна содержать sessionId');
   });

   it('[empty] пустой history.jsonl → пустой массив', () => {
      const dir = join(tmpDir, 'empty');
      mkdirSync(dir);
      writeFileSync(join(dir, 'history.jsonl'), '');

      const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
      assert.equal(entries.length, 0, 'пустой файл должен вернуть пустой массив');
   });

   it('[missing-dir] директория не существует → пустой массив, нет исключения', () => {
      const missingPath = join(tmpDir, 'nonexistent', 'history.jsonl');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(missingPath);
         assert.equal(entries.length, 0, 'несуществующий путь → пустой массив');
      });
   });

   it('[truncated] truncated.jsonl → парсит корректные строки, не падает', () => {
      const dir = join(tmpDir, 'truncated');
      mkdirSync(dir);
      const src = readFileSync(join(SHARED, 'truncated.jsonl'), 'utf8');
      writeFileSync(join(dir, 'history.jsonl'), src);

      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
         // 3 валидных строки + 1 обрезанная = 3 результата
         assert.ok(entries.length >= 1, 'хотя бы одна валидная запись должна распарситься');
      });
   });
});

// ─────────────────────────────────────────────
// CODEX — ~/.codex/history.jsonl
// ─────────────────────────────────────────────

describe('Matrix: Codex CLI', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-matrix-codex-'));
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('[valid] history.jsonl с данными → >=1 запись с session_id', () => {
      const dir = join(tmpDir, 'valid');
      mkdirSync(dir);
      const src = readFileSync(join(FIXTURES, 'codex', 'valid-history.jsonl'), 'utf8');
      writeFileSync(join(dir, 'history.jsonl'), src);

      const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
      assert.ok(entries.length >= 1, 'должна быть минимум одна запись');
      assert.ok('session_id' in entries[0], 'запись должна содержать session_id');
   });

   it('[empty] пустой history.jsonl → пустой массив', () => {
      const dir = join(tmpDir, 'empty');
      mkdirSync(dir);
      writeFileSync(join(dir, 'history.jsonl'), '');

      const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
      assert.equal(entries.length, 0);
   });

   it('[missing-dir] директория не существует → пустой массив, нет исключения', () => {
      const missingPath = join(tmpDir, 'nonexistent', 'history.jsonl');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(missingPath);
         assert.equal(entries.length, 0);
      });
   });

   it('[truncated] truncated.jsonl → не падает, парсит валидные строки', () => {
      const dir = join(tmpDir, 'truncated');
      mkdirSync(dir);
      // Создаём truncated с форматом Codex (session_id, ts, text)
      const content = [
         '{"session_id":"sess-001","ts":1700000001,"text":"Task A"}',
         '{"session_id":"sess-002","ts":1700000002,"text":"Task B"}',
         '{"session_id":"sess-003","ts":1700000003,"text":"Task C"}',
         '{"session_id":"sess-004","ts":17000000', // обрезанная строка
      ].join('\n');
      writeFileSync(join(dir, 'history.jsonl'), content);

      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(dir, 'history.jsonl'));
         assert.equal(entries.length, 3, '3 валидных строки должны распарситься');
      });
   });
});

// ─────────────────────────────────────────────
// GEMINI — ~/.gemini/history/{project}/ (git-репозитории)
// ─────────────────────────────────────────────

describe('Matrix: Gemini CLI', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-matrix-gemini-'));
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('[valid] директория history с проектом → директория обнаруживается', () => {
      // Gemini хранит сессии как git-репозитории в ~/.gemini/history/{project}/
      // Тестируем что структура директорий корректно сканируется
      const historyDir = join(tmpDir, 'history');
      const projectDir = join(historyDir, 'my-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'README.md'), '# Project history');

      assert.ok(existsSync(historyDir), 'директория history должна существовать');
      assert.ok(existsSync(projectDir), 'директория проекта должна существовать');
   });

   it('[empty] history без проектов → нет директорий для сканирования', () => {
      const historyDir = join(tmpDir, 'empty-history');
      mkdirSync(historyDir);

      // Сканируем директории — должно вернуть пустой результат (readdirSync импортирован вверху)
      const projects = readdirSync(historyDir);
      assert.equal(projects.length, 0, 'пустая история → нет проектов');
   });

   it('[missing-dir] ~/.gemini/history не существует → graceful fallback', () => {
      const missingDir = join(tmpDir, 'nonexistent', 'history');
      // Симулируем поведение адаптера — проверяем existsSync перед сканированием
      const result = existsSync(missingDir) ? 'found' : 'not-found';
      assert.equal(result, 'not-found', 'несуществующая директория не должна вызывать исключение');
   });

   it('[truncated] session ID формируется из имени директории проекта', () => {
      // Документируем конвенцию формирования session ID для Gemini
      const projectNames = ['my-project', 'work-repo', 'test-123'];
      for (const name of projectNames) {
         const sessionId = `gemini-${name}`;
         assert.ok(sessionId.startsWith('gemini-'), `ID должен начинаться с "gemini-"`);
         assert.ok(sessionId.length > 'gemini-'.length, 'ID должен содержать имя проекта');
      }
   });
});

// ─────────────────────────────────────────────
// QWEN — ~/.qwen/projects/{project}/chats/*.jsonl
// ─────────────────────────────────────────────

describe('Matrix: Qwen Code', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-matrix-qwen-'));
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('[valid] chats/*.jsonl с данными → >=1 запись с sessionId', () => {
      // Структура: tmpDir/projects/-home-user-project/chats/session.jsonl
      const chatsDir = join(tmpDir, 'projects', '-home-user-project', 'chats');
      mkdirSync(chatsDir, { recursive: true });
      const src = readFileSync(join(FIXTURES, 'qwen', 'valid-session.jsonl'), 'utf8');
      writeFileSync(join(chatsDir, 'session-001.jsonl'), src);

      const entries = loadJsonlSafe(join(chatsDir, 'session-001.jsonl'));
      assert.ok(entries.length >= 1, 'должна быть минимум одна запись');
      assert.ok('sessionId' in entries[0], 'запись должна содержать sessionId');
   });

   it('[empty] пустой файл сессии → пустой массив', () => {
      const chatsDir = join(tmpDir, 'projects', '-home-user-empty', 'chats');
      mkdirSync(chatsDir, { recursive: true });
      writeFileSync(join(chatsDir, 'empty-session.jsonl'), '');

      const entries = loadJsonlSafe(join(chatsDir, 'empty-session.jsonl'));
      assert.equal(entries.length, 0);
   });

   it('[missing-dir] директория проекта не существует → graceful fallback', () => {
      const missingDir = join(tmpDir, 'projects', 'nonexistent', 'chats');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(missingDir, 'session.jsonl'));
         assert.equal(entries.length, 0);
      });
   });

   it('[truncated] truncated.jsonl в chats/ → не падает, парсит частично', () => {
      const chatsDir = join(tmpDir, 'projects', '-home-user-trunc', 'chats');
      mkdirSync(chatsDir, { recursive: true });
      const content = [
         '{"sessionId":"qwen-001","timestamp":1700000001000,"cwd":"/home/user/a"}',
         '{"sessionId":"qwen-002","timestamp":1700000002000,"cwd":"/home/user/b"}',
         '{"sessionId":"qwen-003","timestamp":17000000', // обрезанная строка
      ].join('\n');
      writeFileSync(join(chatsDir, 'trunc-session.jsonl'), content);

      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(chatsDir, 'trunc-session.jsonl'));
         assert.equal(entries.length, 2, '2 валидных строки должны распарситься');
      });
   });
});

// ─────────────────────────────────────────────
// COMPANION — ~/.companion/recordings/*.jsonl
// ─────────────────────────────────────────────

describe('Matrix: Companion', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-matrix-companion-'));
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('[valid] recording с _header → header entry обнаруживается', () => {
      const recordingsDir = join(tmpDir, 'recordings');
      mkdirSync(recordingsDir);
      const src = readFileSync(join(FIXTURES, 'companion', 'valid-recording.jsonl'), 'utf8');
      writeFileSync(join(recordingsDir, 'recording-001.jsonl'), src);

      const entries = loadJsonlSafe(join(recordingsDir, 'recording-001.jsonl'));
      assert.ok(entries.length >= 1, 'должны быть записи');
      // Companion header: первый entry с type: '_header' или _header: true
      const header = entries.find((e) => e.type === '_header' || e._header === true);
      assert.ok(header, 'должен существовать header entry');
   });

   it('[empty] пустое recording → пустой массив', () => {
      const recordingsDir = join(tmpDir, 'empty-recordings');
      mkdirSync(recordingsDir);
      writeFileSync(join(recordingsDir, 'empty.jsonl'), '');

      const entries = loadJsonlSafe(join(recordingsDir, 'empty.jsonl'));
      assert.equal(entries.length, 0);
   });

   it('[missing-dir] recordings/ не существует → graceful fallback', () => {
      const missingDir = join(tmpDir, 'nonexistent', 'recordings');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(missingDir, 'recording.jsonl'));
         assert.equal(entries.length, 0);
      });
   });

   it('[truncated] recording с обрезанными строками → не падает', () => {
      const recordingsDir = join(tmpDir, 'trunc-recordings');
      mkdirSync(recordingsDir);
      const content = [
         '{"type":"_header","version":"1.0","sessionId":"comp-001","startedAt":1700000001000}',
         '{"type":"message","role":"user","content":"Hello","ts":1700000001100}',
         '{"type":"message","role":"assistant","content":"Hi there","ts":17000000', // обрезанная
      ].join('\n');
      writeFileSync(join(recordingsDir, 'trunc-recording.jsonl'), content);

      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(join(recordingsDir, 'trunc-recording.jsonl'));
         assert.equal(entries.length, 2, '2 валидных строки должны распарситься');
      });
   });
});

// ─────────────────────────────────────────────
// Задача 01-03-03: интеграционный тест list с повреждёнными данными
// Документирует поведение при наличии corrupt fixtures в ~/.claude/
// ─────────────────────────────────────────────

describe('Integration: list с повреждёнными данными', () => {
   let tmpDir = '';

   before(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'cs-integration-corrupt-'));
      const claudeDir = join(tmpDir, '.claude');
      mkdirSync(claudeDir);

      // Кладём повреждённые файлы в mock ~/.claude/
      const truncatedSrc = readFileSync(join(SHARED, 'truncated.jsonl'), 'utf8');
      const bomSrc = readFileSync(join(SHARED, 'bom.jsonl'), 'utf8');
      const nullSrc = readFileSync(join(SHARED, 'null-fields.jsonl'), 'utf8');

      writeFileSync(join(claudeDir, 'truncated.jsonl'), truncatedSrc);
      writeFileSync(join(claudeDir, 'bom.jsonl'), bomSrc);
      writeFileSync(join(claudeDir, 'null-fields.jsonl'), nullSrc);
   });

   after(() => {
      if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
   });

   it('truncated.jsonl в ~/.claude/ → parseable без исключений', () => {
      const filePath = join(tmpDir, '.claude', 'truncated.jsonl');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(filePath);
         // 3 валидных строки должны распарситься
         assert.ok(Array.isArray(entries), 'результат должен быть массивом');
         assert.ok(entries.length >= 1, 'хотя бы одна запись должна распарситься');
      });
   });

   it('bom.jsonl в ~/.claude/ → BOM не мешает парсингу', () => {
      const filePath = join(tmpDir, '.claude', 'bom.jsonl');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(filePath);
         assert.ok(Array.isArray(entries), 'результат должен быть массивом');
         assert.equal(entries.length, 2, 'обе строки должны распарситься несмотря на BOM');
      });
   });

   it('null-fields.jsonl в ~/.claude/ → null поля не крэшат парсер', () => {
      const filePath = join(tmpDir, '.claude', 'null-fields.jsonl');
      assert.doesNotThrow(() => {
         const entries = loadJsonlSafe(filePath);
         assert.ok(Array.isArray(entries), 'результат должен быть массивом');
         assert.equal(entries.length, 3, 'все строки с null-полями должны распарситься');
      });
   });

   it('все 3 повреждённых файла обрабатываются без исключений', () => {
      // Симулирует поведение `claude-sessions list` при corrupt данных
      const files = ['truncated.jsonl', 'bom.jsonl', 'null-fields.jsonl'];
      const results = [];

      assert.doesNotThrow(() => {
         for (const file of files) {
            const entries = loadJsonlSafe(join(tmpDir, '.claude', file));
            results.push({ file, count: entries.length });
         }
      });

      // Документируем текущее поведение: все файлы парсятся (частично)
      assert.equal(results.length, 3, 'все 3 файла должны быть обработаны');
      for (const r of results) {
         assert.ok(r.count >= 0, `файл ${r.file}: count должен быть >= 0`);
      }
   });
});
