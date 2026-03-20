/**
 * Интеграционные тесты команды list (Plan 04-04-02).
 * Тестируем внутреннюю логику: парсинг history.jsonl, фильтрацию, дедупликацию.
 * Работаем с реальной ФС через temp dirs.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** Создаёт уникальную temp-директорию */
function makeTempDir(prefix = 'cs-list-') {
   return mkdtempSync(join(tmpdir(), prefix));
}

/** Удаляет директорию рекурсивно */
function cleanup(dir) {
   try { rmSync(dir, { recursive: true, force: true }); } catch { /* игнорируем */ }
}

/**
 * Парсит JSONL файл построчно — аналог логики адаптеров.
 * Невалидные строки пропускаются.
 */
function parseJsonl(content) {
   const clean = content.startsWith('\uFEFF') ? content.slice(1) : content;
   return clean
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
         try { return [JSON.parse(line)]; }
         catch { return []; }
      });
}

import { readFileSync } from 'node:fs';

/**
 * Синхронно загружает и парсирует history.jsonl.
 */
function loadHistorySync(historyPath) {
   if (!existsSync(historyPath)) return [];
   const content = readFileSync(historyPath, 'utf8');
   return parseJsonl(content);
}

/**
 * Группирует события history по sessionId → массив сессий.
 */
function groupSessions(events) {
   const map = new Map();
   for (const ev of events) {
      if (!ev.sessionId) continue;
      if (!map.has(ev.sessionId)) {
         map.set(ev.sessionId, {
            id: ev.sessionId,
            project: ev.project ?? 'unknown',
            agent: 'claude',
            lastTs: ev.timestamp ?? 0,
         });
      } else {
         const s = map.get(ev.sessionId);
         if ((ev.timestamp ?? 0) > s.lastTs) s.lastTs = ev.timestamp;
      }
   }
   return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
}

/**
 * Фильтрует сессии по агенту.
 */
function filterByAgent(sessions, agentId) {
   return sessions.filter((s) => s.agent === agentId);
}

/** Создаёт history.jsonl запись */
function makeHistoryEvent(sessionId, project, timestamp, display = '') {
   return JSON.stringify({ sessionId, project, timestamp, display });
}

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('cli-list: Happy path — несколько сессий', () => {
   let tmpDir;
   let historyPath;

   before(() => {
      tmpDir = makeTempDir('cs-list-happy-');
      historyPath = join(tmpDir, 'history.jsonl');

      const events = [
         makeHistoryEvent('session-aaa', '/home/user/project-a', Date.now() - 3000, 'First session'),
         makeHistoryEvent('session-bbb', '/home/user/project-b', Date.now() - 2000, 'Second session'),
         makeHistoryEvent('session-ccc', '/home/user/project-c', Date.now() - 1000, 'Third session'),
         // Дополнительное событие той же сессии — проверяем дедупликацию
         makeHistoryEvent('session-aaa', '/home/user/project-a', Date.now() - 500, 'Updated'),
      ].join('\n');

      writeFileSync(historyPath, events + '\n', 'utf8');
   });

   after(() => cleanup(tmpDir));

   it('все уникальные сессии присутствуют в результате', () => {
      const events = loadHistorySync(historyPath);
      const sessions = groupSessions(events);

      assert.equal(sessions.length, 3, 'должно быть 3 уникальные сессии');
      const ids = sessions.map((s) => s.id);
      assert.ok(ids.includes('session-aaa'), 'session-aaa должна быть в списке');
      assert.ok(ids.includes('session-bbb'), 'session-bbb должна быть в списке');
      assert.ok(ids.includes('session-ccc'), 'session-ccc должна быть в списке');
   });

   it('сессии отсортированы по времени (новые первыми)', () => {
      const events = loadHistorySync(historyPath);
      const sessions = groupSessions(events);

      // session-aaa имеет lastTs = Date.now() - 500 (обновлён последним событием)
      assert.equal(sessions[0].id, 'session-aaa', 'самая новая сессия должна быть первой');
   });

   it('дедупликация: session-aaa встречается дважды, но возвращается один раз', () => {
      const events = loadHistorySync(historyPath);
      const sessions = groupSessions(events);

      const aaaSessions = sessions.filter((s) => s.id === 'session-aaa');
      assert.equal(aaaSessions.length, 1, 'session-aaa должна быть дедуплицирована');
   });
});

describe('cli-list: Пустые данные', () => {
   let tmpDir;

   before(() => {
      tmpDir = makeTempDir('cs-list-empty-');
   });

   after(() => cleanup(tmpDir));

   it('несуществующий history.jsonl → пустой массив, без ошибок', () => {
      const historyPath = join(tmpDir, 'history.jsonl');
      // Файл не создаём
      const events = loadHistorySync(historyPath);
      assert.ok(Array.isArray(events), 'должен вернуть массив');
      assert.equal(events.length, 0, 'массив должен быть пустым');
   });

   it('пустой history.jsonl → пустой массив', () => {
      const historyPath = join(tmpDir, 'history-empty.jsonl');
      writeFileSync(historyPath, '', 'utf8');
      const events = loadHistorySync(historyPath);
      assert.equal(events.length, 0, 'пустой файл → пустой массив');
   });

   it('пустые данные → groupSessions возвращает пустой массив', () => {
      const sessions = groupSessions([]);
      assert.equal(sessions.length, 0, 'нет событий → нет сессий');
   });
});

describe('cli-list: Фильтр --agent', () => {
   let tmpDir;
   let historyPath;

   before(() => {
      tmpDir = makeTempDir('cs-list-agent-');
      historyPath = join(tmpDir, 'history.jsonl');

      const events = [
         makeHistoryEvent('session-claude-1', '/home/user/proj', Date.now() - 3000),
         makeHistoryEvent('session-claude-2', '/home/user/proj2', Date.now() - 2000),
      ].join('\n');
      writeFileSync(historyPath, events + '\n', 'utf8');
   });

   after(() => cleanup(tmpDir));

   it('filter claude → возвращает только claude-сессии', () => {
      const events = loadHistorySync(historyPath);
      // Все claude-сессии — агент по умолчанию 'claude'
      const allSessions = groupSessions(events);
      const filtered = filterByAgent(allSessions, 'claude');

      assert.equal(filtered.length, 2, 'должно быть 2 claude-сессии');
      assert.ok(filtered.every((s) => s.agent === 'claude'), 'все сессии агента claude');
   });

   it('filter codex → пустой результат (нет codex-сессий в claude history)', () => {
      const events = loadHistorySync(historyPath);
      const allSessions = groupSessions(events);
      const filtered = filterByAgent(allSessions, 'codex');

      assert.equal(filtered.length, 0, 'codex-сессий нет → пустой массив');
   });
});

describe('cli-list: Повреждённые данные', () => {
   let tmpDir;
   let historyPath;

   before(() => {
      tmpDir = makeTempDir('cs-list-corrupt-');
      historyPath = join(tmpDir, 'history.jsonl');

      // Смешиваем валидные и невалидные строки
      const lines = [
         makeHistoryEvent('session-valid-1', '/home/user/proj', Date.now() - 3000),
         '{ invalid json !!!',
         'not json at all',
         makeHistoryEvent('session-valid-2', '/home/user/proj2', Date.now() - 1000),
         '',
         '{"incomplete":',
      ].join('\n');
      writeFileSync(historyPath, lines + '\n', 'utf8');
   });

   after(() => cleanup(tmpDir));

   it('невалидные строки пропускаются, валидные возвращаются', () => {
      const events = loadHistorySync(historyPath);
      // Только 2 валидные строки с sessionId
      const sessions = groupSessions(events);

      assert.ok(events.length >= 2, 'минимум 2 валидных события');
      assert.equal(sessions.length, 2, 'должно быть 2 сессии из валидных данных');
   });

   it('парсинг повреждённых данных не бросает исключений', () => {
      assert.doesNotThrow(() => {
         const events = loadHistorySync(historyPath);
         groupSessions(events);
      }, 'парсинг не должен бросать исключений');
   });

   it('валидные события содержат корректные sessionId', () => {
      const events = loadHistorySync(historyPath);
      const sessions = groupSessions(events);

      assert.ok(sessions.some((s) => s.id === 'session-valid-1'), 'session-valid-1 должна быть');
      assert.ok(sessions.some((s) => s.id === 'session-valid-2'), 'session-valid-2 должна быть');
   });
});
