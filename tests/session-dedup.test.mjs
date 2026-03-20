/**
 * Тесты дедупликации сессий — Plan 02-07-03
 * Тестирует логику кросс-адаптерной дедупликации из sessions/loader.ts:
 * - дубли по id+project → одна запись
 * - нативный адаптер приоритет над Companion
 * - разные agent но одинаковый id → обе сохраняются (если разный project)
 *
 * Дедупликация — чистая функция над массивом Session, тестируем inline-реализацию.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline-реализация дедупликации (зеркало loader.ts) ──────────────────────

/**
 * Дедупликация сессий: ключ = id:project, нативный приоритет над Companion.
 * Зеркало алгоритма из src/sessions/loader.ts — тестируем логику изолированно.
 */
function deduplicateSessions(sessions) {
   const deduped = new Map();

   for (const session of sessions) {
      const key = `${session.id}:${session.project}`;
      const existing = deduped.get(key);

      if (!existing) {
         deduped.set(key, session);
         continue;
      }

      const existingIsCompanion = existing.viaCompanion === true;
      const currentIsCompanion = session.viaCompanion === true;

      if (existingIsCompanion && !currentIsCompanion) {
         // Текущая нативная — заменяем Companion
         deduped.set(key, session);
      }
      // Иначе — оставляем первую
   }

   return Array.from(deduped.values());
}

// ─── Фабрика тестовых сессий ──────────────────────────────────────────────────

function makeSession({ id, project, agent = 'claude', viaCompanion = false, lastTs = 1000 } = {}) {
   return {
      id,
      project,
      projectPath: `/home/${project}`,
      summary: `Session ${id}`,
      dateStr: '2026-01-01',
      cnt: '',
      lastTs,
      count: 1,
      searchText: `${project} session ${id}`.toLowerCase(),
      agent,
      viaCompanion: viaCompanion || undefined,
   };
}

// ─── Тесты дедупликации ───────────────────────────────────────────────────────

describe('дедупликация: базовые случаи', () => {
   it('пустой массив → пустой результат', () => {
      const result = deduplicateSessions([]);
      assert.equal(result.length, 0);
   });

   it('одна сессия → одна запись', () => {
      const sessions = [makeSession({ id: 'abc', project: 'myproject' })];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 'abc');
   });

   it('две сессии с разными id → две записи', () => {
      const sessions = [
         makeSession({ id: 'aaa', project: 'proj' }),
         makeSession({ id: 'bbb', project: 'proj' }),
      ];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 2);
   });

   it('две сессии с разными project → две записи', () => {
      const sessions = [
         makeSession({ id: 'same-id', project: 'proj-a' }),
         makeSession({ id: 'same-id', project: 'proj-b' }),
      ];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 2);
   });
});

describe('дедупликация: дубли по id+project', () => {
   it('два адаптера возвращают сессию с одинаковым id+project → одна запись', () => {
      const sessions = [
         makeSession({ id: 'dup-id', project: 'my-project', agent: 'claude', lastTs: 2000 }),
         makeSession({ id: 'dup-id', project: 'my-project', agent: 'claude', lastTs: 1000 }),
      ];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 1, 'должна быть одна запись после дедупликации');
      assert.equal(result[0].id, 'dup-id');
   });

   it('10 дублей с одинаковым id+project → одна запись', () => {
      const sessions = Array.from({ length: 10 }, (_, i) =>
         makeSession({ id: 'same', project: 'same-project', lastTs: 1000 - i }),
      );
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 1);
   });
});

describe('дедупликация: приоритет нативного над Companion', () => {
   it('Companion сессия + нативная с одинаковым ключом → нативная побеждает', () => {
      const companionSession = makeSession({ id: 'test-id', project: 'proj', agent: 'claude', viaCompanion: true });
      const nativeSession = makeSession({ id: 'test-id', project: 'proj', agent: 'claude', viaCompanion: false });

      // Companion первым
      const result1 = deduplicateSessions([companionSession, nativeSession]);
      assert.equal(result1.length, 1);
      assert.equal(result1[0].viaCompanion, undefined, 'нативная должна победить: viaCompanion=undefined');

      // Нативный первым
      const result2 = deduplicateSessions([nativeSession, companionSession]);
      assert.equal(result2.length, 1);
      assert.equal(result2[0].viaCompanion, undefined, 'нативная должна сохраниться');
   });

   it('нативный приоритет независимо от порядка', () => {
      const native = makeSession({ id: 'x', project: 'y', agent: 'claude' });
      const companion = makeSession({ id: 'x', project: 'y', agent: 'claude', viaCompanion: true });

      const resultA = deduplicateSessions([native, companion]);
      const resultB = deduplicateSessions([companion, native]);

      assert.equal(resultA.length, 1);
      assert.equal(resultB.length, 1);
      // Обе результата должны быть нативной сессией
      assert.ok(!resultA[0].viaCompanion);
      assert.ok(!resultB[0].viaCompanion);
   });

   it('два Companion дубля → одна запись (первая)', () => {
      const companion1 = makeSession({ id: 'c1', project: 'cp', agent: 'claude', viaCompanion: true, lastTs: 2000 });
      const companion2 = makeSession({ id: 'c1', project: 'cp', agent: 'claude', viaCompanion: true, lastTs: 1000 });
      const result = deduplicateSessions([companion1, companion2]);
      assert.equal(result.length, 1);
      assert.equal(result[0].lastTs, 2000, 'должна сохраниться первая');
   });
});

describe('дедупликация: разные agent с одинаковым id', () => {
   it('разный project — обе сохраняются', () => {
      const sessions = [
         makeSession({ id: 'shared-id', project: 'claude-project', agent: 'claude' }),
         makeSession({ id: 'shared-id', project: 'codex-project', agent: 'codex' }),
      ];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 2, 'разные project → разные ключи → обе сохраняются');
   });

   it('совпадают id И project, разный agent → первая сохраняется', () => {
      const sessions = [
         makeSession({ id: 'same', project: 'same', agent: 'claude' }),
         makeSession({ id: 'same', project: 'same', agent: 'qwen' }),
      ];
      const result = deduplicateSessions(sessions);
      assert.equal(result.length, 1, 'одинаковый ключ id+project → дедупликация');
      assert.equal(result[0].agent, 'claude', 'сохраняется первая');
   });
});
