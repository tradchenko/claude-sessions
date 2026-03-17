---
allowed-tools:
  - Bash
description: "Generate AI summaries for recent sessions"
argument-hint: "[--limit N] [--session ID]"
---

# AI Session Summary Generation

Run the command:

```bash
claude-sessions summarize $ARGUMENTS
```

The script will output data for sessions without descriptions. For each session:

1. Read the user messages
2. Generate a short summary in English (up to 70 characters)
3. Save via: `node ~/.claude/scripts/save-summary.mjs --session ID --summary "text"`
