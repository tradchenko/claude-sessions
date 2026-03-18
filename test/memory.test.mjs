import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('memory config paths', () => {
   it('exports MEMORY_DIR path', async () => {
      const { MEMORY_DIR } = await import('../src/config.mjs');
      assert.ok(MEMORY_DIR);
      assert.ok(MEMORY_DIR.includes('session-memory'));
   });

   it('exports MEMORY_INDEX path', async () => {
      const { MEMORY_INDEX } = await import('../src/config.mjs');
      assert.ok(MEMORY_INDEX.endsWith('index.json'));
   });

   it('exports MEMORY_CONFIG path', async () => {
      const { MEMORY_CONFIG } = await import('../src/config.mjs');
      assert.ok(MEMORY_CONFIG.endsWith('config.json'));
   });
});

describe('memory config', () => {
   let tempDir;
   beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'cs-cfg-')); });
   afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

   it('returns defaults when config.json missing', async () => {
      const { readMemoryConfig } = await import('../src/memory/config.mjs');
      const cfg = readMemoryConfig('/nonexistent/config.json');
      assert.equal(cfg.extractionModel, 'haiku');
      assert.equal(cfg.enabled, false);
      assert.equal(cfg.maxRetries, 3);
   });

   it('merges user config with defaults', async () => {
      const { readMemoryConfig } = await import('../src/memory/config.mjs');
      writeFileSync(join(tempDir, 'config.json'), JSON.stringify({ extractionModel: 'sonnet' }));
      const cfg = readMemoryConfig(join(tempDir, 'config.json'));
      assert.equal(cfg.extractionModel, 'sonnet');
      assert.equal(cfg.maxRetries, 3);
   });
});

describe('memory index', () => {
   let tempDir, indexPath, lockPath;

   beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cs-mem-'));
      indexPath = join(tempDir, 'index.json');
      lockPath = join(tempDir, 'index.lock');
   });

   afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
   });

   it('creates new index with correct schema', async () => {
      const { readIndex } = await import('../src/memory/index.mjs');
      const idx = readIndex(indexPath);
      assert.equal(idx.version, 1);
      assert.deepEqual(idx.memories, {});
      assert.deepEqual(idx.sessions, {});
   });

   it('writes and reads index atomically', async () => {
      const { readIndex, writeIndex } = await import('../src/memory/index.mjs');
      const idx = { version: 1, memories: { 'profile/test': { name: 'test', category: 'profile', hotness: 0.5 } }, sessions: {} };
      writeIndex(indexPath, idx);
      const read = readIndex(indexPath);
      assert.equal(read.memories['profile/test'].hotness, 0.5);
   });

   it('acquires and releases file lock', async () => {
      const { acquireLock, releaseLock } = await import('../src/memory/index.mjs');
      const acquired = acquireLock(lockPath);
      assert.equal(acquired, true);
      const second = acquireLock(lockPath);
      assert.equal(second, false);
      releaseLock(lockPath);
      const third = acquireLock(lockPath);
      assert.equal(third, true);
      releaseLock(lockPath);
   });

   it('detects and cleans stale lock', async () => {
      const { acquireLock, releaseLock } = await import('../src/memory/index.mjs');
      writeFileSync(lockPath, '999999999');
      const acquired = acquireLock(lockPath);
      assert.equal(acquired, true);
      releaseLock(lockPath);
   });

   it('enforces memory limit with hysteresis', async () => {
      const { enforceMemoryLimit } = await import('../src/memory/index.mjs');
      const idx = { version: 1, memories: {}, sessions: {} };
      for (let i = 0; i < 510; i++) {
         idx.memories[`cases/mem-${i}`] = { name: `mem-${i}`, category: 'cases', hotness: i / 510 };
      }
      const pruned = enforceMemoryLimit(idx);
      assert.ok(Object.keys(pruned.memories).length <= 400);
   });
});

describe('hotness scoring', () => {
   it('returns high score for fresh, frequent, project-matched memory', async () => {
      const { calculateHotness } = await import('../src/memory/hotness.mjs');
      const score = calculateHotness({
         lastAccessed: Date.now(),
         active_count: 10,
         projects: ['/my/project'],
         category: 'cases',
      }, { maxActiveCount: 10, currentProject: '/my/project' });
      assert.ok(score > 0.9);
   });

   it('returns low score for old, unused, unrelated memory', async () => {
      const { calculateHotness } = await import('../src/memory/hotness.mjs');
      const score = calculateHotness({
         lastAccessed: Date.now() - 90 * 24 * 60 * 60 * 1000,
         active_count: 1,
         projects: ['/other/project'],
         category: 'events',
      }, { maxActiveCount: 100, currentProject: '/my/project' });
      assert.ok(score < 0.2);
   });

   it('applies correct category weights', async () => {
      const { CATEGORY_WEIGHTS } = await import('../src/memory/hotness.mjs');
      assert.equal(CATEGORY_WEIGHTS.cases, 0.8);
      assert.equal(CATEGORY_WEIGHTS.preferences, 0.7);
      assert.equal(CATEGORY_WEIGHTS.profile, 0.5);
   });

   it('recalculateAll updates all memory hotness values', async () => {
      const { recalculateAll } = await import('../src/memory/hotness.mjs');
      const index = {
         memories: {
            'profile/a': { lastAccessed: Date.now(), active_count: 5, projects: ['/p'], category: 'profile' },
            'cases/b': { lastAccessed: Date.now() - 30*24*60*60*1000, active_count: 1, projects: [], category: 'cases' },
         },
         sessions: {},
      };
      const result = recalculateAll(index, '/p');
      assert.ok(typeof result.memories['profile/a'].hotness === 'number');
      assert.ok(typeof result.memories['cases/b'].hotness === 'number');
      assert.ok(result.memories['profile/a'].hotness > result.memories['cases/b'].hotness);
   });
});
