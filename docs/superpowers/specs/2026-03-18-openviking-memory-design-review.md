# Design Review: OpenViking Memory System

**Reviewer:** Claude Opus 4.6 (Senior Code Reviewer)
**Date:** 2026-03-18
**Spec:** `2026-03-18-openviking-memory-design.md`
**Verdict:** Solid foundation with several gaps to address before implementation.

---

## What Works Well

- L0/L1/L2 layering is clean and maps naturally onto the existing Stop hook flow.
- Opt-in Claude integration with separate enable/disable is the right call -- keeps the core package usable without modifying user config.
- The lazy Phase 3 fallback is smart -- handles the case where the background process fails or the machine sleeps.
- Memory categories are well-chosen and the appendable/immutable distinction is practical.
- Token budgets (100/2k/1500 injection) are explicit -- good for keeping costs predictable.

---

## Critical Issues (Must Fix)

### C1. Concurrent write corruption on `index.json`

The Stop hook writes to `session-index.json` synchronously today. The new design adds:
- Stop hook writes L0 to `index.json`
- Background Phase 2 writes L1 + memories to `index.json`
- Phase 3 lazy fallback also writes to `index.json`
- Possibly another session's Stop hook fires simultaneously

With no locking, two concurrent `JSON.parse -> modify -> writeFileSync` cycles will lose data. The existing 200-entry cap in `save-session-summary.mjs` already has this problem, but memory data is more valuable.

**Recommendation:** Implement a simple file-lock mechanism (write a `.lock` file with PID, check staleness, retry with backoff). This is doable with zero deps using `fs.openSync` with `wx` flag. Alternatively, use `fs.renameSync` atomic swap pattern: write to `.tmp`, then rename.

### C2. Background process spawning is underspecified

The spec says "Spawn detached background process for Phase 2" but doesn't specify:
- How exactly (`child_process.spawn` with `detached: true` + `unref()`?)
- How to pass `session_id` and `cwd` to it (args? env?)
- What happens if `claude` CLI is not available (Phase 2 requires it)
- Stdout/stderr routing (to `error.log`?)
- Process cleanup -- what if user shuts down machine during extraction?

**Recommendation:** Add a dedicated subsection specifying the spawn mechanism. Consider: `spawn('node', [extractScript, '--session', id], { detached: true, stdio: ['ignore', logFd, logFd] })` and `child.unref()`. Also specify that Phase 2 must check for `claude` CLI availability and gracefully degrade.

### C3. Claude CLI invocation for extraction -- cost and rate limits

Phase 2 calls Claude CLI with an extraction prompt on every session end. This is:
- A real API call with real cost (not free)
- Subject to rate limiting
- Potentially slow (5-30 seconds)

The spec doesn't address: What model? What max tokens? What if the user has no API credits? What if rate-limited?

**Recommendation:** Add a section on:
- Default model for extraction (e.g., `claude --model haiku` for cost efficiency)
- Max tokens budget for the extraction call
- Graceful degradation when CLI fails (mark session as `l1_pending`, retry in Phase 3)
- Optional: user-configurable model in `config.json`

---

## Important Issues (Should Fix)

### I1. `index.json` will grow unbounded

The spec has no size limit on `index.json`. The existing `session-index.json` caps at 200 entries. With 6 categories of memories accumulating over months, `index.json` could grow large.

**Recommendation:** Define limits -- max memories per category, max total memories, archival threshold (e.g., hotness < 0.1 for 30 days). The "archived" concept is mentioned but the mechanics are not specified.

### I2. Deduplication algorithm is vague

Phase 2 step 3 says "search index by name/category" and "if similar exists: merge or skip." This is the hardest part of the system and it's a single bullet point. Questions:
- How is "similar" determined? Exact name match? Fuzzy? Substring?
- What does "merge" mean for an immutable `events` category?
- Who decides merge vs. skip -- the LLM in the extraction prompt, or deterministic code?

**Recommendation:** Specify that deduplication is handled by the LLM in the extraction prompt. The prompt should receive the existing memory catalog and output either `{action: "create", ...}` or `{action: "update", target: "existing-name", content: "merged content"}`. For immutable categories, only `create` is allowed.

### I3. SessionStart hook is not defined in Claude's hook system

The spec references a "SessionStart hook" but Claude Code's `settings.json` hook system currently supports `Stop` hooks. Does Claude Code support `SessionStart` / `PreToolUse` / etc.?

**Recommendation:** Verify which hooks Claude Code actually supports. If `SessionStart` is not available, the alternative is to inject via CLAUDE.md (which auto-loads on every session) plus a startup slash command. Clarify the actual mechanism.

### I4. Two separate index files create drift risk

The design has `session-index.json` (existing) AND `~/.claude/session-memory/index.json` (new). Session data now lives in two places. The `sessions` key in the new `index.json` duplicates what's in `session-index.json`.

**Recommendation:** Either:
- (a) Migrate `session-index.json` into the new `index.json` (breaking change, needs migration), or
- (b) Keep them separate but remove the `sessions` key from the new index -- reference `session-index.json` as the source of truth for session metadata, and only store memory-specific data in the new index.

### I5. Memory file frontmatter parsing requires a YAML parser

The `.md` files use YAML frontmatter (`---` delimited). Parsing YAML with zero external dependencies means writing a custom parser. YAML is surprisingly complex (multiline strings, anchors, arrays, etc.).

**Recommendation:** Use JSON frontmatter instead (`---json` / `---`) or a simplified key-value format that can be parsed with a 20-line regex. Alternatively, define the exact YAML subset supported (only `key: value`, `key: [a, b]`, no nested objects, no multiline) and write a minimal parser. Specify this constraint explicitly.

### I6. `relevance_score` in hotness formula is undefined

The formula uses `relevance_score: project match bonus + category weight` but neither "project match bonus" nor "category weight" are defined numerically.

**Recommendation:** Define concrete values. Example:
- Project match bonus: +0.3 if memory's `projects` array includes current `cwd`
- Category weights: `profile=0.8, preferences=0.7, patterns=0.6, cases=0.5, entities=0.4, events=0.3`
- Normalization: clamp to [0, 1]

---

## Suggestions (Nice to Have)

### S1. Add a `--dry-run` flag to `extract-memory`

For debugging and user trust, `claude-sessions extract-memory --dry-run` should show what would be extracted without writing anything.

### S2. Consider memory export/import

Users switching machines or sharing team knowledge would benefit from `claude-sessions memory-export` / `memory-import`. Even if not in v1, mention it as a future extension point so the file format accounts for portability (no absolute paths in memory content).

### S3. Add version field to memory files

Individual `.md` files don't have a version field. If the frontmatter format changes, there's no way to migrate them. Add `format_version: 1` to frontmatter.

### S4. Error logging path should be configurable

`~/.claude/session-memory/error.log` will grow forever. Consider rotation (keep last 100KB) or at minimum mention cleanup in the spec.

### S5. Specify the extraction prompt

The spec says "Call Claude CLI with extraction prompt" but doesn't include the actual prompt. Since prompt quality determines memory quality, include at least a draft prompt template in the spec or as a separate document.

### S6. Consider `--no-memory` flag for sensitive sessions

Some sessions may contain secrets or sensitive data the user doesn't want persisted. A `claude --no-memory` equivalent or post-hoc `claude-sessions forget <session-id>` command would be valuable.

---

## Feasibility Assessment

| Aspect | Verdict | Notes |
|--------|---------|-------|
| Zero deps | Feasible with caveats | YAML frontmatter parsing needs custom code (see I5) |
| Stop hook <500ms | Feasible | L0 extraction is pure JSONL parsing, no LLM |
| Background Phase 2 | Feasible | Node `spawn` with `detached: true` works |
| Claude CLI integration | Feasible | Requires `claude` CLI on PATH |
| Hotness scoring | Feasible | Pure math, straightforward |
| File-based storage | Feasible | But needs locking (see C1) |

**Overall: Buildable in ~3-4 implementation steps.** The biggest engineering risks are concurrent writes (C1) and deduplication quality (I2).

---

## Recommended Implementation Order

1. **Storage layer** -- `index.json` schema, file locking, CRUD operations for memories
2. **L0 extraction** -- Extend existing Stop hook, no LLM needed
3. **L1 background extraction** -- Spawn mechanism, Claude CLI call, deduplication
4. **Hotness scoring + injection** -- SessionStart hook or CLAUDE.md integration
5. **CLI commands + slash commands** -- `memory-status`, `memory-search`, etc.
6. **Install/enable/disable lifecycle** -- Extend `install.mjs`
