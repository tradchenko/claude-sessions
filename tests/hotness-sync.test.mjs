/**
 * SYNC guard тест: проверяет что hotness константы в session-start.ts
 * идентичны каноническим значениям из dist/memory/hotness.js.
 *
 * session-start.ts — standalone скрипт (копируется в ~/.claude/scripts/),
 * не может импортировать из dist/, поэтому дублирует константы.
 * Этот тест гарантирует что копия не разойдётся с источником.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_WEIGHTS, calculateHotness } from '../dist/memory/hotness.js';

// Жёстко заданные значения из session-start.ts (SYNC-копия)
const SESSION_START_CATEGORY_WEIGHTS = {
   profile: 0.5,
   preferences: 0.7,
   entities: 0.4,
   events: 0.3,
   cases: 0.8,
   patterns: 0.6,
};

const SESSION_START_DECAY_TAU_DAYS = 60;

/** Формула calculateHotness из session-start.ts (дублированная копия) */
function sessionStartCalculateHotness(memory, context) {
   const { lastAccessed = Date.now(), active_count = 0, projects = [], category = 'cases' } = memory;
   const { maxActiveCount = 1, currentProject = '' } = context;

   const daysSince = (Date.now() - lastAccessed) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.exp(-daysSince / SESSION_START_DECAY_TAU_DAYS);
   const frequencyScore = maxActiveCount > 0 ? Math.min(active_count / maxActiveCount, 1.0) : 0;

   const projectMatch = projects.includes(currentProject) ? 1.0 : projects.length === 0 ? 0.3 : 0.0;
   const categoryWeight = SESSION_START_CATEGORY_WEIGHTS[category] || 0.5;
   const relevanceScore = projectMatch * 0.6 + categoryWeight * 0.4;

   return recencyScore * 0.3 + frequencyScore * 0.4 + relevanceScore * 0.3;
}

describe('SYNC guard: session-start.ts hotness константы', () => {
   it('DECAY_TAU_DAYS === 60 в hotness.ts (проверка через формулу)', () => {
      // Проверяем значение tau косвенно: exp(-1/tau) при daysSince=1
      // Если tau=60, то recencyScore=exp(-1/60)≈0.9834
      // Используем reference input с lastAccessed = сейчас - 1 день
      const oneDayAgo = Date.now() - 1000 * 60 * 60 * 24;
      const expectedRecency = Math.exp(-1 / SESSION_START_DECAY_TAU_DAYS);

      const result = calculateHotness(
         { lastAccessed: oneDayAgo, active_count: 0, projects: [], category: 'cases' },
         { maxActiveCount: 1, currentProject: '' },
      );

      // recency * 0.3 + frequency * 0.4 + relevance * 0.3
      // = expectedRecency*0.3 + 0*0.4 + (0.3*0.6 + 0.8*0.4)*0.3
      const expectedRelevance = 0.3 * 0.6 + 0.8 * 0.4;
      const expected = expectedRecency * 0.3 + 0 * 0.4 + expectedRelevance * 0.3;

      assert.ok(
         Math.abs(result - expected) < 1e-10,
         `calculateHotness даёт ${result}, ожидается ${expected} (tau=60)`,
      );
   });

   it('все 6 категорий CATEGORY_WEIGHTS совпадают с session-start.ts', () => {
      const categories = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
      for (const cat of categories) {
         assert.strictEqual(
            CATEGORY_WEIGHTS[cat],
            SESSION_START_CATEGORY_WEIGHTS[cat],
            `CATEGORY_WEIGHTS[${cat}]: hotness.ts=${CATEGORY_WEIGHTS[cat]}, session-start.ts=${SESSION_START_CATEGORY_WEIGHTS[cat]}`,
         );
      }
   });

   it('calculateHotness даёт идентичные результаты на reference input', () => {
      // Reference input: фиксированное время для детерминированности
      const fixedTime = 1700000000000; // 2023-11-14
      const inputs = [
         { lastAccessed: fixedTime - 1000 * 60 * 60 * 24 * 5, active_count: 3, projects: ['my-project'], category: 'cases' },
         { lastAccessed: fixedTime - 1000 * 60 * 60 * 24 * 30, active_count: 1, projects: [], category: 'preferences' },
         { lastAccessed: fixedTime - 1000 * 60 * 60 * 24 * 90, active_count: 10, projects: ['other'], category: 'entities' },
      ];
      const context = { maxActiveCount: 10, currentProject: 'my-project' };

      for (const input of inputs) {
         const canonical = calculateHotness(input, context);
         const standalone = sessionStartCalculateHotness(input, context);
         assert.ok(
            Math.abs(canonical - standalone) < 1e-10,
            `calculateHotness расходится для category=${input.category}: canonical=${canonical}, standalone=${standalone}`,
         );
      }
   });
});
