# claude-sessions

Interactive session manager for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Browse, search, resume, and manage your Claude Code sessions from a TUI picker or slash commands.

<p align="center">
  <img src="screenshot.png" alt="claude-sessions TUI" width="100%" />
</p>

## Features

- **Interactive TUI picker** — arrow keys, instant search, works in Warp/iTerm2/Terminal.app/VS Code
- **Full-text search** — find sessions by content, project, or date
- **AI summaries** — auto-generate meaningful session descriptions via Claude
- **Session restore** — recover sessions that `--resume` can't find from JSONL files
- **Slash commands** — `/sessions` and `/session-summarize` inside Claude Code
- **i18n** — auto-detects system language (English, Russian, Spanish, French, German, Chinese, Japanese, Korean, Portuguese, Turkish)
- **Cross-platform** — macOS, Linux, Windows (WSL)
- **Zero dependencies** — pure Node.js, no external packages

## Quick start

```bash
npm install -g claude-sessions
claude-sessions install
```

Or try instantly:

```bash
npx claude-sessions
```

## Usage

### Terminal (TUI picker)

```bash
claude-sessions          # interactive picker
cs                       # short alias
cs 3                     # quick-launch session #3
cs --search miniapp      # pre-filter by content
cs --project client-web  # pre-filter by project
```

#### TUI keybindings

| Key          | Action                  |
| ------------ | ----------------------- |
| ↑↓           | Navigate (wraps around) |
| Type text    | Instant search          |
| Enter        | Open session            |
| Ctrl-D       | Delete session          |
| Ctrl-A       | AI summarize sessions   |
| Ctrl-R       | Refresh list            |
| Page Up/Down | Fast scroll             |
| Esc          | Exit                    |

### Terminal (text commands)

```bash
claude-sessions list                    # text list (20 recent)
claude-sessions list --limit 50         # more sessions
claude-sessions list --all              # all sessions
claude-sessions search "telegram"       # search by content
claude-sessions summarize               # AI summaries for undescribed sessions
claude-sessions delete <session-id>     # delete a session
claude-sessions restore <session-id>    # restore from JSONL when --resume fails
```

### Inside Claude Code

```
/sessions                    # list sessions
/sessions --search miniapp   # search
/sessions --project client   # filter by project
/session-summarize           # generate AI summaries
```

## Install

### npm (recommended)

```bash
npm install -g claude-sessions
claude-sessions install
```

The `install` command:

1. Detects your terminal (Warp, iTerm2, VS Code, etc.) and gives compatibility tips
2. Copies `/sessions` and `/session-summarize` slash commands to `~/.claude/commands/`
3. Adds a Stop hook for auto-tracking session metadata
4. Scans your existing sessions and shows statistics (count, projects, date range)
5. Reports how many sessions lack AI summaries

**Safe install** — never overwrites existing files or settings. Existing slash commands, hooks, and configurations are preserved.

### Manual

```bash
git clone https://github.com/tradchenko/claude-sessions.git
cd claude-sessions
npm link
claude-sessions install
```

## How it works

### Architecture

```
claude-sessions
├── bin/cli.mjs              # CLI entry point (routes commands)
├── src/
│   ├── picker.mjs           # Interactive TUI (raw terminal I/O)
│   ├── sessions.mjs         # Session loading from history.jsonl
│   ├── list.mjs             # Text list output
│   ├── delete.mjs           # Safe deletion (JSON parsing, ID validation)
│   ├── restore.mjs          # Session recovery from JSONL
│   ├── summarize.mjs        # AI summary generation via Claude CLI
│   ├── install.mjs          # Slash commands & hooks installer
│   ├── uninstall.mjs        # Clean removal
│   ├── config.mjs           # Cross-platform path resolution
│   └── i18n.mjs             # Internationalization
├── claude-commands/          # Slash command templates
└── test/                     # Unit tests (node:test)
```

### Data sources

Claude Code stores session data in `~/.claude/`:

| File                         | Content                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `history.jsonl`              | All session entries (user messages, timestamps, session IDs) |
| `projects/{path}/{id}.jsonl` | Full session content (messages, tool calls, results)         |
| `session-index.json`         | AI-generated summaries (created by this tool)                |

**Sessions survive reboots** — they are regular files on disk.

### Session restore

When `claude --resume` can't find a session (e.g., after cleanup or Claude Code update), `claude-sessions` automatically:

1. Searches for the session JSONL file in `~/.claude/projects/`
2. Extracts the conversation (up to 50 messages)
3. Cleans up system tags and metadata
4. Starts a new Claude session with the restored context as a markdown prompt

### Security

- **Session ID validation** — only UUID-format IDs accepted, prevents path traversal
- **Safe deletion** — JSON parsing (not string matching) to avoid deleting unrelated data
- **No shell injection** — all external commands use `execFileSync` (no shell interpolation)
- **Install safety** — never overwrites existing files, only appends hooks

## Internationalization (i18n)

The tool auto-detects your system language from `LC_ALL`, `LANG`, or `LANGUAGE` environment variables. On macOS, it also checks `AppleLocale`.

Supported languages: English (default), Russian, Spanish, French, German, Chinese, Japanese, Korean, Portuguese, Turkish.

Override the language:

```bash
CLAUDE_SESSIONS_LANG=en claude-sessions    # force English
CLAUDE_SESSIONS_LANG=ru claude-sessions    # force Russian
```

AI-generated session summaries also respect the detected language.

## Testing

```bash
npm test                     # run all 23 tests
node --test test/run.mjs     # same thing
```

Tests use Node.js built-in test runner (`node:test`) — no test dependencies required. Tests create isolated mock `~/.claude` directories and clean up after themselves.

## Uninstall

```bash
claude-sessions uninstall    # remove slash commands and hooks
npm uninstall -g claude-sessions
```

Your `session-index.json` (AI summaries) is preserved.

## Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- At least one Claude Code session in history

## License

MIT
