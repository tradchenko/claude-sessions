/**
 * Тесты модуля memory/hotness.ts — Plan 03-05-02
 * Проверяют calculateHotness, recalculateAll, DECAY_TAU_DAYS и веса.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

let calculateHotness, recalculateAll, CATEGORY_WEIGHTS;

// Импорт из dist (тесты запускаются после build)
const mod = await import('../dist/memory/hotness.js');
calculateHotness = mod.calculateHotness;
recalculateAll = mod.recalculateAll;
CATEGORY_WEIGHTS = mod.CATEGORY_WEIGHTS;

// ─── DECAY_TAU_DAYS = 60 ──────────────────────────────────────────────────────

describe('hotness: DECAY_TAU_DAYS', () => {
   it('дата 60 дней назад → recencyScore ≈ exp(-1) ≈ 0.368', () => {
      const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
      // frequency=0, relevance с projectMatch=0.3 (projects=[]), category=cases(0.8)
      // recencyScore ≈ 0.368, frequencyScore=0, relevanceScore = 0.3*0.6 + 0.8*0.4 = 0.18+0.32=0.5
      // hotness = 0.368*0.3 + 0*0.4 + 0.5*0.3 = 0.1104 + 0 + 0.15 = ~0.26
      const h = calculateHotness(
         { lastAccessed: sixtyDaysAgo, active_count: 0, projects: [], category: 'cases' },
         { maxActiveCount: 1, currentProject: '' }
      );
      // Проверяем что recency компонент ≈ exp(-1)*0.3 ≈ 0.11
      // Вычислим recencyScore отдельно через обратную формулу:
      // h = recencyScore*0.3 + 0 + relevance*0.3
      // relevance = 0.3*0.6 + CATEGORY_WEIGHTS['cases']*0.4 = 0.18 + 0.8*0.4 = 0.5
      // recencyScore = (h - 0.5*0.3) / 0.3
      const relevance = 0.3 * 0.6 + (CATEGORY_WEIGHTS['cases'] || 0.8) * 0.4;
      const recencyScore = (h - relevance * 0.3) / 0.3;
      assert.ok(Math.abs(recencyScore - Math.exp(-1)) < 0.01, `recencyScore=${recencyScore.toFixed(4)} должен быть ≈ exp(-1)=${Math.exp(-1).toFixed(4)}`);
   });

   it('дата сегодня → recencyScore ≈ 1.0', () => {
      const now = Date.now();
      const h = calculateHotness(
         { lastAccessed: now, active_count: 0, projects: [], category: 'cases' },
         { maxActiveCount: 1, currentProject: '' }
      );
      // recencyScore ≈ 1.0, relevance = 0.5
      // h ≈ 1.0*0.3 + 0 + 0.5*0.3 = 0.45
      const relevance = 0.3 * 0.6 + (CATEGORY_WEIGHTS['cases'] || 0.8) * 0.4;
      const recencyScore = (h - relevance * 0.3) / 0.3;
      assert.ok(recencyScore > 0.99, `recencyScore=${recencyScore.toFixed(4)} должен быть ≈ 1.0`);
   });
});

// ─── Веса: frequency=0.4, recency=0.3, relevance=0.3 ─────────────────────────

describe('hotness: веса компонентов', () => {
   it('максимальная frequency (active_count = maxActiveCount) увеличивает hotness на 0.4', () => {
      const now = Date.now();
      const baseH = calculateHotness(
         { lastAccessed: now, active_count: 0, projects: [], category: 'cases' },
         { maxActiveCount: 10, currentProject: '' }
      );
      const maxH = calculateHotness(
         { lastAccessed: now, active_count: 10, projects: [], category: 'cases' },
         { maxActiveCount: 10, currentProject: '' }
      );
      // frequencyScore переходит от 0 к 1.0, вклад = 0.4
      assert.ok(Math.abs(maxH - baseH - 0.4) < 0.01, `Разница=${(maxH - baseH).toFixed(4)} должна быть ≈ 0.4`);
   });

   it('projectMatch=1.0 vs 0.0 отличается на categoryWeight*0.4*0.6 на relevanceWeight', () => {
      const now = Date.now();
      const withProject = calculateHotness(
         { lastAccessed: now, active_count: 0, projects: ['my-project'], category: 'cases' },
         { maxActiveCount: 1, currentProject: 'my-project' }
      );
      const noProject = calculateHotness(
         { lastAccessed: now, active_count: 0, projects: ['other-project'], category: 'cases' },
         { maxActiveCount: 1, currentProject: 'my-project' }
      );
      // withProject: relevance = 1.0*0.6 + cw*0.4
      // noProject:   relevance = 0.0*0.6 + cw*0.4
      // Разница relevance = 0.6, вклад в hotness = 0.6*0.3 = 0.18
      assert.ok(Math.abs(withProject - noProject - 0.18) < 0.01, `Разница=${(withProject - noProject).toFixed(4)} должна быть ≈ 0.18`);
   });

   it('CATEGORY_WEIGHTS содержит все 6 категорий', () => {
      const cats = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
      for (const cat of cats) {
         assert.ok(cat in CATEGORY_WEIGHTS, `CATEGORY_WEIGHTS[${cat}] должен существовать`);
         assert.ok(CATEGORY_WEIGHTS[cat] > 0 && CATEGORY_WEIGHTS[cat] <= 1, `Вес ${cat}=${CATEGORY_WEIGHTS[cat]} должен быть в (0,1]`);
      }
   });
});

// ─── recalculateAll ───────────────────────────────────────────────────────────

describe('hotness: recalculateAll', () => {
   it('пересчитывает hotness для всех memories в индексе', () => {
      const now = Date.now();
      const index = {
         version: 1,
         memories: {
            'cases/fix-auth': {
               name: 'fix-auth',
               category: 'cases',
               description: 'auth fix',
               content: 'Fixed auth token expiry issue',
               hotness: 0,
               active_count: 3,
               created: new Date(now).toISOString(),
               updated: new Date(now).toISOString(),
               source_sessions: [],
               projects: ['my-project'],
               lastAccessed: now,
            },
            'patterns/testing': {
               name: 'testing',
               category: 'patterns',
               description: 'testing pattern',
               content: 'Always write tests first',
               hotness: 0,
               active_count: 1,
               created: new Date(now).toISOString(),
               updated: new Date(now).toISOString(),
               source_sessions: [],
               projects: [],
               lastAccessed: now,
            },
         },
         sessions: {},
      };

      const updated = recalculateAll(index, 'my-project');
      const authHotness = updated.memories['cases/fix-auth'].hotness;
      const patternHotness = updated.memories['patterns/testing'].hotness;

      assert.ok(authHotness > 0, 'hotness для cases/fix-auth должен быть > 0');
      assert.ok(patternHotness > 0, 'hotness для patterns/testing должен быть > 0');
      // cases/fix-auth имеет больший active_count и совпадает с currentProject → должен быть горячее
      assert.ok(authHotness > patternHotness, 'cases/fix-auth должен быть горячее patterns/testing');
   });

   it('пустой индекс → не кидает ошибку', () => {
      const index = { version: 1, memories: {}, sessions: {} };
      assert.doesNotThrow(() => recalculateAll(index, 'any-project'));
   });

   it('возвращает тот же объект индекса (мутация in-place)', () => {
      const index = { version: 1, memories: {}, sessions: {} };
      const result = recalculateAll(index, '');
      assert.equal(result, index, 'recalculateAll должен возвращать тот же объект');
   });
});
