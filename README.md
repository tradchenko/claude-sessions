# claude-sessions

Multi-agent session manager for AI coding assistants. Browse, search, resume, and manage sessions across **Claude Code**, **Codex CLI**, **Qwen Code**, and **Gemini CLI** from a single TUI. Includes a shared memory system that extracts and organizes knowledge from all your coding sessions.

## Features

- **Multi-agent** — unified view of sessions from Claude Code, Codex CLI, Qwen Code, Gemini CLI
- **Companion aware** — detects sessions launched via [Companion](https://github.com/anthropics/companion) and attributes them to the real agent `[C]`
- **Interactive TUI** — agent labels (`CLD` `CDX` `QWN` `GEM`), Tab to filter, Home/End, instant search
- **Instant startup** — session cache for sub-second launch, background refresh
- **AI summaries** — uses any available LLM CLI (Claude → Codex → Qwen → Gemini) to generate descriptions
- **Shared memory** — structured knowledge extraction across all agents with hotness-based ranking
- **MCP server** — exposes `memory-recall` and `memory-status` tools via stdio JSON-RPC
- **i18n** — 11 languages, auto-detected from system locale
- **Cross-platform** — macOS, Linux, Windows (WSL)
- **Zero runtime dependencies** — TypeScript compiled to JS, no packages needed at runtime

## Quick start

```bash
npm install -g @tradchenko/claude-sessions
cs install    # detects agents, installs hooks, enables memory
```

Or try instantly:

```bash
npx @tradchenko/claude-sessions
```

## Supported agents

| Agent | Label | Data source | Hooks | Resume | Memory instructions |
|-------|-------|-------------|-------|--------|-------------------|
| Claude Code | `CLD` | `~/.claude/history.jsonl` | Stop + SessionStart | `claude --resume` | `CLAUDE.md` |
| Codex CLI | `CDX` | `~/.codex/history.jsonl` | lazy extraction | `codex --resume` | `AGENTS.md` |
| Qwen Code | `QWN` | `~/.qwen/projects/*/chats/` | lazy extraction | `qwen --resume` | `QWEN.md` |
| Gemini CLI | `GEM` | `~/.gemini/history/` (git) | via migration | — | `GEMINI.md` |
| Companion | `[C]` | `~/.companion/recordings/` | — | — | — |

Companion is not a separate agent — its sessions are attributed to the actual agent (Claude, Codex, etc.) with a `[C]` marker.

## Commands

| Command | Description |
|---------|-------------|
| `cs` | Interactive TUI picker |
| `cs list` | Text list of recent sessions |
| `cs search <text>` | Search sessions by content |
| `cs summarize` | Generate AI summaries (uses any available LLM) |
| `cs install` | Detect agents, install hooks & memory instructions |
| `cs mcp-server` | Start MCP server for memory tools |
| `cs memory-status` | Show memory system statistics |
| `cs memory-search <q>` | Search extracted memories |
| `cs enable-memory` | Enable memory integration |
| `cs disable-memory` | Disable memory integration |
| `cs extract-memory` | Manually trigger memory extraction |

## TUI picker

| Key | Action |
|-----|--------|
| ↑↓ | Navigate (wraps around) |
| Tab | Cycle agent filter (All → CLD → CDX → QWN → GEM) |
| Home/End | Jump to first/last |
| PgUp/PgDn | Page scroll |
| Enter | Open/resume session |
| Ctrl-D | Delete session |
| Ctrl-A | AI summarize |
| Ctrl-R | Refresh |
| Type text | Instant search |
| Esc | Quit |

The picker starts instantly from cache, then loads all agents in the background. A status bar shows loading progress.

## Install

```bash
npm install -g @tradchenko/claude-sessions
cs install
```

The `install` command:

1. Detects all installed agents and Companion
2. Installs Stop and SessionStart hooks for Claude Code
3. Injects memory instructions into each agent's config file (`CLAUDE.md`, `AGENTS.md`, `QWEN.md`, `GEMINI.md`)
4. Creates memory directories and migrates existing session data
5. Shows session statistics

Safe — never overwrites existing configs, only appends.

### From source

```bash
git clone https://github.com/tradchenko/claude-sessions.git
cd claude-sessions
npm install && npm run build
npm link
cs install
```

## Memory system

Automatic knowledge extraction from coding sessions across all agents. Shared memory pool — knowledge from a Claude session is available when starting a Qwen session on the same project.

### Extraction strategies

- **Hooks** (Claude Code) — Stop hook extracts L0 instantly, spawns background L1
- **Lazy** (Codex, Qwen, Gemini) — discovered on next `cs` launch, extracted in background
- **Manual** — `cs extract-memory` triggers extraction on demand

### Three layers

| Layer | Speed | Method | Content |
|-------|-------|--------|---------|
| **L0** | Instant | JSONL parsing, no LLM | Summary, files, message count |
| **L1** | Background | LLM extraction via any CLI | Structured memories (profile, preferences, entities, events, cases, patterns) |
| **L2** | Reference | Original session files | Full conversation history |

### Hotness scoring

```
hotness = recency * 0.3 + frequency * 0.4 + relevance * 0.3
```

Top memories by hotness are loaded into agent context on session start. Deduplication prevents redundant memories across agents.

### Six categories

`profile` · `preferences` · `entities` · `events` · `cases` · `patterns`

## MCP server

```bash
cs mcp-server
```

Stdio-based MCP server (JSON-RPC 2.0) exposing two tools:

- **`memory-recall`** — search memories by keyword, returns results sorted by hotness
- **`memory-status`** — memory statistics, category breakdown, top memories

Add to your agent's MCP config for cross-agent memory access.

## Architecture

```
src/
├── cli.ts                     — CLI entry point & command routing
├── core/
│   ├── config.ts              — paths, constants, cross-platform utils
│   └── i18n.ts                — 11 languages
├── agents/
│   ├── types.ts               — AgentAdapter interface
│   ├── registry.ts            — detection, caching, config
│   ├── claude.ts              — Claude Code adapter
│   ├── codex.ts               — Codex CLI adapter
│   ├── qwen.ts                — Qwen Code adapter
│   ├── gemini.ts              — Gemini CLI adapter
│   └── companion.ts           — Companion session attribution
├── sessions/
│   ├── loader.ts              — multi-agent session loader
│   ├── cache.ts               — disk cache for instant startup
│   └── lazy-extract.ts        — background discovery for hookless agents
├── commands/
│   ├── picker.ts              — interactive TUI
│   ├── list.ts                — text output
│   ├── summarize.ts           — AI summaries (multi-LLM)
│   ├── install.ts             — setup & agent detection
│   ├── delete.ts, restore.ts, uninstall.ts
│   ├── enable-memory.ts, disable-memory.ts
│   └── memory-status.ts, memory-search.ts
├── hooks/
│   ├── stop.ts                — session end: save metadata + L0
│   └── session-start.ts       — session start: load memory catalog
├── memory/
│   ├── types.ts               — MemoryEntry, MemoryIndex, etc.
│   ├── extract-l0.ts          — L0 extraction (Claude format)
│   ├── extract-l0-multi.ts    — L0 for all agent formats
│   ├── extract-l1.ts          — L1 via LLM (multi-agent file discovery)
│   ├── hotness.ts, dedup.ts, catalog.ts, format.ts
│   ├── index.ts, config.ts, migrate.ts, project.ts
└── mcp/
    └── server.ts              — MCP server (stdio JSON-RPC)
```

40 TypeScript source files. Compiled JS shipped in `dist/`. Zero runtime dependencies.

## Development

```bash
npm install          # install devDependencies (typescript, @types/node)
npm run build        # compile TypeScript → dist/
npm test             # run all tests (108 tests across 3 suites)
npm link             # link for local testing
```

## i18n

Auto-detects from `LC_ALL`, `LANG`, `LANGUAGE`, or `AppleLocale` (macOS).

Supported: English, Russian, Spanish, French, German, Chinese (Simplified & Traditional), Japanese, Korean, Portuguese, Turkish.

```bash
CLAUDE_SESSIONS_LANG=en cs    # force English
```

## Uninstall

```bash
cs uninstall                              # remove hooks & commands
npm uninstall -g @tradchenko/claude-sessions  # remove package
```

## License

MIT
