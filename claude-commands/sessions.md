---
allowed-tools:
  - Bash
description: "Show session list, search by content"
argument-hint: "[--limit N] [--project name] [--search text] [--all]"
---

# Claude Code Session List

Run the command to display sessions:

```bash
claude-sessions list $ARGUMENTS
```

Show the result as is. If the user wants to resume a session:

1. Exit the current one (Ctrl+C)
2. Run `claude --resume <id>` in the terminal

Arguments:

- `--project name` — filter by project
- `--search text` — search by content
- `--limit N` — count (default 20)
- `--all` — all sessions
