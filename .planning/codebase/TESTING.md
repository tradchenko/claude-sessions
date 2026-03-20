# Testing Guide

## Test Framework & Tools

### Framework
- **Test Runner**: Node.js built-in `node:test` module (no external framework)
- **Assertion Library**: `node:assert/strict` (native assertions)
- **Node Version Required**: ≥18.0.0 (as per `package.json` engines)

**Rationale**: Zero external test dependencies; tests run directly with Node.js.

### Execution
**Command**: `npm test`

**Script** (from `package.json`):
```json
"test": "npm run build && node --test test/run.mjs"
```

Process:
1. Compiles TypeScript to `dist/` via `tsc`
2. Runs main test runner via `node --test`
3. Test runner (`test/run.mjs`) imports and executes all test suites

---

## Test File Organization

### Test Files Location
All test files in `/Users/tradchenko/claude-sessions/test/`:
- `run.mjs` — Main test runner (orchestrator)
- `memory.test.mjs` — Memory subsystem tests
- `agents.test.mjs` — Multi-agent module tests
- `memory-integration.test.mjs` — Integration tests for memory system

### Test File Format
- **Suffix**: `.test.mjs` or `.spec.mjs`
- **Module System**: ESM (`.mjs` extension required for Node.js)
- **Imports**: Node.js test framework from `node:test`, assertions from `node:assert/strict`

Example test file header (`test/memory.test.mjs`):
```javascript
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
```

---

## Test Naming Conventions

### Suite Names
Use `describe(name, fn)` for logical grouping:
```javascript
describe('memory config paths', () => { /* ... */ });
describe('CLI help', () => { /* ... */ });
describe('save-summary-hook', () => { /* ... */ });
describe('agent registry', () => { /* ... */ });
```

Lowercase, descriptive, plural when testing a category.

### Test Names
Use `it(name, fn)` with clear intent:
```javascript
it('exports MEMORY_DIR path', async () => { /* ... */ });
it('should export all constants', async () => { /* ... */ });
it('should list sessions from mock history', () => { /* ... */ });
it('should display help text', () => { /* ... */ });
it('detectAgents возвращает результат с полями installed и newlyDetected', async () => { /* ... */ });
```

Conventions:
- Start with "should" for behavioral tests
- Action-focused: "exports", "returns", "creates"
- Use Russian for Russian test descriptions (polyglot codebase)
- One assertion concept per test (when practical)

---

## Test Setup & Fixtures

### Mock Directory Pattern
Tests create temporary directories for isolation:

```javascript
const TEST_DIR = join(tmpdir(), `claude-sessions-test-${Date.now()}`);
const MOCK_CLAUDE = join(TEST_DIR, '.claude');

function setupMockClaudeDir() {
   mkdirSync(join(MOCK_CLAUDE, 'projects', '-test-project'), { recursive: true });
   mkdirSync(join(MOCK_CLAUDE, 'commands'), { recursive: true });
   // ... create subdirs ...
}

function cleanupMockDir() {
   if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
   }
}
```

**Pattern**:
- Use `mkdtempSync(tmpdir() + prefix)` for each test
- Always clean up with `rmSync(..., { recursive: true, force: true })`
- Never use real `~/.claude/` directory in tests

### Test Lifecycle Hooks
Tests use `before()` and `after()` for suite-level setup:

```javascript
describe('CLI list (with mock data)', () => {
   before(() => {
      setupMockClaudeDir();
   });

   after(() => {
      cleanupMockDir();
   });

   it('should list sessions from mock history', () => {
      // Test runs after setupMockClaudeDir
   });
});
```

For individual test setup/teardown, use `beforeEach()` and `afterEach()`:

```javascript
describe('memory config', () => {
   let tempDir;
   beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cs-cfg-'));
   });
   afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
   });
});
```

---

## Mocking Patterns

### Mock Data Files
Tests create mock JSON files with predefined data:

```javascript
const now = Date.now();
const sessions = [
   { sessionId: 'aaaa1111-...', project: '/test-project', display: 'Fix login bug', timestamp: now - 86400000 * 0 },
   { sessionId: 'aaaa2222-...', project: '/test-project', display: 'Add dark mode', timestamp: now - 86400000 * 1 },
];
const historyContent = sessions.map((s) => JSON.stringify(s)).join('\n') + '\n';
writeFileSync(join(MOCK_CLAUDE, 'history.jsonl'), historyContent);
```

### Environment Variables
Tests override `HOME` environment variable for isolation:

```javascript
function runCli(args, env = {}) {
   try {
      return execSync(`node ${CLI} ${args}`, {
         encoding: 'utf8',
         env: { ...process.env, HOME: TEST_DIR, ...env },
         timeout: 10000,
      });
   } catch (e) {
      return e.stdout || e.stderr || '';
   }
}
```

Usage:
```javascript
const output = runCli('list --limit 3');
const output2 = runCli('search miniapp', { LANG: 'ru' });
```

### Corrupted/Edge Case Data
Tests intentionally create invalid data to test error handling:

```javascript
it('should handle corrupted session-index.json', () => {
   const dir = join(tmpdir(), `claude-sessions-corrupt-${Date.now()}`);
   mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
   writeFileSync(join(dir, '.claude', 'session-index.json'), 'NOT VALID JSON{{{');
   const output = runCli('list --limit 1', { HOME: dir });

   // Verify graceful handling
   assert.ok(!output.includes('SyntaxError'));
   rmSync(dir, { recursive: true, force: true });
});
```

---

## Assertion Patterns

### Assertion Style
All assertions use `assert` from `node:assert/strict`:

```javascript
assert.ok(result, 'message');           // Truthy check
assert.equal(a, b, 'message');         // Equality
assert.deepEqual(obj1, obj2);          // Deep comparison
assert.throws(() => fn(), Error);      // Exception testing
assert.ok(string.includes('text'));    // Contains check
```

### Common Assertion Patterns

**File existence**:
```javascript
assert.ok(existsSync(join(MOCK_CLAUDE, 'commands', 'sessions.md')));
```

**Output contains text** (CLI testing):
```javascript
const output = runCli('help');
assert.ok(output.includes('claude-sessions'));
assert.ok(output.includes('Commands:') || output.includes('commands'));
```

**Count occurrences**:
```javascript
const resumeCount = (output.match(/claude --resume/g) || []).length;
assert.equal(resumeCount, 1);
```

**JSON structure**:
```javascript
const { installed, newlyDetected } = result;
assert.ok(Array.isArray(installed), 'installed should be array');
assert.ok(Array.isArray(newlyDetected), 'newlyDetected should be array');
```

**Regex validation**:
```javascript
assert.ok(/^[a-f0-9-]+$/i.test(id));
```

**Not included** (negative assertion):
```javascript
assert.ok(!output.includes('aaaa1111'));
```

**Any of conditions** (flexible assertion):
```javascript
assert.ok(output.includes('❌') || output.includes('not found') || output.length === 0);
```

---

## Test Categories

### 1. Unit Tests (Core Modules)
**File**: `test/run.mjs`

Tests individual modules in isolation:
- **i18n module** — `t()` function, locale handling, parameterized translations
- **config module** — `CLAUDE_DIR` resolution, path formatting, `shortProjectName()`
- **input validation** — `isValidSessionId()` UUID format checking

Example:
```javascript
describe('config', () => {
   it('should export all constants', async () => {
      const config = await import(join(PKG_ROOT, 'dist', 'core', 'config.js'));
      assert.ok(config.CLAUDE_DIR);
      assert.ok(config.HISTORY_FILE);
   });
});
```

### 2. CLI Integration Tests
**File**: `test/run.mjs`

Tests CLI commands end-to-end:
- **help** — Display help text
- **list** — Session listing with filters (`--project`, `--limit`)
- **search** — Content search across sessions
- **install/uninstall** — Hook and command installation
- **delete** — Session deletion with validation
- **save-summary-hook** — Session indexing

Example:
```javascript
describe('CLI list (with mock data)', () => {
   before(() => { setupMockClaudeDir(); });
   after(() => { cleanupMockDir(); });

   it('should list sessions from mock history', () => {
      const output = runCli('list --limit 3');
      assert.ok(output.includes('test-project'));
   });

   it('should respect --limit', () => {
      const output = runCli('list --limit 1');
      const resumeCount = (output.match(/claude --resume/g) || []).length;
      assert.equal(resumeCount, 1);
   });
});
```

### 3. Agent Tests
**File**: `test/agents.test.mjs`

Tests multi-agent support:
- **agent registry** — `detectAgents()`, `getAdapter()`, `getAllAdapters()`
- **agent detection** — Installed agents for Claude, Codex, Qwen, Gemini, Companion
- **agent config** — `readAgentsConfig()`, `writeAgentsConfig()`

Example:
```javascript
describe('agent registry', () => {
   it('getAdapter возвращает корректный адаптер по id', async () => {
      const { getAdapter } = await import(join(PKG_ROOT, 'dist', 'agents', 'registry.js'));
      const claude = getAdapter('claude');
      assert.ok(claude);
      assert.equal(claude.id, 'claude');
   });
});
```

### 4. Memory Subsystem Tests
**File**: `test/memory.test.mjs`, `test/memory-integration.test.mjs`

Tests session memory extraction:
- **Memory paths** — `MEMORY_DIR`, `MEMORY_INDEX`, `MEMORY_CONFIG` exports
- **Memory config** — Default config, user overrides, merging
- **Memory index** — Schema validation, file operations
- **L0 extraction** — File path extraction, summary generation
- **L1 extraction** — LLM-based entity/pattern extraction
- **Deduplication** — Fuzzy matching, exact matches, candidate resolution

### 5. Edge Case & Error Handling Tests
**File**: `test/run.mjs`

Tests robustness:
- Missing `~/.claude` directory — Should not crash, show error or empty list
- Empty `history.jsonl` — Should handle gracefully
- Corrupted `session-index.json` — Should skip corrupt data, continue
- Invalid session IDs — Should validate and reject

Example:
```javascript
describe('edge cases', () => {
   it('should handle missing ~/.claude gracefully', () => {
      const emptyDir = join(tmpdir(), `claude-sessions-empty-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });
      const output = runCli('list', { HOME: emptyDir });

      assert.ok(output.includes('❌') || output.includes('not found') || output.length === 0);
      rmSync(emptyDir, { recursive: true, force: true });
   });
});
```

---

## Coverage & Quality

### Current Coverage Approach
- No explicit coverage configuration (no Istanbul/c8)
- Coverage is implicit via comprehensive test suite
- Focus on: core modules, CLI commands, error paths, edge cases

### Test Metrics
From `test/run.mjs`:
- **Suite organization**: ~15+ describe blocks
- **Test count**: ~50+ assertions across all test files
- **Async tests**: Mix of sync and async (CLI, file I/O)

### Running Specific Tests
Node.js `--test` supports glob patterns:
```bash
node --test test/memory.test.mjs
node --test test/agents.test.mjs
```

Filter by test name (Node.js 20.3+):
```bash
node --test --grep "should export" test/run.mjs
```

---

## Debugging Tests

### Enable Verbose Output
```bash
NODE_DEBUG=test npm test 2>&1 | head -100
```

### Inspect Test Failures
Tests output to stdout/stderr via `console.log()`, errors via `console.error()`:
```javascript
console.log('\nRunning claude-sessions tests...\n');
// Tests run, output logs to terminal
```

### Timeout Handling
CLI tests have explicit timeout:
```javascript
execSync(`node ${CLI} ${args}`, {
   timeout: 10000,  // 10 second timeout
});
```

Increase if tests time out on slow machines.

### Temporary File Inspection
Leave `TEST_DIR` around for debugging:
```javascript
// Comment out cleanupMockDir() temporarily
// rmSync(TEST_DIR, { recursive: true, force: true });
console.log('Test dir:', TEST_DIR);
```

Then inspect files at `/tmp/claude-sessions-test-*` before cleanup.

---

## Writing New Tests

### Template
```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), `test-${Date.now()}`);

describe('feature name', () => {
   before(() => {
      mkdirSync(TEST_DIR, { recursive: true });
   });

   after(() => {
      rmSync(TEST_DIR, { recursive: true, force: true });
   });

   it('should do something', async () => {
      // Arrange
      const data = { /* ... */ };

      // Act
      const result = await functionUnderTest(data);

      // Assert
      assert.ok(result);
      assert.equal(result.prop, 'expected');
   });
});
```

### Key Guidelines
1. **Isolation**: Each test creates its own temp directory
2. **Cleanup**: Always run `after()` hook to clean up
3. **Async**: Use `async () => {}` for async tests
4. **Descriptions**: Clear, specific test names
5. **Assertions**: One logical assertion per test (or grouped related assertions)
6. **No external dependencies**: Use only Node.js built-ins + compiled code from `dist/`

---

## Summary

| Aspect | Details |
|---|---|
| **Framework** | Node.js `node:test` + `node:assert/strict` |
| **Run Command** | `npm test` (builds + tests) |
| **Test Files** | `/Users/tradchenko/claude-sessions/test/*.test.mjs` |
| **Naming** | `describe()`, `it()`, camelCase test names |
| **Setup** | `before()`/`beforeEach()`, `after()`/`afterEach()` |
| **Mocking** | Temp directories, mock JSON, environment overrides |
| **Assertions** | `assert.ok()`, `assert.equal()`, `assert.deepEqual()` |
| **Coverage** | Implicit via comprehensive test suite (no tool) |
| **Timeout** | 10 seconds for CLI tests |
| **Isolation** | Each test has unique temp directory, cleaned up |

