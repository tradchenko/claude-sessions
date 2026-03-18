# OpenViking Memory Plan Review

**Reviewer:** Claude Opus 4.6 (Senior Code Reviewer)
**Date:** 2026-03-18
**Plan:** `docs/superpowers/plans/2026-03-18-openviking-memory.md`
**Spec:** `docs/superpowers/specs/2026-03-18-openviking-memory-design.md`

---

## Overall Assessment

The plan is well-structured, follows TDD discipline, and covers the vast majority of the spec. 18 tasks with clear file ownership, test-first approach, and incremental commits. Below are specific issues found.

---

## Critical Issues (must fix)

### C1: `format.mjs` missing from file structure (Task 5)

Task 5 creates `src/memory/format.mjs` but this file is NOT listed in the "New files to create" section (lines 17-34). The file structure section must be the source of truth for agentic workers.

**Fix:** Add `- src/memory/format.mjs -- memory file serialization/parsing (JSON frontmatter)` to the file structure.

### C2: Hotness formula uses `HALF_LIFE_DAYS = 30` but spec says half-life ~21 days

Spec line 46: `Math.exp(-days_since_last_access / 30)` with comment "half-life ~21 days". The actual half-life of `exp(-t/30)` is `30 * ln(2) = 20.79 days`, so the constant 30 IS correct for ~21 day half-life. However, the plan names the constant `HALF_LIFE_DAYS = 30` (line 329) which is misleading -- 30 is the decay constant (tau), not the half-life.

**Fix:** Rename to `DECAY_CONSTANT_DAYS = 30` or add a comment: `// decay constant; actual half-life = 30 * ln(2) ~ 21 days`.

### C3: Test for stale lock uses `writeFileSync` without importing it

Task 2, Step 1, line 173: `writeFileSync(lockPath, '999999999')` is used in the test but `writeFileSync` is imported from `node:fs` only in a different describe block scope. The test file appends describe blocks but the import at line 125 is inside the second describe block.

**Fix:** Move `import { writeFileSync } from 'node:fs'` to the top-level imports of `test/memory.test.mjs`.

### C4: `acquireLock` has race condition between exists-check and open

Lines 222-237: The lock check (`existsSync` + `readFileSync` + `process.kill`) and the `openSync('wx')` are not atomic. Two processes could both pass the stale-lock check and then race on `openSync`. This is acceptable for best-effort but should be documented.

**Fix:** Add comment in the plan: `// Note: small race window between stale check and open; acceptable for best-effort extraction`.

---

## Important Issues (should fix)

### I1: Missing spec feature -- `config.json` user preferences

The spec (line 22) defines `config.json` for "user preferences, enabled/disabled state" and mentions "Model configurable via config.json" (line 87). The plan never creates or reads `config.json`. The config path constant is exported (Task 1) but never used.

**Fix:** Add a task (or subtask in Task 11) that:
- Creates a default `config.json` on install: `{ "enabled": false, "extractionModel": "haiku", "maxHotMemories": 5 }`
- Reads it in `extract-l1.mjs` for the model name
- Reads it in `enable-memory.mjs` / `disable-memory.mjs` to track state

### I2: Missing spec feature -- Phase 3 lazy fallback should retry `extraction_failed`

Spec line 110: "check index.json for sessions with L0 but missing L1". The plan's Task 15 test (line 1745) explicitly excludes `extraction_failed` sessions: `assert.equal(pending.length, 1); // s1 only (s3 already failed)`. But the spec says nothing about skipping failed sessions permanently.

**Fix:** Add a retry policy: retry `extraction_failed` sessions once after 24 hours. Add `extraction_failed_at` timestamp and check `Date.now() - failed_at > 24h`.

### I3: `extract-l1.mjs` silently skips fuzzy matches (line 1007)

Line 1007: `if (resolution.action === 'fuzzy') continue;` -- this means the second LLM call for fuzzy dedup (spec lines 105-106) is never implemented. The spec explicitly describes this as a feature.

**Fix:** Either:
1. Implement the second LLM call for fuzzy resolution (preferred -- matches spec)
2. Or explicitly document in the plan that fuzzy LLM dedup is deferred to a future task, with a TODO comment in code

### I4: `selectHotMemories` filter logic is too permissive

Line 1306: `(m.projects || []).length === 0` treats memories with no projects as global (shown for all projects). But memories always get a project assigned during extraction (line 1025). So this condition would only match manually created memories. The spec says `project_match: 0.3 if global` -- but selectHotMemories uses a binary include/exclude, ignoring the hotness-based ranking that already handles this.

**Fix:** Remove the `projects.length === 0` filter and rely solely on hotness sorting (which already factors in project_match via the relevance_score).

### I5: No test for `extractL0FromJSONL` (the JSONL-line-based function)

Task 4 tests only `extractL0FromMessages` and `extractFilePaths`, but not `extractL0FromJSONL` which is the actual entry point used by the Stop hook. JSONL parsing of Claude's event format (`event.type === 'human'`, content blocks array) is non-trivial.

**Fix:** Add a test that passes actual JSONL lines (stringified events with content block arrays) to `extractL0FromJSONL`.

### I6: Missing `--output-format json` flag in Claude CLI call

Spec line 84: `claude --model haiku --print --output-format json`. Plan line 995: `['--model', 'haiku', '--print', prompt]` -- missing `--output-format json`. Without it, the response format is unpredictable.

**Fix:** Add `'--output-format', 'json'` to the execFileSync args array.

---

## Suggestions (nice to have)

### S1: All tests in one file (`test/memory.test.mjs`) will get large

With 18 tasks all appending to the same file, it will exceed 500+ lines. Consider splitting: `test/memory-index.test.mjs`, `test/memory-hotness.test.mjs`, `test/memory-dedup.test.mjs`, etc.

### S2: Task 7 has incomplete implementation placeholder

Line 809: `// ... find file, read last 50 lines, extract L0` is left as a comment. The agentic worker needs concrete code or at minimum a reference to the existing `findSessionFile` logic in `restore.mjs`.

**Fix:** Add explicit code or reference: "Reuse `findSessionFile()` from `src/restore.mjs` to locate the JSONL file."

### S3: Task 14 (i18n) has incomplete Russian translations

Lines 1706-1709 end with `// ... etc`. An agentic worker may not fill in all translations.

**Fix:** List all translation keys explicitly for both languages.

### S4: No `topics` field extracted in L0

The `extractL0FromMessages` return type includes `topics: []` (line 439) but topics are never populated. The field is declared but always empty.

**Fix:** Either remove the field or extract topics (e.g., from file extensions, common keywords).

### S5: Task 18 integration test is a skeleton

Task 18 lists 8 test scenarios but provides no code. For an agentic worker, this needs at least the test structure with `describe`/`it` blocks.

---

## Dependency Order Verification

The task order is correct:
1. Config paths (no deps)
2. Index CRUD (needs config)
3. Hotness (standalone)
4. L0 extraction (standalone)
5. File format (standalone)
6. Dedup (standalone)
7. Stop hook extension (needs 2, 4)
8. L1 extraction (needs 2, 5, 6)
9. Migration (needs 2, 4)
10. Catalog + SessionStart (needs 2, 3)
11. Install flow (needs 9, enable/disable)
12. CLI commands (needs 2)
13. Slash commands (needs 12)
14. i18n (standalone, could be earlier)
15. Lazy fallback (needs 8)
16. Native projection (needs 10)
17. Package.json + README (after all features)
18. Integration test (after all features)

Tasks 3-6 could run in parallel. No circular dependencies detected.

---

## TDD Compliance

All tasks follow test-first pattern correctly: write test -> verify failure -> implement -> verify pass -> commit. Exception: Task 13 (slash commands) and Task 17 (package.json/README) have no tests, which is acceptable for markdown/config files.

---

## Spec Coverage Summary

| Spec Feature | Plan Coverage | Notes |
|---|---|---|
| L0/L1/L2 layers | YES | Tasks 4, 7, 8 |
| Hotness scoring | YES | Task 3 |
| 6 categories | YES | Task 1 (MEMORY_CATEGORIES) |
| Deduplication | PARTIAL | Fuzzy LLM call not implemented (I3) |
| Atomic writes | YES | Task 2 |
| File locking | YES | Task 2 |
| Stale lock detection | YES | Task 2 |
| config.json | MISSING | I1 |
| SessionStart hook | YES | Task 10 |
| CLAUDE.md injection | YES | Task 11 |
| Slash commands | YES | Task 13 |
| CLI commands (5) | YES | Tasks 11, 12 |
| Migration | YES | Task 9 |
| Phase 3 lazy fallback | YES | Task 15 |
| Memory limits + hysteresis | YES | Task 2 |
| Native projection | YES | Task 16 |
| i18n | YES | Task 14 |
| Memory file format | YES | Task 5 |
| Archiving (on prune) | PARTIAL | Prune deletes from index but spec says "kept on disk" |
| Token budget (<1500) | PARTIAL | No enforcement, just a length check in test |
