---
allowed-tools:
  - Bash
description: "Сгенерировать AI-резюме для последних сессий"
argument-hint: "[--limit N] [--session ID]"
---

# Генерация AI-резюме сессий

Запусти команду:

```bash
claude-sessions summarize $ARGUMENTS
```

Скрипт выведет данные сессий без описания. Для каждой сессии:

1. Прочитай сообщения пользователя
2. Сгенерируй краткое резюме на русском (до 70 символов)
3. Сохрани через: `node ~/.claude/scripts/save-summary.mjs --session ID --summary "текст"`
