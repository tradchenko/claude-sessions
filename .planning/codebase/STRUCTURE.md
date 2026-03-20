# claude-sessions Directory Structure

## Tree Layout

```
/Users/tradchenko/claude-sessions/
├── src/                                   ← Source code (TypeScript)
│   ├── cli.ts                             ← Entry point, command routing
│   │
│   ├── core/                              ← Core utilities
│   │   ├── config.ts                      ← Paths, constants, cross-platform utils
│   │   └── i18n.ts                        ← Internationalization (11 languages)
│   │
│   ├── agents/                            ← Multi-agent abstraction (7 files)
│   │   ├── types.ts                       ← AgentAdapter interface, type definitions
│   │   ├── registry.ts                    ← Agent detection, caching, config management
│   │   ├── claude.ts                      ← Claude Code adapter
│   │   ├── codex.ts                       ← Codex CLI adapter
│   │   ├── qwen.ts                        ← Qwen Code adapter
│   │   ├── gemini.ts                      ← Gemini CLI adapter
│   │   └── companion.ts                   ← Companion session attribution
│   │
│   ├── sessions/                          ← Session loading & caching (3 files)
│   │   ├── loader.ts                      ← Multi-agent session orchestrator
│   │   ├── cache.ts                       ← Disk cache for instant startup
│   │   └── lazy-extract.ts                ← Background session discovery
│   │
│   ├── commands/                          ← CLI commands (12 files)
│   │   ├── picker.ts                      ← Interactive TUI (23 KB)
│   │   ├── list.ts                        ← Text list output
│   │   ├── summarize.ts                   ← AI summaries (multi-LLM)
│   │   ├── install.ts                     ← Setup, detect agents, install hooks
│   │   ├── uninstall.ts                   ← Remove hooks
│   │   ├── delete.ts                      ← Delete a session
│   │   ├── restore.ts                     ← Restore from JSONL/snapshot
│   │   ├── cleanup.ts                     ← Remove orphaned sessions
│   │   ├── enable-memory.ts               ← Enable memory integration (11 KB)
│   │   ├── disable-memory.ts              ← Disable memory (6 KB)
│   │   ├── memory-status.ts               ← Memory statistics
│   │   └── memory-search.ts               ← Search memories
│   │
│   ├── hooks/                             ← Session lifecycle automation (3 files)
│   │   ├── stop.ts                        ← Session end: save L0, trigger L1
│   │   ├── session-start.ts               ← Session start: load hot memories
│   │   └── save-summary.ts                ← Generate session summary
│   │
│   ├── memory/                            ← Memory system (14 files, 11 KB avg)
│   │   ├── types.ts                       ← Core types: MemoryEntry, MemoryIndex, L0Data
│   │   ├── index.ts                       ← Read/write memory index (index.json)
│   │   │
│   │   ├── extract-l0.ts                  ← L0 for Claude (JSONL parsing)
│   │   ├── extract-l0-multi.ts            ← L0 for all agents (multi-format)
│   │   ├── extract-l1.ts                  ← L1 extraction via LLM (subprocess)
│   │   ├── lazy-extract.ts                ← Discover pending L1 extractions
│   │   │
│   │   ├── hotness.ts                     ← Hotness scoring + pruning
│   │   ├── dedup.ts                       ← Fuzzy deduplication across sessions
│   │   ├── catalog.ts                     ← Session-to-memory mapping
│   │   ├── format.ts                      ← Markdown serialization
│   │   ├── project.ts                     ← Project detection
│   │   ├── snapshot.ts                    ← Session snapshot save/restore
│   │   ├── config.ts                      ← Memory subsystem config
│   │   └── migrate.ts                     ← Data migrations
│   │
│   └── mcp/                               ← MCP server (1 file)
│       └── server.ts                      ← stdio JSON-RPC server for memory tools
│
├── dist/                                  ← Compiled JavaScript (generated)
│   ├── cli.js                             ← Executable entry point
│   └── (other compiled modules)
│
├── claude-commands/                       ← Slash commands for agents (custom)
│   └── (generated during install)
│
├── scripts/                               ← Build & utility scripts
│
├── test/                                  ← Test suite (108 tests)
│   ├── run.mjs                            ← Test runner
│   └── (test files)
│
├── docs/                                  ← Documentation
│
├── package.json                           ← NPM metadata, bin exports, scripts
├── tsconfig.json                          ← TypeScript configuration
├── README.md                              ← User documentation
├── AUDIT-REPORT.md                        ← Security/audit report
├── LICENSE                                ← MIT license
└── .claude/                               ← Session memory (not source)
    └── session-memory/                    ← Memory storage for this project
```

## Key Locations

### Finding What You Need

| Goal | Location |
|------|----------|
| Add a new agent (e.g., Anthropic) | `src/agents/new-agent.ts` + export from `registry.ts` |
| Add a CLI command | `src/commands/my-command.ts` + route in `cli.ts` |
| Change session picker UI | `src/commands/picker.ts` (23 KB TUI logic) |
| Modify memory extraction | `src/memory/extract-l0.ts` (L0) or `extract-l1.ts` (LLM) |
| Change hotness scoring | `src/memory/hotness.ts` |
| Add MCP tool | `src/mcp/server.ts` (JSON-RPC handler) |
| Configure paths/constants | `src/core/config.ts` |
| Add language translation | `src/core/i18n.ts` (11 languages) |
| Session lifecycle hooks | `src/hooks/` (stop.ts, session-start.ts) |
| Session data format | `src/sessions/loader.ts` interface + specific agent adapter |

## Naming Conventions

### Files

- **Commands**: `command-name.ts` (kebab-case)
- **Adapters**: `agent-id.ts` (e.g., `claude.ts`, `codex.ts`)
- **Extraction**: `extract-l{0|1}.ts` for layer-specific logic; `extract-l0-multi.ts` for multi-agent variants
- **Hooks**: `hook-name.ts` (e.g., `session-start.ts`, `stop.ts`)
- **Utilities**: `operation.ts` (e.g., `hotness.ts`, `dedup.ts`, `catalog.ts`)
- **Types**: `types.ts` for interface definitions

### Directories

- **`src/`** — All source code
- **`src/core/`** — Shared utilities (config, i18n)
- **`src/agents/`** — Agent abstraction layer
- **`src/sessions/`** — Session orchestration
- **`src/commands/`** — CLI command handlers
- **`src/hooks/`** — Lifecycle automation
- **`src/memory/`** — Memory subsystem
- **`src/mcp/`** — MCP server implementation
- **`dist/`** — Compiled output (generated by `npm run build`)

### Functions & Exports

- **Handler functions**: `handleCommand()`, `handleKeyDown()` (prefix: `handle`)
- **Async loaders**: `loadSessions()`, `loadCatalog()`
- **Extractors**: `extractL0()`, `extractL1()`
- **Utilities**: `hotness()`, `dedup()`, `score()`
- **Default exports**: Used for lazy-loaded CLI commands (e.g., `export default list;`)

### Types

- **Interfaces**: `PascalCase` (e.g., `AgentAdapter`, `Session`, `MemoryEntry`)
- **Type aliases**: `PascalCase` (e.g., `AgentId`, `MemoryCategory`)
- **Enums**: Avoided in favor of union types for tree-shaking

## Module Organization Pattern

### Dependency Flow (Acyclic)

```
CLI (cli.ts)
  ↓
Commands (commands/)
  ↓
Sessions Loader (sessions/loader.ts)
  ↓
Agents (agents/) + Memory (memory/)
  ↓
Core Utilities (core/)
```

**Key principle**: Commands depend on domain layers (sessions, memory), never vice versa.

### Circular Dependency Prevention

- **Registry import guards**: `lazy-import` agent registry in loader to avoid circular deps
- **Separate types**: Type definitions in `types.ts` imported before implementations
- **Index files**: Not used; direct imports to avoid re-export cycles

## Data Flow Files

### Session Loading Path

```
cli.ts (command routing)
  → commands/picker.ts (or list.ts)
    → sessions/loader.ts (multi-agent orchestrator)
      → agents/{claude,codex,qwen,gemini}.ts (individual adapters)
        → agents/registry.ts (detection + caching)
          → core/config.ts (paths)
```

### Memory Extraction Path

```
hooks/stop.ts (session end)
  → memory/extract-l0.ts (instant JSONL parsing)
  → spawn: memory/extract-l1.ts (LLM extraction subprocess)
    → memory/dedup.ts (fuzzy matching)
    → memory/hotness.ts (scoring)
    → memory/index.ts (persist to index.json)
```

### Memory Load Path (Session Start)

```
hooks/session-start.ts (session start)
  → memory/catalog.ts (lookup by session)
    → memory/hotness.ts (rank by hotness)
      → CLAUDE.md instructions (inject via `instructions` field)
```

### MCP Server Path

```
cli.ts mcp-server command
  → mcp/server.ts (stdio JSON-RPC listener)
    → Handler dispatch (memory-recall, memory-save, etc.)
      → memory/index.ts (read/write)
      → memory/catalog.ts (search)
```

## Configuration Files

| File | Purpose | Format |
|------|---------|--------|
| `package.json` | NPM metadata, bin exports, build scripts | JSON |
| `tsconfig.json` | TypeScript compiler settings (ES2022, strict mode) | JSON |
| `~/.claude/session-memory/index.json` | Memory index (sessions + memories) | JSON |
| `~/.claude/session-memory/agents.json` | Agent detection config (primary, disabled) | JSON |
| `~/.claude/session-memory/projects/<project>/*.md` | Memory files (one per entry) | Markdown |
| `~/.claude/session-memory/cache.json` | Session cache for instant startup | JSON |

## Size & Complexity Metrics

| Category | Files | Avg Size | Total |
|----------|-------|----------|-------|
| Agents | 7 | ~2 KB | ~14 KB |
| Memory | 14 | ~2.5 KB | ~35 KB |
| Commands | 12 | ~2 KB | ~24 KB |
| Sessions | 3 | ~2 KB | ~6 KB |
| Hooks | 3 | ~1.5 KB | ~4.5 KB |
| Core | 2 | ~1.5 KB | ~3 KB |
| MCP | 1 | ~3 KB | ~3 KB |
| **Total** | **42** | **~2 KB** | **~89 KB** |

(Compiled to ~250 KB JS, uncompressed; ~50 KB gzipped)

## Test Structure

- **Test runner**: `test/run.mjs` (Node's native test runner)
- **Test count**: 108 tests across 3 suites
- **Coverage**: Memory extraction, session loading, deduplication, hotness scoring
- **Run**: `npm test`

## Build & Distribution

### Compilation

```bash
npm run build
# Outputs: dist/*.js (ESM modules, source maps)
```

### Package Contents (published to npm)

```
files: ["dist/", "claude-commands/", "README.md", "LICENSE"]
```

### Installation

```bash
npm install -g @tradchenko/claude-sessions
# Creates: /usr/local/bin/claude-sessions → dist/cli.js
# Creates: /usr/local/bin/cs → dist/cli.js
```

## Extensibility Points

1. **New agent**: Implement `AgentAdapter` in `src/agents/new.ts`, register in `registry.ts`
2. **New command**: Create `src/commands/new.ts`, route in `cli.ts`
3. **New memory category**: Add to `MemoryCategory` union in `src/memory/types.ts`, update L1 extraction prompt
4. **New MCP tool**: Add handler to switch in `src/mcp/server.ts`
5. **New language**: Add translation object to `src/core/i18n.ts`
6. **New memory scoring factor**: Update formula in `src/memory/hotness.ts`
