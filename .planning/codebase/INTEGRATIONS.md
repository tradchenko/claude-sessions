# External Integrations — claude-sessions

**Scope**: APIs, services, authentication, file system interactions, webhooks, and agent CLIs

---

## Multi-Agent Integration System

### Supported Agents (Agent Adapters)

The system supports 5 AI agents through pluggable adapter pattern (in `src/agents/`):

#### 1. Claude Code
- **Adapter**: `src/agents/claude.ts` (claudeAdapter)
- **Home Directory**: `~/.claude/`
- **Key Paths**:
  - History: `~/.claude/history.jsonl` (event log)
  - Sessions: `~/.claude/sessions/` (session data)
  - Projects: `~/.claude/projects/` (project metadata)
  - Session Index: `~/.claude/session-index.json`
  - Memory: `~/.claude/memory/`
  - Snapshots: `~/.claude/snapshots/`
- **CLI Detection**: Via `findClaudeCli()` — scans `$PATH` and common locations
- **Resume Command**: `claude-code <sessionId>`
- **Features**:
  - Session history parsing from JSONL
  - Project detection
  - Memory system integration
  - Session snapshots

#### 2. Codex
- **Adapter**: `src/agents/codex.ts` (codexAdapter)
- **Home Directory**: `~/.codex/`
- **Key Paths**:
  - History: `~/.codex/history.jsonl`
  - Sessions: `~/.codex/sessions/`
  - Session Index: `~/.codex/session-index.json`
- **CLI Detection**: Via `which codex` or common binary locations
- **Resume Command**: `codex <sessionId>`
- **Data Format**: Similar to Claude; reads JSONL session history

#### 3. Qwen Code
- **Adapter**: `src/agents/qwen.ts` (qwenAdapter)
- **Home Directory**: `~/.qwen/`
- **Key Paths**:
  - Projects: `~/.qwen/projects/{project}/chats/*.jsonl` (session JSONL files)
- **CLI Detection**: Via `which qwen` or binary locations (`/usr/local/bin/qwen`, `/opt/homebrew/bin/qwen`, etc.)
- **Resume Command**: `qwen resume <sessionId>` (resume disabled; fallback used)
- **Data Format**:
  ```typescript
  interface QwenJsonlEntry {
    uuid: string;
    parentUuid?: string;
    sessionId: string;
    timestamp: number;
    type: 'user' | 'assistant' | 'system' | 'tool_result';
    cwd?: string;
    version?: string;
    gitBranch?: string;
    message?: { role: string; parts: Array<{ text?, thought?, functionCall? }> };
  }
  ```

#### 4. Gemini CLI
- **Adapter**: `src/agents/gemini.ts` (geminiAdapter)
- **Home Directory**: `~/.gemini/`
- **Key Paths**:
  - History: `~/.gemini/history/{project}/` (git repositories per project)
- **CLI Detection**: Via `which gemini` or binary locations
- **Resume Command**: `gemini <sessionId>`
- **Storage Format**: Git repositories; last commit timestamp used for session timing
- **Data Extraction**: Reads commit logs to determine last activity

#### 5. Companion (Desktop Wrapper)
- **Adapter**: `src/agents/companion.ts` (companionAdapter)
- **Home Directory**: `~/.companion/`
- **Key Paths**:
  - Recordings: `~/.companion/recordings/`
  - Session Names: `~/.companion/session-names.json`
- **Authentication**: Via `COMPANION_AUTH_TOKEN` environment variable
- **API Integration**: Can open sessions via Companion API
- **Data Format**:
  ```typescript
  interface RecordingHeader {
    _header: true;
    version: number;
    session_id: string;
    backend_type: string;
    started_at: number | string;
    cwd: string;
  }
  ```
- **Agent Resolution**: Maps recordings to actual agents (Claude, Codex, Qwen, Gemini) based on session name patterns
- **Notes**: Companion is a launcher utility, not a standalone agent; sessions are attributed to the actual backend agent

### Agent Registry & Detection
- **File**: `src/agents/registry.ts`
- **Configuration**: `~/.claude/memory/agents.json` (or equivalent agent dir)
- **Stores**:
  - Known agents (previously detected)
  - Primary agent for restore operations
  - Disabled agents (user can hide)

---

## File System Interactions

### Data Storage Locations

All data is stored locally in user's home directory with platform-specific fallbacks:

| Location | Purpose | Format |
|----------|---------|--------|
| `~/.claude/` | Claude Code data | JSON, JSONL, text |
| `~/.codex/` | Codex data | JSON, JSONL |
| `~/.qwen/` | Qwen Code data | JSONL in project structure |
| `~/.gemini/` | Gemini CLI data | Git repositories |
| `~/.companion/` | Companion recordings | JSONL with headers |
| Platform-specific | Windows: `%APPDATA%/claude/`, XDG Linux: `$XDG_CONFIG_HOME/claude/` | Config fallbacks |

### Memory System Storage
- **Base**: `~/.claude/memory/` (or `.{agent}/memory/`)
- **Catalog**: `memory-index.json` (list of memories with hotness scores)
- **Entries**: `memory/{category}/{name}.md` (actual memory content)
- **Snapshots**: `~/.claude/snapshots/` (session snapshots for recovery)

### File Operations
- **Read**: JSONL parsing, line-by-line history reading (`readline` module)
- **Write**: JSON serialization, appending to JSONL logs
- **Delete**: Session cleanup, temporary file removal
- **Lock**: File-based locking for memory system (`~/.claude/memory/.lock`)
- **Compression**: References to `.gz` compression (inferred from snapshot handling)

---

## Authentication & Environment Variables

### Supported Auth Methods

1. **Companion API Token**
   - Variable: `COMPANION_AUTH_TOKEN`
   - Usage: `src/agents/companion.ts`, `src/commands/install.ts`
   - Purpose: Open sessions in Companion via API

2. **SDK URL (Fallback)**
   - Variable: `SDK_URL`
   - Usage: `src/commands/install.ts`
   - Purpose: Custom SDK endpoint for Companion

3. **Locale / Internationalization**
   - Variable: `LANG` or `LC_ALL`
   - Purpose: Detect system language (fallback: English)
   - Supported Languages: Russian, Spanish, French, German, Chinese (Simplified & Traditional), Japanese, Korean, Portuguese

### No Default API Keys
- **Claude API Key**: Not managed by this tool; managed by Claude Code CLI
- **Qwen API Key**: Not managed; Qwen CLI handles auth
- **Gemini API Key**: Not managed; Gemini CLI handles auth
- **Strategy**: Each agent CLI manages its own authentication

---

## CLI Integration & Spawning

### Child Process Execution
- **Module**: Node's `child_process` (execSync, spawnSync, execFileSync)
- **Usage**:
  - Detecting agent binaries via `which` command
  - Launching agent CLIs to open/resume sessions
  - Git operations (getting commit timestamps for Gemini)
  - System queries (platform detection)

### Agent Command Invocation
- **Claude**: `claude-code <sessionId>` (resume)
- **Codex**: `codex <sessionId>` (resume)
- **Qwen**: `qwen resume <sessionId>` (disabled; fallback to wrapper)
- **Gemini**: `gemini <sessionId>` (resume)
- **Companion**: API call via Node (when `COMPANION_AUTH_TOKEN` set)

### Webhook/Hook System
- **File**: `src/hooks/session-start.ts`, `src/hooks/save-summary.ts`, `src/hooks/stop.ts`
- **Installation**: Via `src/commands/enable-memory.ts`
  - Writes shell scripts to agent home directories
  - Hooks into agent session lifecycle (start, end, stop)
- **Uninstallation**: Via `src/commands/disable-memory.ts`
- **Purpose**: Trigger memory extraction and summaries at session boundaries

---

## Database Connections

**Status**: No external database

The system is entirely file-based:
- Session data: JSONL files from agent CLIs
- Memory index: JSON file (`memory-index.json`)
- Memory entries: Markdown files
- Session cache: JSON
- Agent config: JSON

---

## MCP (Model Context Protocol) Server

**File**: `src/mcp/server.ts`
- **Transport**: STDIO (JSON-RPC 2.0 over stdin/stdout)
- **Purpose**: Expose memory system to Claude Code and other MCP clients
- **Version**: 2.1.0

### MCP Tools
1. **memory-recall** — Search memories by keyword query
2. **memory-status** — Show memory system statistics
3. **memory-save** — Save new memory/insight

### Categories
- `cases` — Case studies
- `patterns` — Discovered patterns
- `entities` — Important entities/concepts
- `events` — Key events
- `preferences` — User preferences

---

## Session Snapshots & Recovery

**File**: `src/memory/snapshot.ts`
- **Purpose**: Recovery mechanism for interrupted sessions
- **Storage**: `~/.claude/snapshots/` (or agent-specific)
- **Contents**: Compressed session state for resume
- **Lifecycle**:
  - Created on session start
  - Updated on memory extraction
  - Cleaned up on successful session completion

---

## Summary: Integration Points

| System | Type | Location | Purpose |
|--------|------|----------|---------|
| Claude Code | Agent | `src/agents/claude.ts` | Session management, memory injection |
| Codex | Agent | `src/agents/codex.ts` | Session management |
| Qwen Code | Agent | `src/agents/qwen.ts` | Session management |
| Gemini CLI | Agent | `src/agents/gemini.ts` | Session management |
| Companion | Launcher | `src/agents/companion.ts` | Desktop session wrapper, API |
| Local File System | Storage | `~/.{agent}/` | All session & memory data |
| Child Process | Execution | Node's `child_process` | Agent CLI invocation |
| MCP Server | Protocol | `src/mcp/server.ts` | Memory system exposure |
| Hooks | Events | `src/hooks/` | Session lifecycle triggers |
| Lock File | Synchronization | `~/.claude/memory/.lock` | Concurrent access control |

