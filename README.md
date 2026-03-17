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

1. Copies `/sessions` and `/session-summarize` slash commands to `~/.claude/commands/`
2. Adds a Stop hook for auto-tracking session metadata
3. Scans existing sessions and shows statistics
4. Detects your terminal and gives compatibility tips

### Manual

```bash
git clone https://github.com/tradchenko/claude-sessions.git
cd claude-sessions
npm link
claude-sessions install
```

## How it works

Claude Code stores session data in `~/.claude/`:

| File                         | Content                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `history.jsonl`              | All session entries (user messages, timestamps, session IDs) |
| `projects/{path}/{id}.jsonl` | Full session content (messages, tool calls, results)         |
| `session-index.json`         | AI-generated summaries (created by this tool)                |

**Sessions survive reboots** — they are regular files on disk.

When `claude --resume` can't find a session (e.g., after cleanup), `claude-sessions` extracts the conversation from JSONL files and starts a new session with the restored context.

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
