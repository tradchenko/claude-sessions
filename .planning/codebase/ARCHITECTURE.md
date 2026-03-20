# claude-sessions Architecture

## System Overview and Purpose

**claude-sessions** is a multi-agent session manager and unified memory system for AI coding assistants. It provides:

- **Multi-agent unification**: Browse, search, and resume sessions from Claude Code, Codex CLI, Qwen Code, and Gemini CLI through a single TUI interface
- **Session management**: Interactive picker with search, instant startup via caching, and session snapshot recovery
- **Shared memory system**: Automatic knowledge extraction across all agents with L0/L1/L2 layers and hotness-based ranking
- **MCP server**: Exposes memory tools via stdio JSON-RPC for cross-agent context
- **Hook integration**: Automatic session snapshots, metadata extraction, and memory injection on session start/stop

Version: 2.2.3 | Node.js: ≥18.0.0 | Language: TypeScript (ES2022) | Runtime dependencies: 0

## Architectural Pattern

**Modular monolith** with clear separation of concerns:

1. **Agent Adapter Pattern** — Each AI agent (Claude, Codex, Qwen, Gemini) implements a common `AgentAdapter` interface for session loading, resumption, and detection
2. **Command/Query Separation** — CLI commands are discrete modules, each handling a specific operation (picker, search, install, memory extraction)
3. **Layered Memory System** — L0 (instant JSONL parsing) → L1 (LLM extraction) → L2 (original files); deduplication and hotness ranking applied
4. **Hook-based Automation** — Session lifecycle hooks (start, stop, save-summary) inject metadata and load memories without manual user intervention
5. **Unified Index Pattern** — Single source of truth (`memory/index.ts`) maintains session metadata and memory entries with consistency

## Key Layers and Their Responsibilities

### 1. **Entry Point & CLI Layer** (`src/cli.ts`)
- Route user commands to appropriate handlers
- Support shortcuts (quick launch by number, aliases)
- Lazy-load command modules for fast startup

### 2. **Agent Abstraction Layer** (`src/agents/`)
- **`types.ts`** — Defines `AgentAdapter` interface and types
- **`registry.ts`** — Detects installed agents, caches results, manages agent configuration
- **`claude.ts`, `codex.ts`, `qwen.ts`, `gemini.ts`** — Concrete adapters, each implementing session loading from their native data sources
- **`companion.ts`** — Detects Companion recordings and attributes them to the real agent

**Key responsibility**: Abstract differences in session data formats across multiple AI agents into a unified `Session` interface.

### 3. **Session Management Layer** (`src/sessions/`)
- **`loader.ts`** — Orchestrates multi-agent session loading, merges results, applies filters (project, search, agent)
- **`cache.ts`** — Disk-based session cache for sub-second TUI startup
- **`lazy-extract.ts`** — Background discovery of new sessions from hookless agents (Codex, Qwen, Gemini)

**Data flow**: Adapters → Session Loader → Merged/Sorted Session List → Cache / UI

### 4. **Memory System Layer** (`src/memory/`)

#### Structure
- **`types.ts`** — Core types: `MemoryEntry`, `MemoryIndex`, `L0Data`, `MemoryCategory` (profile, preferences, entities, events, cases, patterns)
- **`index.ts`** — Read/write operations on `memory/index.json`; session metadata and memory entries CRUD

#### L0 Extraction (Instant)
- **`extract-l0.ts`** — Parse Claude's `history.jsonl`: extract summary, project, message count, files
- **`extract-l0-multi.ts`** — Extract L0 from Codex, Qwen, Gemini JSONL formats (multi-agent support)

#### L1 Extraction (Background)
- **`extract-l1.ts`** — Spawned subprocess; uses any available LLM CLI to structure session content into memory categories
- **`lazy-extract.ts`** — Discovers pending L1 extractions and triggers background processing

#### Memory Operations
- **`catalog.ts`** — Session-to-memory association, memory lookup by session
- **`dedup.ts`** — Fuzzy matching, merging duplicate memories across sessions
- **`hotness.ts`** — Scoring: `recency * 0.3 + frequency * 0.4 + relevance * 0.3`
- **`format.ts`** — Markdown serialization for memory files
- **`project.ts`** — Project detection from session content
- **`snapshot.ts`** — Session snapshot save/restore (first 15 + last 35 messages)
- **`config.ts`** — Memory subsystem configuration
- **`migrate.ts`** — Data migration between versions

**Key responsibility**: Extract, deduplicate, rank, and serve contextual memories across all agents with automatic hotness pruning.

### 5. **Hook System** (`src/hooks/`)
- **`stop.ts`** — Triggered when session ends (Claude Stop hook); saves L0 metadata and triggers L1 extraction
- **`session-start.ts`** — Triggered on session start (Claude SessionStart hook); loads hot memories via `instructions` field
- **`save-summary.ts`** — Generate and save session summary via any available LLM

**Responsibility**: Inject session lifecycle automation without user intervention.

### 6. **Command Layer** (`src/commands/`)
Each command is a discrete module implementing specific user actions:

- **`picker.ts`** — Interactive TUI: navigate, search, filter by agent, resume/delete/summarize
- **`list.ts`** — Text output of sessions with optional search
- **`summarize.ts`** — Generate AI summaries using any available LLM CLI
- **`install.ts`** — Detect agents, install hooks, enable memory, create directories
- **`uninstall.ts`** — Remove hooks and commands
- **`delete.ts`** — Delete a session
- **`restore.ts`** — Restore session from JSONL (full restore) or snapshot (fallback)
- **`cleanup.ts`** — Remove orphaned sessions with no data (`--dry-run` for preview)
- **`enable-memory.ts`, `disable-memory.ts`** — Toggle memory integration
- **`memory-status.ts`** — Show memory statistics and category breakdown
- **`memory-search.ts`** — Search memories by keyword

### 7. **MCP Server Layer** (`src/mcp/`)
- **`server.ts`** — Stdio-based MCP server (JSON-RPC 2.0)
- Exposes tools: `memory-recall`, `memory-status`, `memory-save`, `save-snapshot`
- Auto-loads hot memories via `instructions` field during initialization

**Responsibility**: Enable cross-agent memory access through Claude's MCP protocol.

### 8. **Core Utilities** (`src/core/`)
- **`config.ts`** — Cross-platform paths, constants, environment detection, date formatting
- **`i18n.ts`** — 11 language support with auto-detection from system locale

## Data Flow Between Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interaction (CLI)                       │
└────────────┬────────────────────────────────────────────────────┘
             │ (command routing)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLI Entry Point (cli.ts)                      │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┼──────────────────┬──────────────┬──────────────┐
    │        │                  │              │              │
    ▼        ▼                  ▼              ▼              ▼
  Picker  List/Search       Summarize       Install        Memory Ops
 (picker.ts) (list.ts)    (summarize.ts)  (install.ts)  (memory-*.ts)

    │        │                  │              │              │
    └────────┼──────────────────┼──────────────┼──────────────┘
             │
             ▼
    ┌────────────────────────────────────────────────┐
    │   Session Loader (sessions/loader.ts)          │
    │   - Orchestrates multi-agent loading           │
    │   - Applies filters and sorting                 │
    └────────────┬───────────────────────────────────┘
                 │
      ┌──────────┼──────────┬─────────────┬──────────────┐
      │          │          │             │              │
      ▼          ▼          ▼             ▼              ▼
    Claude    Codex      Qwen          Gemini       Companion
    Adapter  Adapter    Adapter       Adapter       Adapter
   (agents/) (agents/)  (agents/)     (agents/)    (agents/)
      │          │          │             │              │
      └──────────┼──────────┼─────────────┼──────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────────────┐
    │  Merged Session List (sorted by recency)       │
    └────────────┬───────────────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
      ▼                     ▼
  Cache (fast TUI)    Background Lazy Extract
                      (sessions/lazy-extract.ts)
                      │
                      └──→ New sessions discovered
                           │
                           ▼
                      Memory Extraction
                      (memory/extract-l0/l1.ts)
                           │
                           ▼
                      ┌────────────────────────┐
                      │  Memory Index          │
                      │  (memory/index.json)   │
                      │  - Sessions metadata   │
                      │  - Memory entries      │
                      │  - Hotness scores      │
                      └────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    MCP Server        Session Start    Memory Search
   (mcp/server.ts)   Hook Auto-load   (CLI commands)
         │
         ▼
   Cross-Agent Memory Access
```

## Entry Points

1. **CLI Binary** — `src/cli.ts` → compiled to `dist/cli.js`
   - Exported as `claude-sessions` and `cs` commands in `package.json` bin

2. **Memory Extraction Subprocess** — `src/memory/extract-l1.ts`
   - Spawned by `cli.ts` extract-memory command
   - Separate process for LLM calls (avoid blocking main process)

3. **MCP Server** — `src/mcp/server.ts`
   - Spawned by `cs mcp-server` command
   - Listens on stdio for JSON-RPC requests

4. **Hook Scripts** — Installed by `install.ts`
   - Claude Stop hook → `dist/hooks/stop.js`
   - Claude SessionStart hook → `dist/hooks/session-start.js`

## Key Abstractions and Interfaces

### `AgentAdapter` (src/agents/types.ts)
```typescript
interface AgentAdapter {
   readonly id: AgentId;
   readonly name: string;
   readonly icon: string;
   detect(): AgentInfo | null;
   loadSessions(options?: AgentLoadOptions): Promise<Session[]>;
   getResumeCommand(sessionId: string): string[] | null;
   isSessionAlive(sessionId: string): boolean;
   getInstructionsPath(): string | null;
}
```
**Purpose**: Unified interface for heterogeneous agent implementations. Allows adding new agents without modifying core logic.

### `Session` (src/sessions/loader.ts)
```typescript
interface Session {
   id: string;
   project: string;
   projectPath: string;
   summary: string;
   dateStr: string;
   cnt: string;
   lastTs: number;
   count: number;
   searchText: string;
   agent: string;
   viaCompanion?: boolean;
   hasJsonl?: boolean;
   hasSnapshot?: boolean;
}
```
**Purpose**: Normalized session representation across all agents. Used by UI and commands.

### `MemoryIndex` (src/memory/types.ts)
```typescript
interface MemoryIndex {
   version?: number;
   sessions: Record<string, SessionMeta>;
   memories: Record<string, MemoryEntry>;
}
```
**Purpose**: Single source of truth for session metadata and extracted memories. Persisted to `~/.claude/session-memory/index.json`.

### MCP Tool Interface (src/mcp/server.ts)
```
Tools: memory-recall, memory-status, memory-save, save-snapshot
Input/Output: JSON-RPC 2.0 over stdio
```
**Purpose**: Enable memory access from any MCP-compatible agent without internal API changes.

## Key Design Decisions

1. **Zero runtime dependencies** — All functionality in TypeScript compiled to vanilla Node.js for fast installation and no supply chain risk
2. **Hook-based memory injection** — Rather than requiring agents to call memory APIs, memories are injected via `instructions` field on session start
3. **Lazy extraction** — L0 is instant (JSONL parsing), L1 is background (LLM subprocess) to avoid blocking session resume
4. **Hotness pruning** — Unbounded memory growth prevented by scoring and automatic pruning of low-scoring entries
5. **Snapshot fallback** — If primary JSONL is lost, sessions can be restored from automatic snapshots (first 15 + last 35 messages)
6. **Adapter isolation** — Each agent's quirks (Qwen's git-based chat format, Gemini's flat directory structure) are isolated to adapter implementations
