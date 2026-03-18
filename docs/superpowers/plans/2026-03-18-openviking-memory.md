# OpenViking Memory System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-layer memory (L0/L1/L2) with hotness scoring and auto-extraction to claude-sessions, with optional global Claude integration.

**Architecture:** Extend existing Stop hook with L0 extraction + background L1 process. New `session-memory/` directory stores categorized memories with JSON frontmatter. Unified `index.json` replaces `session-index.json`. SessionStart hook + CLAUDE.md injection for opt-in Claude integration.

**Tech Stack:** Node.js >=18, ESM, zero external dependencies, `node:test` for testing.

**Spec:** `docs/superpowers/specs/2026-03-18-openviking-memory-design.md`

---

## File Structure

### New files to create:
- `src/memory/index.mjs` — memory index CRUD (read/write/atomic/lock)
- `src/memory/hotness.mjs` — hotness scoring formula
- `src/memory/extract-l0.mjs` — L0 extraction from JSONL (no LLM)
- `src/memory/extract-l1.mjs` — L1 extraction via Claude CLI (background process entry point)
- `src/memory/dedup.mjs` — deduplication algorithm (exact + fuzzy match)
- `src/memory/format.mjs` — JSON frontmatter serialization/parsing (zero deps)
- `src/memory/catalog.mjs` — generate compact catalog for SessionStart hook
- `src/memory/migrate.mjs` — migrate session-index.json → index.json + generate L0 for existing sessions
- `src/memory/project.mjs` — project hot memories to native Claude format
- `src/memory/config.mjs` — memory config CRUD (model, enabled state, thresholds)
- `src/memory-status.mjs` — CLI command: memory stats
- `src/memory-search.mjs` — CLI command: search memories
- `src/enable-memory.mjs` — enable Claude integration (hooks + CLAUDE.md)
- `src/disable-memory.mjs` — disable Claude integration
- `src/session-start-hook.mjs` — SessionStart hook script (outputs catalog + hot memories)
- `claude-commands/memory-recall.md` — slash command template
- `claude-commands/memory-status.md` — slash command template
- `test/memory.test.mjs` — memory subsystem tests

### Files to modify:
- `src/config.mjs` — add MEMORY_DIR, MEMORY_INDEX, MEMORY_CONFIG paths
- `src/save-session-summary.mjs` — extend with L0 extraction + background spawn
- `src/install.mjs` — add memory migration + opt-in Claude integration prompt
- `src/sessions.mjs` — read from unified index.json instead of session-index.json
- `bin/cli.mjs` — add memory-status, memory-search, enable-memory, disable-memory, extract-memory commands
- `src/i18n.mjs` — add memory-related translations
- `package.json` — bump version, add new files to `files` array

---

## Task 1: Config paths and memory directory structure

**Files:**
- Modify: `src/config.mjs:50-57` (add new path constants)
- Test: `test/memory.test.mjs` (new file)

- [ ] **Step 1: Write failing test for new config paths**

```js
// test/memory.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('memory config', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL — MEMORY_DIR not exported

- [ ] **Step 3: Add path constants to config.mjs**

Add after line 57 in `src/config.mjs`:
```js
export const MEMORY_DIR = join(CLAUDE_DIR, 'session-memory');
export const MEMORY_INDEX = join(MEMORY_DIR, 'index.json');
export const MEMORY_CONFIG = join(MEMORY_DIR, 'config.json');
export const MEMORIES_DIR = join(MEMORY_DIR, 'memories');
export const MEMORY_LOCK = join(MEMORY_DIR, 'index.lock');
export const MEMORY_ERROR_LOG = join(MEMORY_DIR, 'error.log');
export const MEMORY_CATEGORIES = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Run existing tests to ensure no regression**

Run: `node --test test/run.mjs`
Expected: 23/23 PASS

- [ ] **Step 6: Commit**

```bash
git add src/config.mjs test/memory.test.mjs
git commit -m "feat: add memory directory path constants to config"
```

- [ ] **Step 7: Add memory config module**

Create `src/memory/config.mjs` — reads/writes `config.json` with defaults:
```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DEFAULTS = {
   enabled: false,           // Claude integration (SessionStart hook, CLAUDE.md)
   extractionModel: 'haiku', // Model for L1 extraction
   maxRetries: 3,            // Max extraction attempts per session
   hotnessPruneThreshold: 0.1,
   maxMemories: 500,
   pruneTarget: 400,
};

export function readMemoryConfig(configPath) {
   try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, 'utf8')) };
   } catch {
      return { ...DEFAULTS };
   }
}

export function writeMemoryConfig(configPath, config) {
   writeFileSync(configPath, JSON.stringify({ ...DEFAULTS, ...config }, null, 2));
}
```

- [ ] **Step 8: Write test for memory config**

```js
describe('memory config', () => {
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
      assert.equal(cfg.maxRetries, 3); // Default preserved
   });
});
```

- [ ] **Step 9: Run tests, commit**

```bash
git add src/memory/config.mjs test/memory.test.mjs
git commit -m "feat: memory config with defaults for extraction model and limits"
```

---

## Task 2: Memory index CRUD with atomic writes and file locking

**Files:**
- Create: `src/memory/index.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests for index operations**

```js
// append to test/memory.test.mjs
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
      const { readIndex, writeIndex } = await import('../src/memory/index.mjs');
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
      // Write a lock with non-existent PID
      writeFileSync(lockPath, '999999999');
      const acquired = acquireLock(lockPath);
      assert.equal(acquired, true);
      releaseLock(lockPath);
   });

   it('enforces memory limit with hysteresis', async () => {
      const { readIndex, writeIndex, enforceMemoryLimit } = await import('../src/memory/index.mjs');
      const idx = { version: 1, memories: {}, sessions: {} };
      // Add 510 memories
      for (let i = 0; i < 510; i++) {
         idx.memories[`cases/mem-${i}`] = { name: `mem-${i}`, category: 'cases', hotness: i / 510 };
      }
      const pruned = enforceMemoryLimit(idx);
      assert.ok(Object.keys(pruned.memories).length <= 400);
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory/index.mjs**

Create `src/memory/index.mjs`:
```js
import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, existsSync } from 'node:fs';

const EMPTY_INDEX = { version: 1, memories: {}, sessions: {} };
const MAX_MEMORIES = 500;
const PRUNE_TARGET = 400;

export function readIndex(indexPath) {
   try {
      return JSON.parse(readFileSync(indexPath, 'utf8'));
   } catch {
      return { ...EMPTY_INDEX };
   }
}

export function writeIndex(indexPath, data) {
   const tmpPath = indexPath + '.tmp.' + process.pid;
   writeFileSync(tmpPath, JSON.stringify(data, null, 2));
   renameSync(tmpPath, indexPath);
}

export function acquireLock(lockPath) {
   // Clean stale lock
   if (existsSync(lockPath)) {
      try {
         const pid = parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
         try { process.kill(pid, 0); return false; } // PID alive — lock held
         catch { unlinkSync(lockPath); } // PID dead — stale lock
      } catch { unlinkSync(lockPath); }
   }
   try {
      const fd = openSync(lockPath, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return true;
   } catch {
      return false;
   }
}

export function releaseLock(lockPath) {
   try { unlinkSync(lockPath); } catch {}
}

export function enforceMemoryLimit(index) {
   const keys = Object.keys(index.memories);
   if (keys.length <= MAX_MEMORIES) return index;

   const sorted = keys.sort((a, b) => (index.memories[a].hotness || 0) - (index.memories[b].hotness || 0));
   const toRemove = sorted.slice(0, keys.length - PRUNE_TARGET);
   for (const key of toRemove) {
      delete index.memories[key];
   }
   return index;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/index.mjs test/memory.test.mjs
git commit -m "feat: memory index CRUD with atomic writes and file locking"
```

---

## Task 3: Hotness scoring

**Files:**
- Create: `src/memory/hotness.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('hotness scoring', () => {
   it('returns 1.0 for fresh, frequent, project-matched memory', async () => {
      const { calculateHotness } = await import('../src/memory/hotness.mjs');
      const score = calculateHotness({
         lastAccessed: Date.now(),
         active_count: 10,
         projects: ['/my/project']
      }, { maxActiveCount: 10, currentProject: '/my/project' });
      assert.ok(score > 0.9);
   });

   it('returns low score for old, unused, unrelated memory', async () => {
      const { calculateHotness } = await import('../src/memory/hotness.mjs');
      const score = calculateHotness({
         lastAccessed: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days ago
         active_count: 1,
         projects: ['/other/project']
      }, { maxActiveCount: 100, currentProject: '/my/project' });
      assert.ok(score < 0.2);
   });

   it('applies correct category weights', async () => {
      const { CATEGORY_WEIGHTS } = await import('../src/memory/hotness.mjs');
      assert.equal(CATEGORY_WEIGHTS.cases, 0.8);
      assert.equal(CATEGORY_WEIGHTS.preferences, 0.7);
      assert.equal(CATEGORY_WEIGHTS.profile, 0.5);
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement hotness.mjs**

Create `src/memory/hotness.mjs`:
```js
export const CATEGORY_WEIGHTS = {
   profile: 0.5,
   preferences: 0.7,
   entities: 0.4,
   events: 0.3,
   cases: 0.8,
   patterns: 0.6,
};

// Decay constant tau (days). Score drops to ~0.5 at 21 days, ~0.37 at 30 days.
const DECAY_TAU_DAYS = 30;

export function calculateHotness(memory, context) {
   const { lastAccessed = Date.now(), active_count = 0, projects = [], category = 'cases' } = memory;
   const { maxActiveCount = 1, currentProject = '' } = context;

   const daysSince = (Date.now() - lastAccessed) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.exp(-daysSince / DECAY_TAU_DAYS);

   const frequencyScore = maxActiveCount > 0
      ? Math.min(active_count / maxActiveCount, 1.0)
      : 0;

   const projectMatch = projects.includes(currentProject) ? 1.0 : (projects.length === 0 ? 0.3 : 0.0);
   const categoryWeight = CATEGORY_WEIGHTS[category] || 0.5;
   const relevanceScore = projectMatch * 0.6 + categoryWeight * 0.4;

   return recencyScore * 0.3 + frequencyScore * 0.4 + relevanceScore * 0.3;
}

export function recalculateAll(index, currentProject) {
   const memories = Object.values(index.memories);
   const maxActiveCount = Math.max(1, ...memories.map(m => m.active_count || 0));

   for (const [key, mem] of Object.entries(index.memories)) {
      mem.hotness = calculateHotness(mem, { maxActiveCount, currentProject });
   }
   return index;
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/hotness.mjs test/memory.test.mjs
git commit -m "feat: hotness scoring with recency, frequency, and relevance"
```

---

## Task 4: L0 extraction from JSONL

**Files:**
- Create: `src/memory/extract-l0.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('L0 extraction', () => {
   it('extracts summary from JSONL content', async () => {
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
      assert.ok(l0.messageCount === 3);
      assert.ok(l0.files.includes('src/auth.js'));
   });

   it('extracts file paths from assistant messages', async () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement extract-l0.mjs**

Create `src/memory/extract-l0.mjs`:
```js
// Regex to find file paths in text (e.g. src/foo.mjs, ./bar/baz.ts, package.json)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;
const MAX_SUMMARY_LEN = 120;

export function extractFilePaths(text) {
   const matches = new Set();
   for (const m of text.matchAll(FILE_PATH_RE)) {
      const path = m[1];
      if (path.includes('/') || path.includes('.')) matches.add(path);
   }
   return [...matches].filter(p => !p.startsWith('http') && !p.startsWith('//'));
}

export function extractL0FromMessages(messages, project) {
   if (!messages.length) return { summary: '', project, messageCount: 0, files: [], topics: [] };

   // Summary = first user message, truncated
   const firstUser = messages.find(m => m.role === 'user');
   const summary = firstUser
      ? firstUser.content.replace(/\n/g, ' ').trim().slice(0, MAX_SUMMARY_LEN)
      : '';

   // Collect file paths from all messages
   const files = new Set();
   for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      for (const f of extractFilePaths(text)) files.add(f);
   }

   return {
      summary,
      project,
      messageCount: messages.length,
      files: [...files].slice(0, 20),
      timestamp: Date.now(),
   };
}

export function extractL0FromJSONL(lines, project) {
   const messages = [];
   for (const line of lines) {
      try {
         const event = JSON.parse(line);
         if (event.type === 'human' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'user', content: text });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'assistant', content: text });
         }
      } catch {}
   }
   return extractL0FromMessages(messages, project);
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/extract-l0.mjs test/memory.test.mjs
git commit -m "feat: L0 extraction from JSONL without LLM"
```

---

## Task 5: Memory file format (JSON frontmatter)

**Files:**
- Create: `src/memory/format.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('memory file format', () => {
   it('serializes memory to file content', async () => {
      const { serializeMemory, parseMemory } = await import('../src/memory/format.mjs');
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement format.mjs**

Create `src/memory/format.mjs`:
```js
const OPEN_TAG = '<!--json';
const CLOSE_TAG = '-->';

export function serializeMemory(meta, content) {
   const json = JSON.stringify(meta, null, 2);
   return `${OPEN_TAG}\n${json}\n${CLOSE_TAG}\n\n${content}`;
}

export function parseMemory(fileContent) {
   const openIdx = fileContent.indexOf(OPEN_TAG);
   const closeIdx = fileContent.indexOf(CLOSE_TAG);
   if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
      return { meta: null, content: fileContent };
   }
   try {
      const jsonStr = fileContent.slice(openIdx + OPEN_TAG.length, closeIdx).trim();
      const meta = JSON.parse(jsonStr);
      const content = fileContent.slice(closeIdx + CLOSE_TAG.length).trim();
      return { meta, content };
   } catch {
      return { meta: null, content: fileContent };
   }
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/format.mjs test/memory.test.mjs
git commit -m "feat: JSON frontmatter memory file format (zero deps)"
```

---

## Task 6: Deduplication algorithm

**Files:**
- Create: `src/memory/dedup.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
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
      assert.ok(jaccardSimilarity('the cat sat', 'the dog sat') > 0.5);
      assert.ok(jaccardSimilarity('hello world', 'goodbye moon') === 0);
   });

   it('merges appendable categories', async () => {
      const { mergeContent } = await import('../src/memory/dedup.mjs');
      const result = mergeContent('Line one.\nLine two.', 'Line two.\nLine three.', 'profile');
      assert.ok(result.includes('Line one'));
      assert.ok(result.includes('Line three'));
      // No duplicated line
      assert.equal(result.split('Line two').length - 1, 1);
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement dedup.mjs**

Create `src/memory/dedup.mjs`:
```js
const APPENDABLE = new Set(['profile', 'preferences', 'entities', 'patterns']);
const FUZZY_THRESHOLD = 0.6;
const EXACT_SKIP_THRESHOLD = 0.8;

export function jaccardSimilarity(textA, textB) {
   const setA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
   const setB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));
   if (setA.size === 0 && setB.size === 0) return 1.0;
   if (setA.size === 0 || setB.size === 0) return 0;
   let intersection = 0;
   for (const w of setA) if (setB.has(w)) intersection++;
   return intersection / (setA.size + setB.size - intersection);
}

export function findMatch(candidate, index) {
   const exactKey = `${candidate.category}/${candidate.name}`;
   if (index.memories[exactKey]) {
      return { type: 'exact', key: exactKey, existing: index.memories[exactKey] };
   }

   // Fuzzy: search same category for high word overlap
   let bestMatch = null;
   let bestScore = 0;
   for (const [key, mem] of Object.entries(index.memories)) {
      if (mem.category !== candidate.category) continue;
      const sim = jaccardSimilarity(candidate.content || '', mem.content || '');
      if (sim > bestScore) {
         bestScore = sim;
         bestMatch = { key, mem };
      }
   }
   if (bestScore >= FUZZY_THRESHOLD) {
      return { type: 'fuzzy', key: bestMatch.key, existing: bestMatch.mem, similarity: bestScore };
   }
   return { type: 'none' };
}

export function mergeContent(existing, incoming, category) {
   if (!APPENDABLE.has(category)) return existing; // Immutable — keep original

   const existingLines = existing.split('\n').map(l => l.trim()).filter(Boolean);
   const incomingLines = incoming.split('\n').map(l => l.trim()).filter(Boolean);
   const existingSet = new Set(existingLines);
   const newLines = incomingLines.filter(l => !existingSet.has(l));
   if (newLines.length === 0) return existing;
   return [...existingLines, ...newLines].join('\n');
}

export function resolveCandidate(candidate, index) {
   const match = findMatch(candidate, index);

   if (match.type === 'exact') {
      if (APPENDABLE.has(candidate.category)) {
         return { action: 'merge', key: match.key, content: mergeContent(match.existing.content || '', candidate.content, candidate.category) };
      }
      const sim = jaccardSimilarity(candidate.content || '', match.existing.content || '');
      if (sim > EXACT_SKIP_THRESHOLD) return { action: 'skip' };
      // Immutable with different content — create with suffix
      let suffix = 2;
      while (index.memories[`${candidate.category}/${candidate.name}-${suffix}`]) suffix++;
      return { action: 'create', key: `${candidate.category}/${candidate.name}-${suffix}` };
   }

   if (match.type === 'fuzzy') {
      // Return fuzzy info — caller decides (may invoke LLM)
      return { action: 'fuzzy', key: match.key, existing: match.existing, similarity: match.similarity };
   }

   return { action: 'create', key: `${candidate.category}/${candidate.name}` };
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/dedup.mjs test/memory.test.mjs
git commit -m "feat: memory deduplication with Jaccard similarity"
```

---

## Task 7: Extend Stop hook with L0 + background spawn

**Files:**
- Modify: `src/save-session-summary.mjs` (lines 28-56)
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing test for extended Stop hook**

```js
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
      // Create a fake JSONL
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL — saveSessionWithL0 not exported

- [ ] **Step 3: Extend save-session-summary.mjs**

Refactor to export `saveSessionWithL0` function. Add L0 extraction after session-index write. Add background spawn for L1 extraction:

```js
// Add to save-session-summary.mjs after existing session-index write:
import { extractL0FromJSONL } from './memory/extract-l0.mjs';
import { readIndex, writeIndex } from './memory/index.mjs';
import { MEMORY_INDEX, MEMORY_DIR, PROJECTS_DIR } from './config.mjs';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

export function saveSessionWithL0({ sessionId, project, indexPath, projectsDir }) {
   // Find JSONL file
   const projectDir = projectsDir || PROJECTS_DIR;
   let jsonlPath = null;
   // Search for session JSONL (same logic as restore.mjs findSessionFile)
   // ... find file, read last 50 lines, extract L0

   const index = readIndex(indexPath || MEMORY_INDEX);
   if (!index.sessions) index.sessions = {};

   // Extract L0
   if (jsonlPath) {
      const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).slice(-50);
      const l0 = extractL0FromJSONL(lines, project);
      index.sessions[sessionId] = {
         ...index.sessions[sessionId],
         l0,
         l1_ready: false,
         lastActive: Date.now(),
      };
   } else {
      index.sessions[sessionId] = {
         ...index.sessions[sessionId],
         lastActive: Date.now(),
      };
   }

   writeIndex(indexPath || MEMORY_INDEX, index);

   // Spawn background L1 extraction (detached)
   try {
      const extractScript = new URL('./memory/extract-l1.mjs', import.meta.url).pathname;
      const child = spawn(process.execPath, [extractScript, sessionId, project], {
         detached: true,
         stdio: 'ignore',
         env: { ...process.env, MEMORY_DIR: MEMORY_DIR },
      });
      child.unref();
   } catch {}
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `node --test test/run.mjs`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/save-session-summary.mjs test/memory.test.mjs
git commit -m "feat: extend Stop hook with L0 extraction and background L1 spawn"
```

---

## Task 8: L1 background extraction via Claude CLI

**Files:**
- Create: `src/memory/extract-l1.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing test for extraction prompt builder**

```js
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

   it('parses LLM JSON response', async () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement extract-l1.mjs**

Create `src/memory/extract-l1.mjs`:
```js
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readIndex, writeIndex, acquireLock, releaseLock } from './index.mjs';
import { resolveCandidate } from './dedup.mjs';
import { serializeMemory } from './format.mjs';
import { findClaudeCli, MEMORY_INDEX, MEMORY_LOCK, MEMORIES_DIR, MEMORY_ERROR_LOG, MEMORY_CATEGORIES, PROJECTS_DIR } from '../config.mjs';

const EXTRACTION_TIMEOUT = 60_000;

export function buildExtractionPrompt(messages) {
   const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
   return `Extract structured memories from this Claude Code session conversation.

Return a JSON array of memories. Each memory:
{
  "category": one of: profile, preferences, entities, events, cases, patterns
  "name": kebab-case identifier (e.g. "auth-token-fix")
  "content": 1-3 sentences of useful information to remember
}

Categories:
- profile: user role, expertise, responsibilities
- preferences: coding style, tools, workflow
- entities: projects, services, people, systems
- events: incidents, deployments, decisions (with dates)
- cases: problem + solution pairs
- patterns: recurring approaches, anti-patterns

Only extract information worth remembering in future sessions. Skip trivial exchanges.
If nothing is worth remembering, return an empty array [].

Conversation:
${conversation}

JSON array:`;
}

export function parseLLMResponse(response) {
   try {
      // Try to find JSON array in response
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(m =>
         m.category && m.name && m.content &&
         MEMORY_CATEGORIES.includes(m.category)
      );
   } catch {
      return [];
   }
}

// Entry point when run as detached process:
// node extract-l1.mjs <sessionId> <project>
async function main() {
   const [,, sessionId, project] = process.argv;
   if (!sessionId) process.exit(0);

   const memoryDir = process.env.MEMORY_DIR || join(process.env.HOME, '.claude', 'session-memory');
   const indexPath = process.env.MEMORY_INDEX || join(memoryDir, 'index.json');
   const lockPath = process.env.MEMORY_LOCK || join(memoryDir, 'index.lock');
   const memoriesDir = process.env.MEMORIES_DIR || join(memoryDir, 'memories');
   const errorLog = join(memoryDir, 'error.log');

   if (!acquireLock(lockPath)) process.exit(0); // Another process working

   try {
      const index = readIndex(indexPath);
      const session = index.sessions?.[sessionId];
      if (!session || session.l1_ready) return; // Already extracted or no L0

      // Find and read JSONL
      // ... (reuse restore.mjs head/tail logic)

      // Read memory config for model preference
      const memConfig = readMemoryConfig(join(memoryDir, 'config.json'));
      const model = memConfig.extractionModel || 'haiku';

      // Call Claude CLI
      const claudeCli = findClaudeCli();
      if (!claudeCli) throw new Error('Claude CLI not found');

      const prompt = buildExtractionPrompt(messages);
      const result = execFileSync(claudeCli, ['--model', model, '--print', '--output-format', 'text', prompt], {
         timeout: EXTRACTION_TIMEOUT,
         encoding: 'utf8',
         maxBuffer: 1024 * 1024,
      });

      const candidates = parseLLMResponse(result);

      // Deduplicate and write
      for (const candidate of candidates) {
         const resolution = resolveCandidate(candidate, index);
         if (resolution.action === 'skip') continue;
         if (resolution.action === 'fuzzy') continue; // Skip fuzzy for background — safer

         const key = resolution.key;
         const content = resolution.action === 'merge' ? resolution.content : candidate.content;
         const now = new Date().toISOString();

         // Update index
         index.memories[key] = {
            ...index.memories[key],
            name: candidate.name,
            category: candidate.category,
            description: candidate.content.slice(0, 80),
            content: content,
            hotness: index.memories[key]?.hotness || 0.5,
            active_count: index.memories[key]?.active_count || 0,
            created: index.memories[key]?.created || now,
            updated: now,
            source_sessions: [...new Set([...(index.memories[key]?.source_sessions || []), sessionId])],
            projects: [...new Set([...(index.memories[key]?.projects || []), project].filter(Boolean))],
         };

         // Write memory file
         const categoryDir = join(memoriesDir, candidate.category);
         mkdirSync(categoryDir, { recursive: true });
         const filePath = join(categoryDir, candidate.name + '.md');
         const { hotness, active_count, content: _, ...fileMeta } = index.memories[key];
         writeFileSync(filePath, serializeMemory(index.memories[key], content));
      }

      // Mark L1 as ready
      index.sessions[sessionId].l1_ready = true;
      index.sessions[sessionId].extracted_at = new Date().toISOString();

      writeIndex(indexPath, index);
   } catch (err) {
      try { appendFileSync(errorLog, `[${new Date().toISOString()}] ${sessionId}: ${err.message}\n`); } catch {}
      // Mark as failed so lazy fallback can retry later
      try {
         const index = readIndex(indexPath);
         if (index.sessions?.[sessionId]) {
            index.sessions[sessionId].extraction_failed = true;
            index.sessions[sessionId].extraction_attempts = (index.sessions[sessionId].extraction_attempts || 0) + 1;
            writeIndex(indexPath, index);
         }
      } catch {}
   } finally {
      releaseLock(lockPath);
   }
}

// Run if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
   main().catch(() => process.exit(1));
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/memory/extract-l1.mjs test/memory.test.mjs
git commit -m "feat: L1 background extraction via Claude CLI with dedup"
```

---

## Task 9: Migration from session-index.json

**Files:**
- Create: `src/memory/migrate.mjs`
- Modify: `src/sessions.mjs` (read from new index)
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('migration', () => {
   let tempDir;

   beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cs-migrate-'));
   });
   afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
   });

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
      assert.equal(Object.keys(result.sessions).length, 0); // Did not overwrite
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement migrate.mjs**

Create `src/memory/migrate.mjs`:
```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readIndex, writeIndex } from './index.mjs';
import { extractL0FromJSONL } from './extract-l0.mjs';

export function migrateSessionIndex(oldIndexPath, newIndexPath, projectsDir) {
   // If new index already exists, check for newer entries to merge
   if (existsSync(newIndexPath)) {
      const existing = readIndex(newIndexPath);
      if (!existsSync(oldIndexPath)) return existing;

      try {
         const oldData = JSON.parse(readFileSync(oldIndexPath, 'utf8'));
         let merged = false;
         for (const [id, entry] of Object.entries(oldData)) {
            if (!existing.sessions[id]) {
               existing.sessions[id] = {
                  summary: entry.summary || '',
                  project: entry.project || '',
                  lastActive: entry.lastActive || Date.now(),
               };
               merged = true;
            }
         }
         if (merged) writeIndex(newIndexPath, existing);
      } catch {}
      return existing;
   }

   // Fresh migration
   if (!existsSync(oldIndexPath)) return readIndex(newIndexPath);

   try {
      const oldData = JSON.parse(readFileSync(oldIndexPath, 'utf8'));
      const newIndex = { version: 1, memories: {}, sessions: {} };

      for (const [id, entry] of Object.entries(oldData)) {
         newIndex.sessions[id] = {
            summary: entry.summary || '',
            project: entry.project || '',
            lastActive: entry.lastActive || 0,
         };
      }

      writeIndex(newIndexPath, newIndex);
      return newIndex;
   } catch {
      return readIndex(newIndexPath);
   }
}

export function generateL0ForExistingSessions(index, projectsDir) {
   let count = 0;
   for (const [sessionId, session] of Object.entries(index.sessions)) {
      if (session.l0) continue; // Already has L0

      // Find JSONL file
      try {
         const dirs = readdirSync(projectsDir);
         for (const dir of dirs) {
            const jsonlPath = join(projectsDir, dir, sessionId + '.jsonl');
            if (existsSync(jsonlPath)) {
               const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).slice(-50);
               session.l0 = extractL0FromJSONL(lines, session.project);
               session.l1_ready = false;
               count++;
               break;
            }
         }
      } catch {}
   }
   return count;
}
```

- [ ] **Step 4: Update sessions.mjs to read from unified index**

In `src/sessions.mjs`, update `readIndex()` (line 99-106) and `writeIndex()` (line 108-116) to use new MEMORY_INDEX path with fallback to SESSION_INDEX:

```js
// Updated readIndex — check new index first, fallback to old
export function readIndex() {
   try {
      const idx = JSON.parse(readFileSync(MEMORY_INDEX, 'utf8'));
      return idx.sessions || {};
   } catch {
      try { return JSON.parse(readFileSync(SESSION_INDEX, 'utf8')); }
      catch { return {}; }
   }
}
```

- [ ] **Step 5: Run all tests**

Run: `node --test test/run.mjs && node --test test/memory.test.mjs`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/memory/migrate.mjs src/sessions.mjs test/memory.test.mjs
git commit -m "feat: migration from session-index.json to unified memory index"
```

---

## Task 10: Catalog generation and SessionStart hook

**Files:**
- Create: `src/memory/catalog.mjs`
- Create: `src/session-start-hook.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('catalog generation', () => {
   it('generates compact catalog under token budget', async () => {
      const { generateCatalog } = await import('../src/memory/catalog.mjs');
      const index = {
         memories: {
            'profile/role': { name: 'role', category: 'profile', hotness: 0.9, description: 'Senior dev' },
            'cases/auth-fix': { name: 'auth-fix', category: 'cases', hotness: 0.7, description: 'Fixed auth token' },
            'patterns/early-returns': { name: 'early-returns', category: 'patterns', hotness: 0.3, description: 'Prefer early returns' },
         }
      };
      const catalog = generateCatalog(index);
      assert.ok(catalog.includes('role'));
      assert.ok(catalog.includes('profile'));
      // Rough token estimate: should be under 300 tokens (~1200 chars)
      assert.ok(catalog.length < 1500);
   });

   it('selects top hot memories for project', async () => {
      const { selectHotMemories } = await import('../src/memory/catalog.mjs');
      const index = {
         memories: {
            'cases/a': { name: 'a', category: 'cases', hotness: 0.9, content: 'Memory A', projects: ['/project'] },
            'cases/b': { name: 'b', category: 'cases', hotness: 0.8, content: 'Memory B', projects: ['/project'] },
            'cases/c': { name: 'c', category: 'cases', hotness: 0.7, content: 'Memory C', projects: ['/other'] },
            'cases/d': { name: 'd', category: 'cases', hotness: 0.6, content: 'Memory D', projects: ['/project'] },
            'cases/e': { name: 'e', category: 'cases', hotness: 0.5, content: 'Memory E', projects: ['/project'] },
            'cases/f': { name: 'f', category: 'cases', hotness: 0.4, content: 'Memory F', projects: ['/project'] },
         }
      };
      const hot = selectHotMemories(index, '/project', 3);
      assert.equal(hot.length, 3);
      assert.equal(hot[0].name, 'a'); // Highest hotness
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/memory.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement catalog.mjs**

Create `src/memory/catalog.mjs`:
```js
export function generateCatalog(index) {
   const entries = Object.values(index.memories || {})
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0));

   if (entries.length === 0) return '(no memories yet)';

   const lines = ['| name | category | hotness | description |', '|------|----------|---------|-------------|'];
   for (const m of entries) {
      lines.push(`| ${m.name} | ${m.category} | ${(m.hotness || 0).toFixed(2)} | ${(m.description || '').slice(0, 50)} |`);
   }
   return lines.join('\n');
}

export function selectHotMemories(index, currentProject, count = 5) {
   return Object.values(index.memories || {})
      .filter(m => !currentProject || (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, count);
}

export function formatSessionStartOutput(index, currentProject) {
   const catalog = generateCatalog(index);
   const hot = selectHotMemories(index, currentProject, 5);

   let output = `# Session Memory (auto-loaded)\n\n## Memory Catalog\n${catalog}\n`;

   if (hot.length > 0) {
      output += `\n## Hot Memories for ${currentProject || 'global'}\n\n`;
      for (const m of hot) {
         output += `### ${m.name} (${m.category})\n${m.content || m.description || ''}\n\n`;
      }
   }

   output += `\nTo load more: read files from ~/.claude/session-memory/memories/{category}/{name}.md\n`;
   return output;
}
```

- [ ] **Step 4: Implement session-start-hook.mjs**

Create `src/session-start-hook.mjs`:
```js
#!/usr/bin/env node
// SessionStart hook: outputs memory catalog + hot memories to stdout
// Claude receives this as additional context

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatSessionStartOutput } from './memory/catalog.mjs';
import { readIndex } from './memory/index.mjs';
import { recalculateAll } from './memory/hotness.mjs';

try {
   // Read hook input from stdin
   let input = '';
   try { input = readFileSync(process.stdin.fd, 'utf8'); } catch {}

   let project = '';
   try {
      const hookData = JSON.parse(input);
      project = hookData.cwd || hookData.project || '';
   } catch {}

   const memoryDir = process.env.MEMORY_DIR || join(process.env.HOME || '', '.claude', 'session-memory');
   const indexPath = join(memoryDir, 'index.json');

   if (!existsSync(indexPath)) process.exit(0);

   let index = readIndex(indexPath);
   index = recalculateAll(index, project);

   const output = formatSessionStartOutput(index, project);
   process.stdout.write(output);
} catch {
   // Silent failure — do not break session start
   process.exit(0);
}
```

- [ ] **Step 5: Run tests**

Run: `node --test test/memory.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/memory/catalog.mjs src/session-start-hook.mjs test/memory.test.mjs
git commit -m "feat: memory catalog generation and SessionStart hook"
```

---

## Task 11: Install flow — migration + opt-in Claude integration

**Files:**
- Modify: `src/install.mjs` (extend main flow)
- Create: `src/enable-memory.mjs`
- Create: `src/disable-memory.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('install with memory', () => {
   // Uses temp dir mock from existing test setup pattern

   it('runs migration during install if session-index.json exists', async () => {
      // Create temp ~/.claude with session-index.json
      // Run install logic
      // Verify index.json created with migrated sessions
   });

   it('enable-memory adds SessionStart hook to settings.json', async () => {
      const { enableMemory } = await import('../src/enable-memory.mjs');
      const settingsPath = join(tempDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));

      enableMemory({ settingsPath, claudeMdPath: join(tempDir, 'CLAUDE.md'), scriptsDir: tempDir });

      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.ok(settings.hooks.SessionStart);
   });

   it('disable-memory removes SessionStart hook', async () => {
      const { disableMemory } = await import('../src/disable-memory.mjs');
      const settingsPath = join(tempDir, 'settings.json');
      writeFileSync(settingsPath, JSON.stringify({
         hooks: { SessionStart: [{ command: 'node session-start-hook.mjs' }] }
      }));

      disableMemory({ settingsPath, claudeMdPath: join(tempDir, 'CLAUDE.md') });

      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(settings.hooks.SessionStart.length, 0);
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement enable-memory.mjs and disable-memory.mjs**

`src/enable-memory.mjs` — adds SessionStart hook + CLAUDE.md section:
```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDE_MD_SECTION = `
# Session Memory System
You have a structured memory system at \`~/.claude/session-memory/\`.
A catalog and hot memories are loaded at session start.
If you need more context, read specific memory files via Read tool.
Path: \`~/.claude/session-memory/memories/{category}/{name}.md\`
Do not modify these files directly — they are managed by claude-sessions.
`;

const MEMORY_MARKER = '# Session Memory System';

export function enableMemory({ settingsPath, claudeMdPath, scriptsDir }) {
   // Add SessionStart hook
   const settings = existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, 'utf8'))
      : {};
   if (!settings.hooks) settings.hooks = {};
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

   const hookCmd = `node ${join(scriptsDir, 'session-start-hook.mjs')}`;
   const exists = settings.hooks.SessionStart.some(h => h.command?.includes('session-start-hook'));
   if (!exists) {
      settings.hooks.SessionStart.push({ type: 'command', command: hookCmd });
   }
   writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

   // Add to CLAUDE.md
   const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
   if (!claudeMd.includes(MEMORY_MARKER)) {
      writeFileSync(claudeMdPath, claudeMd + '\n' + CLAUDE_MD_SECTION);
   }
}
```

`src/disable-memory.mjs`:
```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function disableMemory({ settingsPath, claudeMdPath }) {
   // Remove SessionStart hook
   if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (settings.hooks?.SessionStart) {
         settings.hooks.SessionStart = settings.hooks.SessionStart
            .filter(h => !h.command?.includes('session-start-hook'));
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
   }

   // Remove from CLAUDE.md
   if (existsSync(claudeMdPath)) {
      let md = readFileSync(claudeMdPath, 'utf8');
      const marker = '# Session Memory System';
      const idx = md.indexOf(marker);
      if (idx !== -1) {
         // Remove from marker to next # heading or end of file
         const nextHeading = md.indexOf('\n# ', idx + marker.length);
         md = md.slice(0, idx).trimEnd() + (nextHeading !== -1 ? md.slice(nextHeading) : '');
         writeFileSync(claudeMdPath, md);
      }
   }
}
```

- [ ] **Step 4: Extend install.mjs main flow**

Add after existing install steps (after line ~192):
```js
// Memory migration
import { migrateSessionIndex, generateL0ForExistingSessions } from './memory/migrate.mjs';
import { MEMORY_INDEX, MEMORY_DIR, MEMORIES_DIR, SESSION_INDEX, PROJECTS_DIR } from './config.mjs';
import { mkdirSync, existsSync } from 'node:fs';

// In main install function:
mkdirSync(MEMORY_DIR, { recursive: true });
mkdirSync(MEMORIES_DIR, { recursive: true });

if (existsSync(SESSION_INDEX)) {
   const index = migrateSessionIndex(SESSION_INDEX, MEMORY_INDEX, PROJECTS_DIR);
   const l0Count = generateL0ForExistingSessions(index, PROJECTS_DIR);
   writeIndex(MEMORY_INDEX, index);
   console.log(`Migrated ${Object.keys(index.sessions).length} sessions, generated L0 for ${l0Count}`);

   // Spawn background L1 extraction for recent 20 sessions
   // ...
}

// Prompt for Claude integration (only in interactive mode, not --auto)
if (!isAuto) {
   // Interactive prompt using raw terminal (like picker.mjs pattern)
   // "Would you like to enable the Claude memory integration? [y/N]"
}
```

- [ ] **Step 5: Run all tests**

Run: `node --test test/run.mjs && node --test test/memory.test.mjs`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/install.mjs src/enable-memory.mjs src/disable-memory.mjs test/memory.test.mjs
git commit -m "feat: install flow with migration and opt-in Claude integration"
```

---

## Task 12: CLI commands — memory-status, memory-search, extract-memory

**Files:**
- Create: `src/memory-status.mjs`
- Create: `src/memory-search.mjs`
- Modify: `bin/cli.mjs` (add routes)
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing tests**

```js
describe('CLI memory commands', () => {
   it('memory-status outputs stats', async () => {
      const { formatMemoryStatus } = await import('../src/memory-status.mjs');
      const index = {
         version: 1,
         memories: {
            'profile/a': { category: 'profile', hotness: 0.9 },
            'cases/b': { category: 'cases', hotness: 0.5 },
         },
         sessions: { 's1': {}, 's2': {}, 's3': {} },
      };
      const output = formatMemoryStatus(index);
      assert.ok(output.includes('2')); // 2 memories
      assert.ok(output.includes('3')); // 3 sessions
      assert.ok(output.includes('profile'));
   });

   it('memory-search finds by keyword', async () => {
      const { searchMemories } = await import('../src/memory-search.mjs');
      const index = {
         memories: {
            'cases/auth-fix': { name: 'auth-fix', category: 'cases', content: 'Fixed auth token expiry', description: 'Auth fix' },
            'patterns/early-return': { name: 'early-return', category: 'patterns', content: 'Prefer early returns', description: 'Early returns' },
         }
      };
      const results = searchMemories(index, 'auth');
      assert.equal(results.length, 1);
      assert.equal(results[0].name, 'auth-fix');
   });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement memory-status.mjs and memory-search.mjs**

- [ ] **Step 4: Add routes to bin/cli.mjs**

Add before the help/default cases:
```js
if (cmd === 'memory-status' || cmd === 'ms') {
   const { default: memoryStatus } = await import(join(srcDir, 'memory-status.mjs'));
   await memoryStatus();
}
else if (cmd === 'memory-search' && args[0]) {
   const { default: memorySearch } = await import(join(srcDir, 'memory-search.mjs'));
   await memorySearch(args.join(' '));
}
else if (cmd === 'extract-memory') {
   const { default: extractMemory } = await import(join(srcDir, 'memory', 'extract-l1.mjs'));
   await extractMemory(args.includes('--all') ? 'all' : args[0]);
}
else if (cmd === 'enable-memory') {
   const { enableMemory } = await import(join(srcDir, 'enable-memory.mjs'));
   enableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md'), scriptsDir: SCRIPTS_DIR });
   console.log('Memory integration enabled.');
}
else if (cmd === 'disable-memory') {
   const { disableMemory } = await import(join(srcDir, 'disable-memory.mjs'));
   disableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md') });
   console.log('Memory integration disabled.');
}
```

- [ ] **Step 5: Run all tests**

Run: `node --test test/run.mjs && node --test test/memory.test.mjs`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/memory-status.mjs src/memory-search.mjs bin/cli.mjs test/memory.test.mjs
git commit -m "feat: CLI commands for memory-status, memory-search, extract-memory"
```

---

## Task 13: Slash commands for Claude

**Files:**
- Create: `claude-commands/memory-recall.md`
- Create: `claude-commands/memory-status.md`
- Modify: `src/install.mjs` (copy new commands)

- [ ] **Step 1: Create memory-recall.md**

```markdown
Search and recall memories from the session memory system.

Usage: /memory-recall <query>

This searches through stored memories by keyword, category, or project.
Results are displayed with hotness scores and categories.
```

- [ ] **Step 2: Create memory-status.md**

```markdown
Show memory system status and statistics.

Displays:
- Total memories by category
- Top 10 memories by hotness
- Sessions with/without L1 extraction
- Storage stats
```

- [ ] **Step 3: Update install.mjs to copy new commands**

Add `memory-recall.md` and `memory-status.md` to the commands list in `installCommands()`.

- [ ] **Step 4: Run tests**

Run: `node --test test/run.mjs`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add claude-commands/memory-recall.md claude-commands/memory-status.md src/install.mjs
git commit -m "feat: slash commands for memory-recall and memory-status"
```

---

## Task 14: i18n translations

**Files:**
- Modify: `src/i18n.mjs`

- [ ] **Step 1: Add memory-related translations**

Add to both `en` and `ru` translation objects:
```js
// English
memoryMigrated: (n, l0) => `Migrated ${n} sessions, generated L0 for ${l0}`,
memoryEnabled: 'Memory integration enabled',
memoryDisabled: 'Memory integration disabled',
memoryStatus: 'Memory Status',
memoryTotal: (n) => `Total memories: ${n}`,
memorySessions: (n) => `Sessions: ${n}`,
memoryExtractingBg: (n) => `Extracting memories from ${n} recent sessions in background...`,
memoryPrompt: 'Would you like to enable Claude memory integration?',
memoryPromptDetails: 'This will add a SessionStart hook and instructions to CLAUDE.md',
memoryEnableLater: 'You can enable it later with: claude-sessions enable-memory',

// Russian
memoryMigrated: (n, l0) => `Мигрировано ${n} сессий, L0 сгенерирован для ${l0}`,
memoryEnabled: 'Интеграция памяти включена',
memoryDisabled: 'Интеграция памяти отключена',
// ... etc
```

- [ ] **Step 2: Run tests**

Run: `node --test test/run.mjs`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/i18n.mjs
git commit -m "feat: i18n translations for memory system"
```

---

## Task 15: Lazy fallback extraction

**Files:**
- Modify: `src/sessions.mjs` (add lazy check on load)

- [ ] **Step 1: Write failing test**

```js
describe('lazy fallback', () => {
   it('detects sessions with L0 but no L1 and queues extraction', async () => {
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
      assert.equal(pending.length, 2); // s1 (never tried) + s3 (failed once, retry allowed)
      // s4 excluded — max 3 attempts reached
   });
});
```

- [ ] **Step 2: Implement in sessions.mjs**

Add `checkPendingExtractions()` function and call it on session load, spawning background extraction if needed.

- [ ] **Step 3: Run tests**

Run: `node --test test/run.mjs && node --test test/memory.test.mjs`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/sessions.mjs test/memory.test.mjs
git commit -m "feat: lazy fallback L1 extraction on session load"
```

---

## Task 16: Native Claude projection

**Files:**
- Create: `src/memory/project.mjs`
- Test: `test/memory.test.mjs` (extend)

- [ ] **Step 1: Write failing test**

```js
describe('native projection', () => {
   it('projects hot memories to Claude native format', async () => {
      const { projectToNativeFormat } = await import('../src/memory/project.mjs');
      const index = {
         memories: {
            'profile/role': { name: 'role', category: 'profile', hotness: 0.9, content: 'Senior dev', projects: ['/test'] },
         }
      };
      const tempMemoryDir = join(tempDir, 'projects', '-test', 'memory');
      projectToNativeFormat(index, '/test', tempMemoryDir);

      assert.ok(existsSync(join(tempMemoryDir, 'session-memory-role.md')));
   });
});
```

- [ ] **Step 2: Implement project.mjs**

- [ ] **Step 3: Run tests, commit**

```bash
git add src/memory/project.mjs test/memory.test.mjs
git commit -m "feat: project hot memories to Claude native format"
```

---

## Task 17: Update package.json and README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Bump version to 1.1.0**

Semver minor — new functionality, no breaking changes (session-index.json kept as fallback).

- [ ] **Step 2: Add new files to `files` array**

Add `src/memory/` directory and new top-level src files.

- [ ] **Step 3: Update README with memory system documentation**

Add sections:
- Memory System overview
- How it works (L0/L1/L2)
- Installation with memory opt-in
- CLI commands (memory-status, memory-search, enable-memory, disable-memory, extract-memory)
- Configuration

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "docs: update README and bump to v1.1.0 for memory system"
```

---

## Task 18: Full integration test

**Files:**
- Create: `test/memory-integration.test.mjs`

- [ ] **Step 1: Write end-to-end integration test**

Test the full flow:
1. Create temp `~/.claude` with session-index.json and JSONL files
2. Run migration → verify index.json created with L0
3. Simulate Stop hook → verify L0 written to index
4. Run memory-status → verify output
5. Run memory-search → verify results
6. Test enable-memory → verify hooks added
7. Test disable-memory → verify hooks removed
8. Test SessionStart hook output format

- [ ] **Step 2: Run full test suite**

Run: `node --test test/run.mjs && node --test test/memory.test.mjs && node --test test/memory-integration.test.mjs`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add test/memory-integration.test.mjs
git commit -m "test: full integration tests for memory system"
```
