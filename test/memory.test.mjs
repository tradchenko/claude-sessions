import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

describe('L0 extraction', () => {
   it('extracts summary from messages', async () => {
      const { extractL0FromMessages } = await import('../src/memory/extract-l0.mjs');
      const messages = [
         { role: 'user', content: 'Fix the login bug in auth.js' },
         { role: 'assistant', content: 'I will look at src/auth.js and src/middleware/session.js' },
         { role: 'user', content: 'Also update the tests' },
      ];
      const l0 = extractL0FromMessages(messages, '/my/project');
      assert.ok(l0.summary.length > 0);
      assert.ok(l0.summary.length <= 120);
      assert.equal(l0.project, '/my/project');
      assert.equal(l0.messageCount, 3);
      assert.ok(l0.files.includes('src/auth.js'));
   });

   it('extracts file paths from text', async () => {
      const { extractFilePaths } = await import('../src/memory/extract-l0.mjs');
      const text = 'I modified src/config.mjs and test/run.mjs, also checked package.json';
      const files = extractFilePaths(text);
      assert.ok(files.includes('src/config.mjs'));
      assert.ok(files.includes('test/run.mjs'));
      assert.ok(files.includes('package.json'));
   });

   it('returns empty L0 for empty messages', async () => {
      const { extractL0FromMessages } = await import('../src/memory/extract-l0.mjs');
      const l0 = extractL0FromMessages([], '/project');
      assert.equal(l0.messageCount, 0);
      assert.equal(l0.summary, '');
   });

   it('extracts L0 from raw JSONL lines', async () => {
      const { extractL0FromJSONL } = await import('../src/memory/extract-l0.mjs');
      const lines = [
         JSON.stringify({ type: 'human', message: { content: 'Fix the login bug in auth.js' } }),
         JSON.stringify({ type: 'assistant', message: { content: 'Looking at src/auth.js and src/middleware/session.js' } }),
      ];
      const l0 = extractL0FromJSONL(lines, '/my/project');
      assert.equal(l0.messageCount, 2);
      assert.ok(l0.summary.includes('Fix the login'));
      assert.ok(l0.files.includes('src/auth.js'));
   });

   it('handles malformed JSONL lines gracefully', async () => {
      const { extractL0FromJSONL } = await import('../src/memory/extract-l0.mjs');
      const lines = ['not json', '{ broken', JSON.stringify({ type: 'human', message: { content: 'hello' } })];
      const l0 = extractL0FromJSONL(lines, '/project');
      assert.equal(l0.messageCount, 1);
   });
});

describe('memory file format', () => {
   it('serializes memory to file content', async () => {
      const { serializeMemory } = await import('../src/memory/format.mjs');
      const meta = { name: 'test', category: 'cases', hotness: 0.5 };
      const content = 'Fixed the auth bug by checking token expiry.';
      const file = serializeMemory(meta, content);
      assert.ok(file.startsWith('<!--json'));
      assert.ok(file.includes('"name": "test"'));
      assert.ok(file.endsWith(content));
   });

   it('parses memory file back to meta + content', async () => {
      const { serializeMemory, parseMemory } = await import('../src/memory/format.mjs');
      const meta = { name: 'test', category: 'cases', hotness: 0.5, active_count: 3 };
      const content = 'Some memory content here.';
      const file = serializeMemory(meta, content);
      const parsed = parseMemory(file);
      assert.equal(parsed.meta.name, 'test');
      assert.equal(parsed.meta.hotness, 0.5);
      assert.equal(parsed.content, content);
   });

   it('handles malformed files gracefully', async () => {
      const { parseMemory } = await import('../src/memory/format.mjs');
      const parsed = parseMemory('just plain text without frontmatter');
      assert.equal(parsed.meta, null);
      assert.equal(parsed.content, 'just plain text without frontmatter');
   });
});

describe('deduplication', () => {
   it('detects exact match by category + name', async () => {
      const { findMatch } = await import('../src/memory/dedup.mjs');
      const index = {
         memories: { 'profile/user-role': { name: 'user-role', category: 'profile', content: 'Senior dev' } }
      };
      const result = findMatch({ name: 'user-role', category: 'profile', content: 'Senior dev, 10 years' }, index);
      assert.equal(result.type, 'exact');
      assert.equal(result.key, 'profile/user-role');
   });

   it('detects fuzzy match by word overlap', async () => {
      const { findMatch } = await import('../src/memory/dedup.mjs');
      const index = {
         memories: { 'cases/auth-bug-fix': { name: 'auth-bug-fix', category: 'cases', content: 'Fixed auth token expiry bug in middleware' } }
      };
      const result = findMatch({ name: 'token-expiry-fix', category: 'cases', content: 'Fixed token expiry issue in auth middleware' }, index);
      assert.equal(result.type, 'fuzzy');
   });

   it('returns no match for unrelated memory', async () => {
      const { findMatch } = await import('../src/memory/dedup.mjs');
      const index = {
         memories: { 'cases/auth-fix': { name: 'auth-fix', category: 'cases', content: 'Fixed auth token' } }
      };
      const result = findMatch({ name: 'deploy-script', category: 'patterns', content: 'Use blue-green deployment' }, index);
      assert.equal(result.type, 'none');
   });

   it('calculates Jaccard similarity correctly', async () => {
      const { jaccardSimilarity } = await import('../src/memory/dedup.mjs');
      assert.equal(jaccardSimilarity('the cat sat', 'the cat sat'), 1.0);
      assert.ok(jaccardSimilarity('the cat sat', 'the dog sat') >= 0.5);
      assert.equal(jaccardSimilarity('hello world', 'goodbye moon'), 0);
   });

   it('merges appendable categories', async () => {
      const { mergeContent } = await import('../src/memory/dedup.mjs');
      const result = mergeContent('Line one.\nLine two.', 'Line two.\nLine three.', 'profile');
      assert.ok(result.includes('Line one'));
      assert.ok(result.includes('Line three'));
      assert.equal(result.split('Line two').length - 1, 1);
   });

   it('resolveCandidate skips duplicate immutable', async () => {
      const { resolveCandidate } = await import('../src/memory/dedup.mjs');
      const index = {
         memories: { 'events/deploy': { name: 'deploy', category: 'events', content: 'Deployed v2 to production on March 15' } }
      };
      const resolution = resolveCandidate({ name: 'deploy', category: 'events', content: 'Deployed v2 to production on March 15' }, index);
      assert.equal(resolution.action, 'skip');
   });
});

describe('stop hook with L0', () => {
   let tempDir;

   beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cs-hook-'));
      mkdirSync(join(tempDir, 'session-memory'), { recursive: true });
   });

   afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
   });

   it('writes L0 to memory index on session save', async () => {
      const { saveSessionWithL0 } = await import('../src/save-session-summary.mjs');
      const jsonlDir = join(tempDir, 'projects', '-test');
      mkdirSync(jsonlDir, { recursive: true });
      const sessionId = 'test-session-123';
      writeFileSync(join(jsonlDir, sessionId + '.jsonl'),
         JSON.stringify({ type: 'human', message: { content: 'Fix the login bug' } }) + '\n' +
         JSON.stringify({ type: 'assistant', message: { content: 'Looking at src/auth.js' } }) + '\n'
      );

      const indexPath = join(tempDir, 'session-memory', 'index.json');
      saveSessionWithL0({
         sessionId,
         project: '/test',
         indexPath,
         projectsDir: join(tempDir, 'projects'),
      });

      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      assert.ok(index.sessions[sessionId]);
      assert.ok(index.sessions[sessionId].l0);
      assert.ok(index.sessions[sessionId].l0.summary.includes('Fix the login'));
   });

   it('handles missing JSONL gracefully', async () => {
      const { saveSessionWithL0 } = await import('../src/save-session-summary.mjs');
      const indexPath = join(tempDir, 'session-memory', 'index.json');
      saveSessionWithL0({
         sessionId: 'nonexistent-session',
         project: '/test',
         indexPath,
         projectsDir: join(tempDir, 'projects'),
      });

      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      assert.ok(index.sessions['nonexistent-session']);
      assert.ok(index.sessions['nonexistent-session'].lastActive);
   });
});

describe('L1 extraction', () => {
   it('builds extraction prompt from messages', async () => {
      const { buildExtractionPrompt } = await import('../src/memory/extract-l1.mjs');
      const messages = [
         { role: 'user', content: 'Fix auth bug' },
         { role: 'assistant', content: 'Fixed by updating token expiry check in src/auth.js' },
      ];
      const prompt = buildExtractionPrompt(messages);
      assert.ok(prompt.includes('Extract structured memories'));
      assert.ok(prompt.includes('Fix auth bug'));
      assert.ok(prompt.includes('category'));
   });

   it('parses valid LLM JSON response', async () => {
      const { parseLLMResponse } = await import('../src/memory/extract-l1.mjs');
      const response = JSON.stringify([
         { category: 'cases', name: 'auth-token-fix', content: 'Fixed token expiry bug' }
      ]);
      const memories = parseLLMResponse(response);
      assert.equal(memories.length, 1);
      assert.equal(memories[0].category, 'cases');
   });

   it('handles malformed LLM response', async () => {
      const { parseLLMResponse } = await import('../src/memory/extract-l1.mjs');
      const memories = parseLLMResponse('not valid json at all');
      assert.deepEqual(memories, []);
   });

   it('filters out invalid categories', async () => {
      const { parseLLMResponse } = await import('../src/memory/extract-l1.mjs');
      const response = JSON.stringify([
         { category: 'cases', name: 'good', content: 'valid' },
         { category: 'invalid-cat', name: 'bad', content: 'invalid' },
         { category: 'profile', name: 'also-good', content: 'valid too' },
      ]);
      const memories = parseLLMResponse(response);
      assert.equal(memories.length, 2);
   });

   it('extracts JSON array from text with surrounding content', async () => {
      const { parseLLMResponse } = await import('../src/memory/extract-l1.mjs');
      const response = 'Here are the extracted memories:\n\n[{"category":"cases","name":"test","content":"test content"}]\n\nDone.';
      const memories = parseLLMResponse(response);
      assert.equal(memories.length, 1);
   });
});

describe('migration', () => {
   let tempDir;
   beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'cs-migrate-')); });
   afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

   it('migrates session-index.json to new index.json', async () => {
      const { migrateSessionIndex } = await import('../src/memory/migrate.mjs');
      const oldIndex = {
         'session-1': { sessionId: 'session-1', summary: 'Test session', project: '/test', lastActive: Date.now() },
         'session-2': { sessionId: 'session-2', summary: 'Another', project: '/test2', lastActive: Date.now() - 1000 },
      };
      writeFileSync(join(tempDir, 'session-index.json'), JSON.stringify(oldIndex));
      const newIndex = migrateSessionIndex(join(tempDir, 'session-index.json'), join(tempDir, 'index.json'));
      assert.equal(newIndex.version, 1);
      assert.ok(newIndex.sessions['session-1']);
      assert.equal(newIndex.sessions['session-1'].summary, 'Test session');
   });

   it('skips migration if index.json already exists', async () => {
      const { migrateSessionIndex } = await import('../src/memory/migrate.mjs');
      writeFileSync(join(tempDir, 'index.json'), JSON.stringify({ version: 1, memories: {}, sessions: {} }));
      writeFileSync(join(tempDir, 'session-index.json'), JSON.stringify({ 's1': { sessionId: 's1' } }));
      const result = migrateSessionIndex(join(tempDir, 'session-index.json'), join(tempDir, 'index.json'));
      // Should merge s1 into existing index
      assert.ok(result.sessions['s1']);
   });

   it('returns empty index when neither file exists', async () => {
      const { migrateSessionIndex } = await import('../src/memory/migrate.mjs');
      const result = migrateSessionIndex(join(tempDir, 'old.json'), join(tempDir, 'new.json'));
      assert.equal(result.version, 1);
      assert.deepEqual(result.sessions, {});
   });
});

describe('enable/disable memory', () => {
   let tempDir;
   beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'cs-enable-')); });
   afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

   it('enableMemory adds SessionStart hook to settings.json', async () => {
      const { enableMemory } = await import('../src/enable-memory.mjs');
      const settingsPath = join(tempDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));
      enableMemory({ settingsPath, claudeMdPath: join(tempDir, 'CLAUDE.md'), scriptsDir: tempDir });
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.ok(settings.hooks.SessionStart);
      assert.ok(settings.hooks.SessionStart.length > 0);
      assert.ok(settings.hooks.SessionStart[0].command.includes('session-start-hook'));
   });

   it('enableMemory adds section to CLAUDE.md', async () => {
      const { enableMemory } = await import('../src/enable-memory.mjs');
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMdPath, '# Existing content\n');
      enableMemory({ settingsPath: join(tempDir, 'settings.json'), claudeMdPath, scriptsDir: tempDir });
      const md = readFileSync(claudeMdPath, 'utf8');
      assert.ok(md.includes('Session Memory System'));
      assert.ok(md.includes('Existing content'));
   });

   it('enableMemory is idempotent', async () => {
      const { enableMemory } = await import('../src/enable-memory.mjs');
      const settingsPath = join(tempDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      enableMemory({ settingsPath, claudeMdPath, scriptsDir: tempDir });
      enableMemory({ settingsPath, claudeMdPath, scriptsDir: tempDir });
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(settings.hooks.SessionStart.length, 1);
   });

   it('disableMemory removes SessionStart hook', async () => {
      const { disableMemory } = await import('../src/disable-memory.mjs');
      const settingsPath = join(tempDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({
         hooks: { SessionStart: [{ type: 'command', command: 'node session-start-hook.mjs' }] }
      }));
      disableMemory({ settingsPath, claudeMdPath: join(tempDir, 'CLAUDE.md') });
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(settings.hooks.SessionStart.length, 0);
   });

   it('disableMemory removes CLAUDE.md section', async () => {
      const { disableMemory } = await import('../src/disable-memory.mjs');
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      writeFileSync(claudeMdPath, '# Before\n\n# Session Memory System\nSome content here.\n');
      disableMemory({ settingsPath: join(tempDir, 'settings.json'), claudeMdPath });
      const md = readFileSync(claudeMdPath, 'utf8');
      assert.ok(!md.includes('Session Memory System'));
      assert.ok(md.includes('Before'));
   });
});

describe('CLI memory commands', () => {
   it('formatMemoryStatus outputs stats', async () => {
      const { formatMemoryStatus } = await import('../src/memory-status.mjs');
      const index = {
         version: 1,
         memories: {
            'profile/a': { name: 'a', category: 'profile', hotness: 0.9, description: 'test' },
            'cases/b': { name: 'b', category: 'cases', hotness: 0.5, description: 'test2' },
         },
         sessions: { 's1': {}, 's2': {}, 's3': {} },
      };
      const output = formatMemoryStatus(index);
      assert.ok(output.includes('2')); // 2 memories
      assert.ok(output.includes('3')); // 3 sessions
      assert.ok(output.includes('profile'));
   });

   it('searchMemories finds by keyword', async () => {
      const { searchMemories } = await import('../src/memory-search.mjs');
      const index = {
         memories: {
            'cases/auth-fix': { name: 'auth-fix', category: 'cases', content: 'Fixed auth token expiry', description: 'Auth fix', hotness: 0.8 },
            'patterns/early-return': { name: 'early-return', category: 'patterns', content: 'Prefer early returns', description: 'Early returns', hotness: 0.5 },
         }
      };
      const results = searchMemories(index, 'auth');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'auth-fix');
   });

   it('searchMemories returns empty for no match', async () => {
      const { searchMemories } = await import('../src/memory-search.mjs');
      const index = { memories: { 'cases/a': { name: 'a', content: 'hello' } } };
      const results = searchMemories(index, 'nonexistent');
      assert.equal(results.length, 0);
   });
});

describe('catalog generation', () => {
   it('generates compact catalog table', async () => {
      const { generateCatalog } = await import('../src/memory/catalog.mjs');
      const index = {
         memories: {
            'profile/role': { name: 'role', category: 'profile', hotness: 0.9, description: 'Senior dev' },
            'cases/auth-fix': { name: 'auth-fix', category: 'cases', hotness: 0.7, description: 'Fixed auth token' },
         }
      };
      const catalog = generateCatalog(index);
      assert.ok(catalog.includes('role'));
      assert.ok(catalog.includes('profile'));
      assert.ok(catalog.length < 1500);
   });

   it('returns placeholder for empty index', async () => {
      const { generateCatalog } = await import('../src/memory/catalog.mjs');
      const catalog = generateCatalog({ memories: {} });
      assert.ok(catalog.includes('no memories'));
   });

   it('selects top hot memories for project', async () => {
      const { selectHotMemories } = await import('../src/memory/catalog.mjs');
      const index = {
         memories: {
            'cases/a': { name: 'a', category: 'cases', hotness: 0.9, content: 'Memory A', projects: ['/project'] },
            'cases/b': { name: 'b', category: 'cases', hotness: 0.8, content: 'Memory B', projects: ['/project'] },
            'cases/c': { name: 'c', category: 'cases', hotness: 0.7, content: 'Memory C', projects: ['/other'] },
            'cases/d': { name: 'd', category: 'cases', hotness: 0.6, content: 'Memory D', projects: ['/project'] },
         }
      };
      const hot = selectHotMemories(index, '/project', 2);
      assert.equal(hot.length, 2);
      assert.equal(hot[0].name, 'a');
   });

   it('formats full SessionStart output', async () => {
      const { formatSessionStartOutput } = await import('../src/memory/catalog.mjs');
      const index = {
         memories: {
            'cases/fix': { name: 'fix', category: 'cases', hotness: 0.9, content: 'Fixed the bug', description: 'Bug fix', projects: ['/p'] },
         }
      };
      const output = formatSessionStartOutput(index, '/p');
      assert.ok(output.includes('Session Memory'));
      assert.ok(output.includes('Memory Catalog'));
      assert.ok(output.includes('Hot Memories'));
      assert.ok(output.includes('Fixed the bug'));
   });
});

describe('lazy fallback', () => {
   it('detects sessions needing L1 extraction', async () => {
      const { checkPendingExtractions } = await import('../src/sessions.mjs');
      const index = {
         sessions: {
            's1': { l0: { summary: 'test' }, l1_ready: false },
            's2': { l0: { summary: 'test2' }, l1_ready: true },
            's3': { l0: { summary: 'test3' }, extraction_failed: true, extraction_attempts: 1 },
            's4': { l0: { summary: 'test4' }, extraction_failed: true, extraction_attempts: 3 },
         }
      };
      const pending = checkPendingExtractions(index);
      assert.equal(pending.length, 2); // s1 + s3 (retry allowed)
   });

   it('returns empty for fully processed index', async () => {
      const { checkPendingExtractions } = await import('../src/sessions.mjs');
      const index = { sessions: { 's1': { l0: {}, l1_ready: true }, 's2': { l1_ready: true } } };
      const pending = checkPendingExtractions(index);
      assert.equal(pending.length, 0);
   });
});

describe('native projection', () => {
   let tempDir;
   beforeEach(() => { tempDir = mkdtempSync(join(tmpdir(), 'cs-proj-')); });
   afterEach(() => { rmSync(tempDir, { recursive: true, force: true }); });

   it('projects hot memories to native format', async () => {
      const { projectToNativeFormat } = await import('../src/memory/project.mjs');
      const index = {
         memories: {
            'profile/role': { name: 'role', category: 'profile', hotness: 0.9, content: 'Senior dev', description: 'User role', projects: ['/test'] },
            'cases/fix': { name: 'fix', category: 'cases', hotness: 0.7, content: 'Fixed bug', description: 'Bug fix', projects: ['/test'] },
         }
      };
      const memDir = join(tempDir, 'memory');
      const count = projectToNativeFormat(index, '/test', memDir);
      assert.equal(count, 2);
      assert.ok(existsSync(join(memDir, 'sm-profile-role.md')));
      assert.ok(existsSync(join(memDir, 'sm-cases-fix.md')));
   });

   it('cleans old projected files before writing new', async () => {
      const { projectToNativeFormat } = await import('../src/memory/project.mjs');
      const memDir = join(tempDir, 'memory');
      mkdirSync(memDir, { recursive: true });
      writeFileSync(join(memDir, 'sm-old-file.md'), 'old content');

      const index = { memories: { 'cases/new': { name: 'new', category: 'cases', hotness: 0.5, content: 'New', projects: ['/p'] } } };
      projectToNativeFormat(index, '/p', memDir);
      assert.ok(!existsSync(join(memDir, 'sm-old-file.md')));
      assert.ok(existsSync(join(memDir, 'sm-cases-new.md')));
   });
});
