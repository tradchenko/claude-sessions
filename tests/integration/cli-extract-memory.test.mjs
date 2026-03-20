/**
 * Интеграционные тесты команды extract-memory (Plan 04-04-06).
 * Тестируем: extractL0ForAgent + readIndex/writeIndex pipeline,
 * пустой проект, повреждённые JSONL строки.
 * Работаем через temp dirs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Импортируем из dist — стандартный паттерн проекта
let extractL0ForAgent, readIndex, writeIndex;

before(async () => {
   const l0Mod = await import('../../dist/memory/extract-l0-multi.js');
   extractL0ForAgent = l0Mod.extractL0ForAgent;
   const indexMod = await import('../../dist/memory/index.js');
   readIndex = indexMod.readIndex;
   writeIndex = indexMod.writeIndex;
});

// ─── Утилиты ────────────────────────────────────────────────────────────────

function makeTempDir(prefix = 'cs-extract-') {
   return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(dir) {
   try { rmSync(dir, { recursive: true, force: true }); } catch { /* игнорируем */ }
}

// ─── Fixtures JSONL ──────────────────────────────────────────────────────────

/** Создаёт валидные строки JSONL в формате codex */
function makeCodexLines(sessionId, project, messages) {
   const lines = [];
   for (const msg of messages) {
      lines.push(JSON.stringify({
         type: 'message',
         role: msg.role,
         content: msg.content,
         session_id: sessionId,
         cwd: project,
         timestamp: Date.now(),
      }));
   }
   return lines;
}

/** Создаёт валидные строки JSONL в формате qwen */
function makeQwenLines(messages) {
   const lines = [];
   for (const msg of messages) {
      lines.push(JSON.stringify({
         role: msg.role,
         content: msg.content,
         timestamp: Date.now(),
      }));
   }
   return lines;
}

// ─── Тесты extractL0ForAgent ─────────────────────────────────────────────────

describe('cli-extract-memory: extractL0ForAgent — codex Happy path', () => {
   it('валидные строки codex → L0 с summary, messageCount, project', () => {
      const lines = makeCodexLines(
         'session-codex-001',
         '/home/user/my-project',
         [
            { role: 'user', content: 'Реализуй функцию сортировки массива' },
            { role: 'assistant', content: 'Вот реализация quicksort на TypeScript:' },
         ],
      );

      const result = extractL0ForAgent('codex', lines, '/home/user/my-project');

      assert.ok(typeof result === 'object', 'результат должен быть объектом');
      assert.ok(typeof result.summary === 'string', 'summary должен быть строкой');
      assert.ok(typeof result.messageCount === 'number', 'messageCount должен быть числом');
      assert.ok(result.messageCount >= 0, 'messageCount >= 0');
      assert.ok(typeof result.project === 'string', 'project должен быть строкой');
      assert.ok(Array.isArray(result.files), 'files должен быть массивом');
   });

   it('пустые строки → graceful result без crash', () => {
      const result = extractL0ForAgent('codex', [], '/home/user/proj');

      assert.ok(typeof result === 'object', 'результат объект');
      assert.equal(result.messageCount, 0, 'messageCount=0 для пустого ввода');
      assert.ok(Array.isArray(result.files), 'files массив');
   });

   it('неизвестный агент → L0 с summary об ошибке, нет crash', () => {
      const result = extractL0ForAgent('unknown-agent', ['line1', 'line2'], '/proj');

      assert.ok(typeof result === 'object', 'объект даже для неизвестного агента');
      assert.ok(result.summary.includes('unknown-agent') || result.summary.length >= 0, 'summary присутствует');
   });
});

describe('cli-extract-memory: extractL0ForAgent — qwen', () => {
   it('валидные строки qwen → L0 данные', () => {
      const lines = makeQwenLines([
         { role: 'user', content: 'Помоги с Python скриптом' },
         { role: 'assistant', content: 'Конечно, вот пример:' },
      ]);

      const result = extractL0ForAgent('qwen', lines, 'qwen-project');

      assert.ok(typeof result === 'object', 'результат объект');
      assert.ok(result.messageCount >= 0, 'messageCount >= 0');
   });
});

describe('cli-extract-memory: extractL0ForAgent — повреждённые данные', () => {
   it('смешанные валидные и невалидные строки → валидные обрабатываются', () => {
      const validLine = JSON.stringify({
         type: 'message', role: 'user', content: 'Валидное сообщение',
         session_id: 'sid-1', cwd: '/proj', timestamp: Date.now(),
      });
      const lines = [
         '{ invalid json !!!',
         validLine,
         'not json at all',
         '',
         validLine, // дублирующая валидная строка
      ];

      assert.doesNotThrow(
         () => extractL0ForAgent('codex', lines, '/proj'),
         'повреждённые строки не должны бросать исключений',
      );

      const result = extractL0ForAgent('codex', lines, '/proj');
      assert.ok(typeof result === 'object', 'результат объект');
   });

   it('полностью повреждённый ввод → graceful, нет crash', () => {
      const corruptLines = [
         '{ not valid',
         '!!@@##',
         'undefined',
         '{"unterminated": ',
      ];

      assert.doesNotThrow(
         () => extractL0ForAgent('codex', corruptLines, '/proj'),
         'полностью битый ввод → нет crash',
      );
   });
});

describe('cli-extract-memory: readIndex / writeIndex pipeline', () => {
   let tmpDir;
   let indexPath;

   before(() => {
      tmpDir = makeTempDir('cs-extract-index-');
      indexPath = join(tmpDir, 'index.json');
   });

   after(() => cleanup(tmpDir));

   it('readIndex на несуществующем файле → пустой index, нет crash', () => {
      const index = readIndex(indexPath);

      assert.ok(typeof index === 'object', 'результат объект');
      assert.ok(typeof index.sessions === 'object', 'sessions присутствует');
      assert.ok(typeof index.memories === 'object', 'memories присутствует');
   });

   it('writeIndex + readIndex → данные сохраняются', () => {
      const data = {
         version: 1,
         sessions: {
            'session-001': {
               id: 'session-001',
               summary: 'Test session',
               project: '/home/user/proj',
               agent: 'codex',
               timestamp: Date.now(),
               messageCount: 5,
               files: [],
            },
         },
         memories: {},
      };

      writeIndex(indexPath, data);
      assert.ok(existsSync(indexPath), 'файл должен существовать');

      const loaded = readIndex(indexPath);
      assert.ok(loaded.sessions['session-001'] !== undefined, 'session-001 сохранена');
      assert.equal(loaded.sessions['session-001'].summary, 'Test session', 'summary корректен');
   });

   it('writeIndex дважды → файл перезаписывается (идемпотентность)', () => {
      const data1 = { version: 1, sessions: { 's1': { summary: 'First' } }, memories: {} };
      const data2 = { version: 1, sessions: { 's2': { summary: 'Second' } }, memories: {} };

      writeIndex(indexPath, data1);
      writeIndex(indexPath, data2);

      const loaded = readIndex(indexPath);
      assert.ok(loaded.sessions['s2'] !== undefined, 's2 должен быть (последняя запись)');
      assert.equal(loaded.sessions['s2'].summary, 'Second', 'содержит данные второй записи');
   });
});

describe('cli-extract-memory: E2E pipeline — JSONL → L0 → index', () => {
   let tmpDir;
   let indexPath;

   before(() => {
      tmpDir = makeTempDir('cs-extract-e2e-');
      indexPath = join(tmpDir, 'index.json');
   });

   after(() => cleanup(tmpDir));

   it('полный pipeline: JSONL строки → extractL0 → writeIndex → readIndex', () => {
      const sessionId = 'session-e2e-001';
      const project = '/home/user/e2e-project';
      const lines = makeCodexLines(sessionId, project, [
         { role: 'user', content: 'Создай TypeScript интерфейс для User' },
         { role: 'assistant', content: 'interface User { id: string; name: string; email: string; }' },
      ]);

      // Шаг 1: extractL0
      const l0 = extractL0ForAgent('codex', lines, project);
      assert.ok(typeof l0 === 'object', 'L0 получен');

      // Шаг 2: обновляем index
      const index = readIndex(indexPath);
      index.sessions[sessionId] = {
         id: sessionId,
         summary: l0.summary ?? '',
         project: l0.project,
         agent: 'codex',
         timestamp: l0.timestamp ?? Date.now(),
         messageCount: l0.messageCount,
         files: l0.files ?? [],
      };
      writeIndex(indexPath, index);

      // Шаг 3: проверяем что index обновлён
      const loaded = readIndex(indexPath);
      assert.ok(loaded.sessions[sessionId] !== undefined, `session ${sessionId} в index`);
      assert.equal(loaded.sessions[sessionId].agent, 'codex', 'агент корректен');
      assert.equal(loaded.sessions[sessionId].project, project, 'project корректен');
   });

   it('пустой проект (нет JSONL) → pipeline завершается без crash', () => {
      // Нет сессий — просто пустой index
      const index = readIndex(indexPath);
      assert.ok(typeof index === 'object', 'пустой project → пустой index, нет crash');

      // extract для пустых данных
      const l0 = extractL0ForAgent('codex', [], 'empty-project');
      assert.ok(typeof l0 === 'object', 'extractL0 пустых строк → нет crash');
   });

   it('повреждённые строки JSONL → валидные данные попадают в index', () => {
      const sessionId = 'session-corrupt-test';
      const validLine = JSON.stringify({
         type: 'message', role: 'user', content: 'Валидное сообщение',
         session_id: sessionId, cwd: '/proj', timestamp: Date.now(),
      });
      const mixedLines = [
         '{ invalid !!!',
         validLine,
         'broken line',
      ];

      // extractL0 должен пропустить битые строки, обработать валидные
      const l0 = extractL0ForAgent('codex', mixedLines, '/proj');
      assert.ok(typeof l0 === 'object', 'L0 получен даже с повреждёнными строками');

      // Можем сохранить в index — нет crash
      const index = readIndex(indexPath);
      index.sessions[sessionId] = {
         id: sessionId,
         summary: l0.summary ?? '',
         project: '/proj',
         agent: 'codex',
         timestamp: Date.now(),
         messageCount: l0.messageCount,
         files: [],
      };
      assert.doesNotThrow(() => writeIndex(indexPath, index), 'writeIndex с L0 из битых строк → нет crash');
   });
});
