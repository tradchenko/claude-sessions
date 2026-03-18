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
