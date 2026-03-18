# OpenViking Memory System — Design Spec

## Overview

A three-layer memory system (L0/L1/L2) with hotness scoring and auto-extraction, integrated into `claude-sessions`. After installation, memory works autonomously for all projects — Claude automatically remembers context across sessions without user intervention.

## Architecture

### Memory Layers

| Layer | Size | Content | Generation |
|-------|------|---------|------------|
| **L0** | ~100 tokens | Abstract: one-line summary, project, key topics | Stop hook, no LLM (JSONL parsing) |
| **L1** | ~2k tokens | Structured overview: files touched, decisions made, tasks, errors resolved | Background process via Claude CLI |
| **L2** | Original | Full session JSONL | Already exists |

### Dual Storage

1. **Structured index** at `~/.claude/session-memory/`
   - `index.json` — master catalog with hotness scores, categories, L0/L1 data
   - `memories/{category}/{name}.md` — individual memory files with frontmatter
   - `config.json` — user preferences, enabled/disabled state

2. **Native Claude projection** (opt-in at install)
   - Hot memories projected to `~/.claude/projects/.../memory/*.md`
   - Claude reads them natively via MEMORY.md index
   - SessionStart hook injects compact catalog + top hot memories

### 6 Memory Categories (OpenViking)

| Category | Type | Description |
|----------|------|-------------|
| `profile` | appendable | User role, expertise, responsibilities |
| `preferences` | appendable | Coding style, tools, workflow preferences |
| `entities` | appendable | Projects, services, people, systems |
| `events` | immutable | Incidents, deployments, decisions with dates |
| `cases` | immutable | Problem + solution pairs |
| `patterns` | appendable | Recurring approaches, anti-patterns learned |

### Hotness Scoring

```
hotness = recency_score * 0.3 + frequency_score * 0.4 + relevance_score * 0.3
```

- **recency_score**: `Math.exp(-days_since_last_access / 30)` — half-life ~21 days
- **frequency_score**: `Math.min(active_count / max_active_count_across_all, 1.0)`
- **relevance_score**: `project_match * 0.6 + category_weight * 0.4`
  - `project_match`: 1.0 if memory linked to current project, 0.3 if global, 0.0 otherwise
  - `category_weight`: profile=0.5, preferences=0.7, entities=0.4, events=0.3, cases=0.8, patterns=0.6

Hotness recalculated on each access. Memories with hotness < 0.1 archived (removed from catalog, kept on disk).

**Memory limits:** max 500 memories in index. When exceeded, archive lowest-hotness entries until under 400 (hysteresis to avoid thrashing).

## Auto-Extraction Pipeline

### Phase 1: Stop Hook (synchronous, fast, no LLM)

On session end, the existing Stop hook is extended:

1. Receive `session_id` + `cwd` from stdin (already implemented)
2. Parse last N messages from session JSONL
3. Extract L0: project path, message count, first user message (truncated), key file paths mentioned
4. Write L0 entry to `index.json` via atomic write (see Concurrency)
5. Spawn detached background process for Phase 2:
   ```js
   const child = spawn(process.execPath, [extractScript, sessionId, cwd], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, SESSION_MEMORY_DIR: memoryDir }
   });
   child.unref();
   ```

### Phase 2: Background Process (async, uses Claude CLI)

Detached `node` process (`src/extract-memory.mjs`) runs after hook returns:

1. Acquire file lock on `index.lock` (see Concurrency). If locked, exit silently (another process is working).
2. Read session JSONL (head 15 + tail 35, like restore.mjs)
3. Call Claude CLI with extraction prompt:
   ```
   claude --model haiku --print --output-format json \
     "Extract structured memories from this conversation. ..."
   ```
   - Model: `haiku` (fast, cheap). Configurable via `config.json`.
   - Timeout: 60s. On timeout or error: log to `error.log`, mark session as `extraction_failed`, exit.
   - Output format: JSON array of `{category, name, content, merge_with?}`
4. Deduplicate against existing memories (see Deduplication Algorithm)
5. Write updates to `index.json` via atomic write
6. Write individual `.md` files to `memories/{category}/`
7. If Claude integration enabled: project hot memories to native format
8. Update L1 in session index entry
9. Release file lock

### Deduplication Algorithm

For each candidate memory extracted by LLM:

1. **Exact match** — same `category` + `name` exists in index:
   - If category is appendable (profile, preferences, entities, patterns): merge content (append new lines, deduplicate sentences)
   - If category is immutable (events, cases): skip if content similarity > 80% (Jaccard on word set), create as `{name}-2` otherwise
2. **Fuzzy match** — no exact name match, but same category has entries with > 60% word overlap:
   - Include in Claude CLI prompt: "Does this new memory overlap with existing? Respond: skip | merge:{existing_name} | create"
   - This second LLM call only happens when fuzzy match detected (rare)
3. **No match** — create new memory entry

### Phase 3: Lazy Fallback (on next claude-sessions launch)

When user runs any `claude-sessions` command:

1. Check `index.json` for sessions with L0 but missing L1
2. If found: run Phase 2 for pending sessions (in background)
3. Log: "Extracting memories from N recent sessions..."

## Claude Integration (opt-in)

### SessionStart Hook

Injects into Claude context on session start:

```
# Session Memory (auto-loaded)
## Memory Catalog
| name | category | hotness | description |
| ...  | ...      | ...     | ...         |

## Hot Memories for {project}
{content of top 3-5 memories}

To load more: read files from ~/.claude/session-memory/memories/{category}/{name}.md
```

Total budget: ~1200 tokens (200 catalog + 1000 hot memories).

### CLAUDE.md Injection

Added to `~/.claude/CLAUDE.md`:

```markdown
# Session Memory System
You have a structured memory system at `~/.claude/session-memory/`.
A catalog and hot memories are loaded at session start.
If you need more context, read specific memory files via Read tool.
Path: `~/.claude/session-memory/memories/{category}/{name}.md`
Do not modify these files directly — they are managed by claude-sessions.
```

### Slash Commands

- **`/memory-recall`** — search memories by keyword, category, or project
- **`/memory-status`** — show stats: total memories, categories breakdown, top-10 by hotness

## Installation Flow

`claude-sessions install` updated:

```
Installing claude-sessions...
[x] Slash commands installed
[x] Stop hook installed (with L0 memory extraction)

Would you like to enable the Claude memory integration?
This will:
  - Add a SessionStart hook to load relevant memories
  - Add instructions to ~/.claude/CLAUDE.md
  - Project hot memories into Claude's native format

You can enable this later with: claude-sessions enable-memory
[y/N]:
```

**If declined:** Package still extracts L0/L1/L2 internally. Enhanced search/picker uses hotness ranking. No Claude hooks, no CLAUDE.md changes. claude-sessions works as improved v2.

**If accepted:** Full integration — SessionStart hook, CLAUDE.md injection, native projection.

### New CLI Commands

```
claude-sessions enable-memory    # Enable Claude integration post-install
claude-sessions disable-memory   # Remove Claude integration, keep internal data
claude-sessions extract-memory   # Manual extraction trigger
claude-sessions memory-status    # Show memory stats
claude-sessions memory-search <query>  # Search memories
```

## File Structure

```
~/.claude/session-memory/
  index.json                    # Master catalog
  config.json                   # Settings (enabled, thresholds, etc.)
  memories/
    profile/
      user-role.md
    preferences/
      coding-style.md
    entities/
      project-companion.md
    events/
      2026-03-15-auth-migration.md
    cases/
      fix-jsonl-parsing.md
    patterns/
      prefer-early-returns.md
```

### Memory File Format

JSON frontmatter (no YAML parser needed — zero deps):

```markdown
<!--json
{
  "name": "user-role",
  "category": "profile",
  "hotness": 0.85,
  "active_count": 12,
  "created": "2026-03-10T14:00:00Z",
  "updated": "2026-03-18T09:30:00Z",
  "source_sessions": ["abc123", "def456"],
  "projects": ["/Users/tradchenko/companion"]
}
-->

Senior full-stack developer. Primary stack: TypeScript, React, Node.js.
Focuses on AI tooling and developer experience.
```

Parsing: split on `<!--json` and `-->`, JSON.parse the middle, rest is content.

### index.json Schema

```json
{
  "version": 1,
  "memories": {
    "profile/user-role": {
      "name": "user-role",
      "category": "profile",
      "description": "User role and technical background",
      "hotness": 0.85,
      "active_count": 12,
      "created": "2026-03-10T14:00:00Z",
      "updated": "2026-03-18T09:30:00Z",
      "l0": "Senior full-stack dev, TypeScript/React/Node, AI tooling focus",
      "source_sessions": ["abc123", "def456"],
      "projects": ["/Users/tradchenko/companion"]
    }
  },
  "sessions": {
    "session-uuid-1": {
      "l0": "Implemented auth middleware refactor",
      "l1_ready": true,
      "extracted_at": "2026-03-18T10:00:00Z"
    }
  }
}
```

## Concurrency & Atomic Writes

All writes to `index.json` use atomic write pattern:

```js
// Write to temp file, then rename (atomic on POSIX)
const tmpPath = indexPath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
fs.renameSync(tmpPath, indexPath);
```

For Phase 2 (background process), a file lock prevents concurrent extraction:

```js
// Acquire lock
try {
   const lockFd = fs.openSync(lockPath, 'wx'); // fails if exists
   fs.writeFileSync(lockFd, String(process.pid));
   fs.closeSync(lockFd);
} catch {
   // Another process holds lock — exit silently
   process.exit(0);
}
// Release lock on exit
process.on('exit', () => fs.unlinkSync(lockPath));
```

Stale lock detection: if lock file exists but PID inside is not running, remove and re-acquire.

## Unified Index (session-index.json merge)

The existing `session-index.json` is migrated into `index.json` under the `sessions` key. The old `session-index.json` is kept as read-only fallback for one major version, then removed.

All session-related reads/writes go through the new `index.json`. The `sessions.mjs` module updated to read from new location with fallback.

## Migration of Existing Sessions

### On install (automatic, part of `claude-sessions install`)

1. Detect: `index.json` does not exist but `session-index.json` does
2. Create `index.json` with `sessions` key populated from `session-index.json`
3. For each session entry: generate L0 from JSONL (parse first user message + file paths). This is fast — JSONL parsing only, no LLM.
4. Spawn background process for batch L1 extraction of recent sessions (last 20)
5. Log: "Migrated N sessions to new memory index. Extracting memories from 20 most recent sessions in background..."

Also runs on `npm postinstall` (same as current hook/slash-command install).

If `index.json` already exists and `session-index.json` has newer entries not in index — merge them (handles case where user ran old version temporarily).

### L1 extraction for older sessions (lazy + manual)

- When user opens a session in picker or search hits it: check if L1 exists
- If not: queue for background extraction (same as Phase 2)
- Manual: `claude-sessions extract-memory --all` processes all sessions without L1

## Constraints

- Stop hook must complete in <500ms (no LLM calls)
- Background extraction is best-effort, failures are silent (logged to `~/.claude/session-memory/error.log`)
- Total SessionStart injection <1500 tokens
- Zero external dependencies (consistent with claude-sessions philosophy)
- JSON frontmatter in memory files (no YAML parser needed)
- Claude CLI model for extraction: `haiku` by default (configurable in config.json)
- Graceful degradation: if Claude CLI unavailable, L1 extraction skipped, L0 still works
- All user-facing text in English (code, comments, Claude instructions)
- i18n for CLI output via existing i18n.mjs system

## Testing Plan

- Unit tests for L0 extraction (JSONL parsing)
- Unit tests for hotness calculation
- Unit tests for memory deduplication logic
- Integration test: Stop hook -> L0 -> background -> L1
- Integration test: SessionStart hook output format
- Test: install with memory enabled / disabled
- Test: enable-memory / disable-memory lifecycle
- Test: lazy fallback extraction on next launch
- Test: memory file format validation
- Test: index.json schema validation and migration
