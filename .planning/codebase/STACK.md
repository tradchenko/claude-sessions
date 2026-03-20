# Technology Stack — claude-sessions

**Project**: `@tradchenko/claude-sessions` v2.2.3
**Description**: Multi-agent session manager — TUI picker, search, AI summaries, shared memory system for Claude, Codex, Qwen, Gemini
**Repository**: https://github.com/tradchenko/claude-sessions

---

## Languages and Runtime

- **Language**: TypeScript
- **Node.js Version**: ≥18.0.0 (from `package.json` engines)
- **Module System**: ES2020+ (type: "module" in package.json)
- **Compilation Target**: ES2022
- **Key Language Features Used**:
  - Async/await and Promises
  - JSON module resolution
  - Strict type checking (tsconfig strict: true)
  - Source maps for debugging (declaration and sourceMap enabled)

---

## Frameworks and Libraries

**Production Dependencies**: None explicitly listed in `package.json`

The project is **zero-dependency** — it uses only Node.js built-in modules.

**Key Built-in Modules Used**:
- `fs` — file system operations (readFile, writeFile, existsSync, mkdir, etc.)
- `path` — cross-platform path handling (join, dirname, basename)
- `readline` — line-by-line file reading and JSONL parsing
- `child_process` — spawning CLI commands (execSync, spawnSync, execFileSync)
- `os` — platform detection (homedir, platform)
- `node:crypto` (inferred) — potentially for session hashing/IDs

---

## Build Tools and Configuration

### TypeScript Configuration (`tsconfig.json`)
- **Target**: ES2022
- **Module**: Node16 (ES modules)
- **Module Resolution**: Node16
- **Output Directory**: `dist/`
- **Root Directory**: `src/`
- **Strict Mode**: Enabled (strict: true)
- **Features**:
  - JSON module resolution (resolveJsonModule: true)
  - Type declarations and source maps (declaration, declarationMap, sourceMap)
  - Consistent casing (forceConsistentCasingInFileNames)
  - Verbose module syntax (verbatimModuleSyntax)
  - Line endings: LF

### Build Process
```json
"scripts": {
  "build": "tsc",
  "test": "npm run build && node --test test/run.mjs",
  "prepublishOnly": "npm run build",
  "postinstall": "node ./dist/commands/install.js --auto 2>/dev/null || true"
}
```

---

## Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.9.3 | Type checking and transpilation |
| `@types/node` | ^25.5.0 | Node.js type definitions |

---

## Key Configuration Files

### `package.json` — `/Users/tradchenko/claude-sessions/package.json`
- Project metadata, entry points, scripts
- Binary aliases: `claude-sessions` and `cs` → `dist/cli.js`
- Files to distribute: `dist/`, `claude-commands/`, README, LICENSE

### `tsconfig.json` — `/Users/tradchenko/claude-sessions/tsconfig.json`
- TypeScript compiler options for strict, ES2022 output
- Includes: `src/**/*.ts`
- Excludes: `node_modules`, `dist`, `test`

### Post-Install Hook — `src/commands/install.ts`
- Auto-detection and hook setup for supported agents
- Handles platform-specific paths (macOS, Linux, Windows WSL)

---

## Project Structure

```
/Users/tradchenko/claude-sessions/
├── src/
│   ├── cli.ts                      # Main CLI entry point
│   ├── agents/                     # Multi-agent adapters
│   │   ├── types.ts               # AgentAdapter, AgentId interfaces
│   │   ├── registry.ts            # Agent detection & management
│   │   ├── claude.ts              # Claude Code adapter
│   │   ├── codex.ts               # Codex adapter
│   │   ├── qwen.ts                # Qwen Code adapter
│   │   ├── gemini.ts              # Gemini CLI adapter
│   │   └── companion.ts           # Companion desktop wrapper
│   ├── commands/                   # CLI commands
│   │   ├── picker.ts              # TUI session picker
│   │   ├── list.ts                # List sessions
│   │   ├── delete.ts              # Delete sessions
│   │   ├── restore.ts             # Restore from backup
│   │   ├── summarize.ts           # AI summaries
│   │   ├── memory-search.ts       # Search memory system
│   │   ├── memory-status.ts       # Memory stats
│   │   ├── enable-memory.ts       # Hook installation
│   │   ├── disable-memory.ts      # Hook uninstallation
│   │   ├── cleanup.ts             # Cache/temp cleanup
│   │   ├── install.ts             # Post-install setup
│   │   └── uninstall.ts           # Uninstall cleanup
│   ├── core/
│   │   ├── config.ts              # Config paths, platform detection
│   │   └── i18n.ts                # Internationalization (13 languages)
│   ├── memory/                     # Shared memory system
│   │   ├── types.ts               # Memory entry, category types
│   │   ├── index.ts               # Memory storage & indexing
│   │   ├── catalog.ts             # Hot memories caching
│   │   ├── snapshot.ts            # Session snapshots
│   │   ├── extract-l0.ts          # L0 extraction (raw facts)
│   │   ├── extract-l1.ts          # L1 extraction (patterns)
│   │   ├── extract-l0-multi.ts    # Multi-agent extraction
│   │   ├── lazy-extract.ts        # On-demand extraction
│   │   ├── dedup.ts               # Deduplication logic
│   │   ├── hotness.ts             # Memory scoring
│   │   ├── format.ts              # Formatting utilities
│   │   ├── migrate.ts             # Migration logic
│   │   ├── project.ts             # Project tracking
│   │   └── config.ts              # Memory config
│   ├── sessions/
│   │   ├── loader.ts              # Session loading
│   │   ├── cache.ts               # Session caching
│   │   └── lazy-extract.ts        # Lazy memory extraction
│   ├── hooks/                      # CLI hooks
│   │   ├── session-start.ts       # On session start
│   │   ├── save-summary.ts        # On session end
│   │   └── stop.ts                # Stop handler
│   ├── mcp/
│   │   └── server.ts              # MCP memory protocol server
│   └── test/                       # Tests
├── dist/                           # Compiled JavaScript (built output)
├── claude-commands/                # Claude command definitions
├── package.json                    # Project manifest
├── tsconfig.json                   # TypeScript config
└── README.md
```

---

## Development Workflow

1. **Edit**: Modify `.ts` files in `src/`
2. **Build**: `npm run build` → outputs to `dist/`
3. **Test**: `npm test` → runs `test/run.mjs`
4. **Package**: `npm publish` → runs `prepublishOnly` (builds first)
5. **Install**: Post-install hook auto-detects agents and sets up hooks

---

## Code Style & Conventions

- **Strict TypeScript**: All files use strict mode, type checking enabled
- **ES Modules**: Native import/export syntax (verbatimModuleSyntax)
- **File Organization**: Logical separation by concern (agents, commands, memory, core)
- **CLI Pattern**: Commands are modular, registered in CLI dispatcher
- **Cross-Platform**: Platform detection via `src/core/config.ts` for macOS/Linux/Windows

