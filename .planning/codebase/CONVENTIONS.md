# Code Conventions

## Code Style & Formatting

### Indentation & Whitespace
- **Indentation**: 3 spaces (configured in `.prettierrc` via `tabWidth: 3`)
- **Line endings**: LF (Unix-style)
- **Trailing whitespace**: Removed by Prettier
- **Quote style**: Single quotes (`'`) for all strings (Prettier: `singleQuote: true`)
- **Print width**: 180 characters max per line (`printWidth: 180`)

**Configuration File**: `prettier.config.js` or `.prettierrc`

### TypeScript Configuration
**File**: `/Users/tradchenko/claude-sessions/tsconfig.json`

- **Target**: ES2022
- **Module system**: ES modules (Node16)
- **Strict mode**: Enabled (`strict: true`)
- **Module resolution**: Node16
- **Output directory**: `dist/`
- **Source directory**: `src/`
- **Verbatim module syntax**: Enabled (for ESM/CJS interop clarity)
- **Declaration maps**: Generated for debugging
- **Source maps**: Generated for debugging

No explicit linting config (ESLint) was found — code quality relies on TypeScript strict mode and Prettier formatting.

---

## Naming Conventions

### File Naming
- **Source files**: PascalCase for classes/types, lowercase with hyphens for utilities
  - `src/agents/claude.ts` — agent adapter
  - `src/commands/delete.ts` — CLI command
  - `src/memory/extract-l0.ts` — utility modules
  - `src/core/config.ts` — core modules

- **Test files**: `.test.mjs` or `.spec.mjs` suffix (Node.js native ESM test format)
  - `test/memory.test.mjs`
  - `test/agents.test.mjs`
  - `test/run.mjs` — main test runner

- **Package structure**:
  - `src/` — source code (TypeScript)
  - `dist/` — compiled output (JavaScript + .d.ts declarations)
  - `test/` — test files (ESM format)
  - `claude-commands/` — installable slash commands for Claude

### Variable & Function Naming
- **Functions**: camelCase
  - `extractFilePaths()`, `extractL0FromMessages()`, `isValidSessionId()`
  - `loadSessions()`, `readSessionCache()`

- **Constants**: UPPER_SNAKE_CASE for exported constants
  - `CLAUDE_DIR`, `HISTORY_FILE`, `MEMORY_DIR`, `SESSION_INDEX`
  - `MEMORY_CATEGORIES`, `MAX_SUMMARY_LEN`

- **Private functions**: camelCase with leading underscore optional (TypeScript `private` preferred)
  - `resolveClaudeDir()` (internal but exported)
  - `isValidSessionId()` — internal validation

- **Classes**: PascalCase
  - `SessionPicker` — TUI picker class in `/Users/tradchenko/claude-sessions/src/commands/picker.ts`
  - `MemoryEntry` — interface in `/Users/tradchenko/claude-sessions/src/memory/types.ts`

- **Type/Interface names**: PascalCase
  - `AgentAdapter`, `Session`, `L0Data`, `MemoryEntry`, `ChatMessage`
  - Type unions use descriptive names: `AgentId = 'claude' | 'codex' | 'qwen' | 'gemini' | 'companion'`

- **Event handlers**: `handle` prefix
  - `handleClick()`, `handleKeyDown()`, `handleInput()` (from global CLAUDE.md rules)
  - Applied in interactive components like the TUI picker

- **Regex constants**: `_RE` or `_REGEX` suffix
  - `FILE_PATH_RE` — matches file paths in text
  - Pattern defined at module top for reusability

### ANSI Escape Sequences
Constants for terminal colors/styles follow uppercase naming:
```typescript
const HIDE_CURSOR = `${ESC}[?25l`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const AGENT_COLORS: Record<string, string> = { claude: '...', ... };
```

---

## Common Patterns

### Session & Agent Architecture
The codebase uses **multi-agent support** — manages sessions from Claude, Codex, Qwen, Gemini, and Companion.

**Agent Adapter Pattern**:
- Located in `/Users/tradchenko/claude-sessions/src/agents/`
- Each agent (`claude.ts`, `codex.ts`, `qwen.ts`, `gemini.ts`, `companion.ts`) implements `AgentAdapter` interface
- Unified registry in `/Users/tradchenko/claude-sessions/src/agents/registry.ts` for agent detection and session loading
- **Key methods**: `detect()`, `loadSessions()`, `getResumeCommand()`, `isSessionAlive()`

### Session Loading & Caching
- **Main loader**: `/Users/tradchenko/claude-sessions/src/sessions/loader.ts`
- **Caching layer**: `/Users/tradchenko/claude-sessions/src/sessions/cache.ts` for performance
  - Uses `readSessionCache()` / `writeSessionCache()` functions
  - Cache invalidation based on file modification times

- **Lazy extraction**: `/Users/tradchenko/claude-sessions/src/sessions/lazy-extract.ts` — on-demand session data parsing

### Memory Subsystem (L0 & L1 Extraction)
The system uses **two-level extraction** for session memory:

- **L0 (Level 0)** — Quick metadata extraction
  - File: `/Users/tradchenko/claude-sessions/src/memory/extract-l0.ts`
  - Extracts: summary, file paths, message count, topics
  - Function: `extractL0FromMessages()`, `extractL0FromJSONL()`
  - Uses regex `FILE_PATH_RE` to find file references

- **L1 (Level 1)** — Deep semantic extraction (LLM-powered)
  - File: `/Users/tradchenko/claude-sessions/src/memory/extract-l1.ts`
  - Candidates: `profile`, `preferences`, `entities`, `events`, `cases`, `patterns`
  - Deduplication in `/Users/tradchenko/claude-sessions/src/memory/dedup.ts`

### Configuration & Path Resolution
- **Core config**: `/Users/tradchenko/claude-sessions/src/core/config.ts`
- Cross-platform path handling:
  - macOS/Linux: `~/.claude/`
  - Windows: `%APPDATA%/claude/` fallback, then `~/.claude/`
  - XDG fallback: `~/.config/claude/` on Linux
- **Key paths**:
  ```typescript
  CLAUDE_DIR → session home (~/.claude)
  HISTORY_FILE → history.jsonl (JSONL stream of session events)
  PROJECTS_DIR → project-specific folders
  SESSION_INDEX → session-index.json (metadata index)
  MEMORY_DIR → session-memory/ (extracted knowledge)
  ```

### Internationalization (i18n)
- File: `/Users/tradchenko/claude-sessions/src/core/i18n.ts`
- **Function**: `t(key, ...args)` for translations
  - Returns English by default, respects system locale
  - Supports parameterized translations: `t('daysAgo', 5)` → "5 days ago"
  - Falls back to key name for missing translations
- Usage pattern: `console.error('❌ ' + t('claudeDirNotFound'));`

### CLI Command Structure
- **Router**: `/Users/tradchenko/claude-sessions/src/cli.ts`
- Commands in `/Users/tradchenko/claude-sessions/src/commands/`:
  - `picker.ts` — Interactive TUI session selector
  - `list.ts` — Text listing with filters
  - `delete.ts` — Session deletion
  - `restore.ts` — Session restoration
  - `memory-search.ts` — Memory subsystem search
  - `install.ts`, `uninstall.ts` — Hook/command installation

Each command exports a default async function accepting command-line arguments.

### JSONL Format
Session history stored as line-delimited JSON:
```json
{ "type": "user", "message": { "content": "..." } }
{ "type": "assistant", "message": { "content": "..." } }
```
Parsing handles both string content and `ContentBlock[]` (multi-modal).

---

## Error Handling

### Validation Pattern
Early returns with user-facing error messages:
```typescript
function isValidSessionId(id: string): boolean {
   return /^[a-f0-9-]+$/i.test(id) && id.length >= 8;
}

export default async function deleteSession(sessionId: string): Promise<void> {
   if (!isValidSessionId(sessionId)) {
      console.error(`\n${t('invalidId', sessionId)}`);
      console.error(`${t('expectedUUID')}\n`);
      process.exit(1);
   }
   // ... proceed with deletion
}
```

### Safe JSON Parsing
Fallback gracefully on corrupted JSON:
```typescript
try {
   return JSON.parse(line).sessionId !== sessionId;
} catch {
   return true;  // Skip malformed lines, don't crash
}
```
Pattern used in `/Users/tradchenko/claude-sessions/src/commands/delete.ts`, memory extraction, and test setup.

### Error Logging
- Terminal errors use emoji prefixes: `❌` (error), `✅` (success), `⏭` (skipped)
- Errors translated via `t()` function for localization
- No uncaught exceptions — all errors handled gracefully with user messaging

### Graceful Fallbacks
- Missing `.claude` directory → creates with defaults
- Corrupted `session-index.json` → ignores and continues
- Empty `history.jsonl` → displays no sessions (no crash)
- Missing session JSONL → logs warning, marks as orphaned

---

## Import/Export Patterns

### ES Modules (ESM)
All code uses ES module syntax (configured in `package.json`: `"type": "module"`):

```typescript
import { join, dirname } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import type { Session } from '../sessions/loader.js';
import { loadSessions } from '../sessions/loader.js';
```

**Rules**:
- Use `.js` extension in import paths (even for TS files) — required for ESM compatibility
- Use `import type {}` for type-only imports
- Default exports for CLI commands: `export default async function()`
- Named exports for utilities and types

### Type Exports
```typescript
export type AgentId = 'claude' | 'codex' | 'qwen' | 'gemini' | 'companion';
export type MemoryCategory = 'profile' | 'preferences' | 'entities' | 'events' | 'cases' | 'patterns';

export interface AgentAdapter { /* ... */ }
export interface Session { /* ... */ }
```

### Module Path Conventions
- Relative paths with explicit directory: `import { loadSessions } from '../sessions/loader.js'`
- Type imports from types modules: `import type { ChatMessage, L0Data } from './types.js'`
- Node.js built-in modules first: `import { execSync } from 'child_process'`

---

## Comment Style

### Block Comments (JSDoc for public APIs)
```typescript
/**
 * Delete session with validation and safe JSON parsing
 */
export default async function deleteSession(sessionId: string): Promise<void>
```

Located directly above function/class definition.

### Inline Comments
- Explain non-obvious logic
- Russian and English both used (codebase is polyglot)
- Minimal — prefer self-documenting code

```typescript
// Regex for finding file paths in text (e.g. src/foo.mjs, ./bar/baz.ts, package.json)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;

// Skip malformed lines
```

### Section Comments
Functions with multiple steps use section comments:
```typescript
// Remove from history.jsonl (JSON parsing for safety)
if (existsSync(HISTORY_FILE)) { /* ... */ }

// Remove from session-index.json
if (existsSync(SESSION_INDEX)) { /* ... */ }
```

### Russian in Comments
The codebase includes Russian comments and translation keys (author's native language):
- `// Удаление JSONL-файла сессии` (Session JSONL file deletion)
- `// Включение/выключение mouse reporting` (Mouse reporting enable/disable)
- Test file comments: Cyrillic descriptions in Russian

**Convention**: Comments follow source code language context; English preferred for English codebases, Russian in Russian-annotated sections.

---

## Immutable / Functional Style

**From global CLAUDE.md**: "Functional/immutable style preferred"

### Array Operations
```typescript
// Good — functional, no mutations
const files = new Set<string>();
for (const msg of messages) { /* ... */ }
return [...files].slice(0, 20);

// Filter pattern
.filter((line) => line.trim() && JSON.parse(line).sessionId !== sessionId)
.join('\n');

// Map pattern
const resumeCount = (output.match(/claude --resume/g) || []).length;
```

### Object Handling
```typescript
// Good — spread creates new object
const cfg = { ...defaults, ...userConfig };

// Good — destructuring avoids mutations
const { extractionModel, maxRetries } = config;

// Good — avoid mutation, create new index
const index = JSON.parse(...);
delete index[sessionId];  // ← acceptable for cleanup, but followed by write
writeFileSync(SESSION_INDEX, JSON.stringify(index));
```

### Set Usage for Deduplication
```typescript
const matches = new Set<string>();
// ... populate ...
return [...matches];  // Convert back to array
```

---

## Summary of Key Tools & Standards

| Tool/Standard | Config/Location | Details |
|---|---|---|
| **TypeScript** | `/Users/tradchenko/claude-sessions/tsconfig.json` | ES2022 target, strict mode, Node16 resolution |
| **Prettier** | (builtin, 3-space tabs, single quotes) | Auto-formatting on build |
| **ESM Modules** | `package.json` type: "module" | All imports use `.js` extension |
| **Testing** | Node.js built-in `node:test` | No external test framework deps |
| **i18n** | `/Users/tradchenko/claude-sessions/src/core/i18n.ts` | `t()` function for translations |
| **Path Resolution** | `/Users/tradchenko/claude-sessions/src/core/config.ts` | Cross-platform, XDG-aware |
| **Memory Extraction** | `/Users/tradchenko/claude-sessions/src/memory/` | L0 (quick) + L1 (LLM-powered) + dedup |
| **Agent Adapters** | `/Users/tradchenko/claude-sessions/src/agents/` | Registry pattern for multi-agent support |

