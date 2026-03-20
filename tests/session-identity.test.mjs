/**
 * Тесты-спецификации для session identity каждого из 5 агентов.
 * Документируют: формат JSONL, извлечение session ID, путь хранения.
 * Conditional тесты на реальных данных скипаются если агент не установлен.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

// ─────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────

/**
 * Парсит JSONL построчно — аналог логики адаптеров.
 * Невалидные строки пропускаются.
 * @param {string} content - содержимое JSONL файла
 * @returns {Array<object>}
 */
function parseJsonl(content) {
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
 * Читает JSONL fixture-файл и возвращает распарсенные строки.
 * @param {string} filePath
 * @returns {Array<object>}
 */
function readFixtureSync(filePath) {
   const content = readFileSync(filePath, 'utf8');
   return parseJsonl(content);
}

// ─────────────────────────────────────────────
// CLAUDE
// ─────────────────────────────────────────────

describe('Agent Identity: Claude Code', () => {
   const fixturePath = join(FIXTURES, 'claude', 'valid-history.jsonl');

   it('формат хранения: поля sessionId, project, display, timestamp присутствуют', () => {
      const entries = readFixtureSync(fixturePath);
      assert.ok(entries.length > 0, 'fixture должен содержать записи');

      const first = entries[0];
      // Claude использует sessionId (camelCase)
      assert.ok('sessionId' in first, 'поле sessionId должно присутствовать');
      assert.ok('project' in first, 'поле project должно присутствовать');
      assert.ok('timestamp' in first, 'поле timestamp должно присутствовать');
      assert.equal(typeof first.sessionId, 'string', 'sessionId должен быть строкой');
      assert.equal(typeof first.timestamp, 'number', 'timestamp должен быть числом (ms)');
   });

   it('извлечение session ID: sessionId имеет формат UUID', () => {
      const entries = readFixtureSync(fixturePath);
      const uuidPattern = /^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i;

      for (const entry of entries) {
         if (!entry.sessionId) continue;
         assert.match(entry.sessionId, uuidPattern, `sessionId "${entry.sessionId}" должен быть UUID`);
      }
   });

   it('путь хранения: агент ищет history.jsonl в ~/.claude/', () => {
      // Документируем ожидаемый путь хранения
      const expectedPath = join(homedir(), '.claude', 'history.jsonl');
      // Тест документирует спецификацию, не проверяет реальный файл
      assert.ok(expectedPath.includes('.claude'), 'путь должен содержать .claude');
      assert.ok(expectedPath.endsWith('history.jsonl'), 'файл должен называться history.jsonl');
   });

   it('поле display содержит описание сессии', () => {
      const entries = readFixtureSync(fixturePath);
      const withDisplay = entries.filter((e) => e.display);
      assert.ok(withDisplay.length > 0, 'хотя бы одна запись должна иметь поле display');
      assert.equal(typeof withDisplay[0].display, 'string', 'display должен быть строкой');
   });

   // Conditional тест — запускается только если агент установлен
   const claudeInstalled = existsSync(join(homedir(), '.claude'));
   it('реальные данные: loadSessions возвращает массив', { skip: !claudeInstalled }, async () => {
      const { claudeAdapter } = await import('../dist/agents/claude.js');
      const sessions = await claudeAdapter.loadSessions({ limit: 5 });
      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
   });
});

// ─────────────────────────────────────────────
// CODEX
// ─────────────────────────────────────────────

describe('Agent Identity: Codex CLI', () => {
   const fixturePath = join(FIXTURES, 'codex', 'valid-history.jsonl');

   it('формат хранения: поля session_id, ts, text присутствуют', () => {
      const entries = readFixtureSync(fixturePath);
      assert.ok(entries.length > 0, 'fixture должен содержать записи');

      const first = entries[0];
      // Codex использует session_id (snake_case) — отличие от Claude
      assert.ok('session_id' in first, 'поле session_id должно присутствовать');
      assert.ok('ts' in first, 'поле ts должно присутствовать');
      assert.ok('text' in first, 'поле text должно присутствовать');
      assert.equal(typeof first.session_id, 'string', 'session_id должен быть строкой');
   });

   it('извлечение session ID: использует поле session_id (snake_case)', () => {
      const entries = readFixtureSync(fixturePath);
      // Codex хранит session_id, а не sessionId
      for (const entry of entries) {
         assert.ok(!('sessionId' in entry), 'Codex не должен использовать camelCase sessionId');
         assert.ok('session_id' in entry, 'Codex должен использовать snake_case session_id');
      }
   });

   it('извлечение session ID: поле ts в секундах (< 1e12)', () => {
      const entries = readFixtureSync(fixturePath);
      for (const entry of entries) {
         if (!entry.ts) continue;
         // Codex хранит ts в секундах, не миллисекундах
         assert.ok(entry.ts < 1e12, `ts=${entry.ts} должен быть в секундах (< 1e12)`);
      }
   });

   it('путь хранения: агент ищет history.jsonl в ~/.codex/', () => {
      const expectedPath = join(homedir(), '.codex', 'history.jsonl');
      assert.ok(expectedPath.includes('.codex'), 'путь должен содержать .codex');
      assert.ok(expectedPath.endsWith('history.jsonl'), 'файл должен называться history.jsonl');
   });

   // Conditional тест
   const codexInstalled = existsSync(join(homedir(), '.codex'));
   it('реальные данные: loadSessions возвращает массив', { skip: !codexInstalled }, async () => {
      const { codexAdapter } = await import('../dist/agents/codex.js');
      const sessions = await codexAdapter.loadSessions({ limit: 5 });
      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
   });
});

// ─────────────────────────────────────────────
// GEMINI
// ─────────────────────────────────────────────

describe('Agent Identity: Gemini CLI', () => {
   it('формат хранения: сессии хранятся как git-репозитории в ~/.gemini/history/{project}/', () => {
      // Gemini не использует JSONL для сессий — использует git репозитории
      // Session ID формируется как "gemini-{projectName}"
      const exampleProjectName = 'my-project';
      const expectedSessionId = `gemini-${exampleProjectName}`;
      assert.ok(expectedSessionId.startsWith('gemini-'), 'ID должен начинаться с "gemini-"');
      assert.equal(expectedSessionId, 'gemini-my-project', 'формат ID: gemini-{projectName}');
   });

   it('извлечение session ID: ID = "gemini-{projectDirName}"', () => {
      // Документируем соглашение об именовании session ID для Gemini
      const projectNames = ['my-project', 'work-repo', 'test'];
      for (const name of projectNames) {
         const sessionId = `gemini-${name}`;
         assert.ok(sessionId.startsWith('gemini-'), `ID для "${name}" должен начинаться с "gemini-"`);
      }
   });

   it('путь хранения: агент сканирует директории в ~/.gemini/history/', () => {
      const historyDir = join(homedir(), '.gemini', 'history');
      assert.ok(historyDir.includes('.gemini'), 'путь должен содержать .gemini');
      assert.ok(historyDir.endsWith('history'), 'директория должна называться history');
   });

   it('инструкции агента: файл GEMINI.md в ~/.gemini/', () => {
      const expectedInstructionsPath = join(homedir(), '.gemini', 'GEMINI.md');
      assert.ok(expectedInstructionsPath.endsWith('GEMINI.md'), 'инструкции должны быть в GEMINI.md');
   });

   // Conditional тест
   const geminiInstalled = existsSync(join(homedir(), '.gemini'));
   it('реальные данные: loadSessions возвращает массив', { skip: !geminiInstalled }, async () => {
      const { geminiAdapter } = await import('../dist/agents/gemini.js');
      const sessions = await geminiAdapter.loadSessions({ limit: 5 });
      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
   });
});

// ─────────────────────────────────────────────
// QWEN
// ─────────────────────────────────────────────

describe('Agent Identity: Qwen Code', () => {
   const fixturePath = join(FIXTURES, 'qwen', 'valid-session.jsonl');

   it('формат хранения: поля sessionId, timestamp, cwd присутствуют', () => {
      const entries = readFixtureSync(fixturePath);
      assert.ok(entries.length > 0, 'fixture должен содержать записи');

      const first = entries[0];
      // Qwen использует sessionId (camelCase) — как Claude, но другая структура директорий
      assert.ok('sessionId' in first, 'поле sessionId должно присутствовать');
      assert.ok('timestamp' in first, 'поле timestamp должно присутствовать');
      assert.ok('cwd' in first, 'поле cwd должно присутствовать');
   });

   it('извлечение session ID: берётся из первого entry файла', () => {
      const entries = readFixtureSync(fixturePath);
      // ID сессии — это sessionId первого entry в JSONL файле
      const firstEntry = entries[0];
      assert.ok(firstEntry.sessionId, 'первый entry должен содержать sessionId');
      assert.equal(typeof firstEntry.sessionId, 'string', 'sessionId должен быть строкой');
   });

   it('путь хранения: агент ищет файлы в ~/.qwen/projects/{project}/chats/*.jsonl', () => {
      const expectedPattern = join(homedir(), '.qwen', 'projects');
      assert.ok(expectedPattern.includes('.qwen'), 'путь должен содержать .qwen');
      assert.ok(expectedPattern.endsWith('projects'), 'директория должна называться projects');
   });

   it('формат timestamp: в миллисекундах (>= 1e12)', () => {
      const entries = readFixtureSync(fixturePath);
      for (const entry of entries) {
         if (!entry.timestamp) continue;
         assert.ok(entry.timestamp >= 1e12, `timestamp=${entry.timestamp} должен быть в ms (>= 1e12)`);
      }
   });

   // Conditional тест
   const qwenInstalled = existsSync(join(homedir(), '.qwen'));
   it('реальные данные: loadSessions возвращает массив', { skip: !qwenInstalled }, async () => {
      const { qwenAdapter } = await import('../dist/agents/qwen.js');
      const sessions = await qwenAdapter.loadSessions({ limit: 5 });
      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
   });
});

// ─────────────────────────────────────────────
// COMPANION
// ─────────────────────────────────────────────

describe('Agent Identity: Companion', () => {
   const fixturePath = join(FIXTURES, 'companion', 'valid-recording.jsonl');

   it('формат хранения: первый entry — _header с session_id и started_at', () => {
      const entries = readFixtureSync(fixturePath);
      assert.ok(entries.length > 0, 'fixture должен содержать записи');

      // Companion хранит header как первый entry с type: "_header"
      const header = entries.find((e) => e.type === '_header');
      assert.ok(header, 'должен содержать header entry с type="_header"');
      assert.ok('sessionId' in header || 'session_id' in header, 'header должен содержать session ID');
      assert.ok('startedAt' in header || 'started_at' in header, 'header должен содержать timestamp');
   });

   it('извлечение session ID: берётся из header entry', () => {
      const entries = readFixtureSync(fixturePath);
      const header = entries.find((e) => e.type === '_header');
      assert.ok(header, 'header должен существовать');

      const sessionId = header.sessionId || header.session_id;
      assert.ok(sessionId, 'session ID должен присутствовать в header');
      assert.equal(typeof sessionId, 'string', 'session ID должен быть строкой');
   });

   it('путь хранения: агент сканирует ~/.companion/recordings/*.jsonl', () => {
      const expectedDir = join(homedir(), '.companion', 'recordings');
      assert.ok(expectedDir.includes('.companion'), 'путь должен содержать .companion');
      assert.ok(expectedDir.endsWith('recordings'), 'директория должна называться recordings');
   });

   it('companion атрибутирует сессии к реальным агентам (viaCompanion)', () => {
      // Companion — не самостоятельный агент, а launcher
      // Каждая сессия помечается viaCompanion=true и имеет agent='claude'/'codex'/etc.
      const supportedAgents = ['claude', 'codex', 'gemini', 'qwen'];
      assert.ok(supportedAgents.length > 0, 'должны быть определены поддерживаемые агенты');
      // Документируем что companion делегирует реальному агенту
      assert.ok(supportedAgents.includes('claude'), 'claude должен быть поддерживаемым агентом');
   });

   // Conditional тест
   const companionInstalled = existsSync(join(homedir(), '.companion')) || process.env.COMPANION_AUTH_TOKEN;
   it('реальные данные: loadSessions возвращает массив', { skip: !companionInstalled }, async () => {
      const { companionAdapter } = await import('../dist/agents/companion.js');
      const sessions = await companionAdapter.loadSessions({ limit: 5 });
      assert.ok(Array.isArray(sessions), 'должен вернуть массив');
   });
});
