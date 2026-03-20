---
plan: "03-04"
title: "extract-memory CLI команда end-to-end"
status: completed
completed: "2026-03-21"
commits:
  - 0b3775c
  - 78a92bd
tests: 213 pass
---

# Summary: Plan 03-04

## Что сделано

### 03-04-01: src/commands/extract-memory.ts
- Создан полный pipeline: loadSessions → L0 extraction → writeIndex → spawnL1
- Поддержка аргументов: `--agent`, `--session`, `--all`, без флагов (pending only)
- Прогресс `[N/M] Обработка сессии <id>...` + итоговая статистика
- Exit code 0 при частичном успехе, 1 при полном провале
- Атомарная запись index после каждой сессии через writeIndex

### 03-04-02: Интеграция в routing (cli.ts)
- Inline-реализация (46 строк) заменена на `import('./commands/extract-memory.js')`
- Удалён неиспользуемый импорт `spawnSync`
- Команда `--help` выводит usage через `printHelp()`

### 03-04-03: Smoke test
- `npm run build` — компиляция без ошибок (TypeScript strict)
- `npm test` — 213 pass, 0 fail

## Ключевые решения
- `resolveSessionIds()` инкапсулирует всю логику выбора сессий (4 режима)
- L0 extraction через `extractL0ForAgent` из `memory/extract-l0-multi.ts`
- Сессии без JSONL-файла пропускаются gracefully (l0Failed++)
- `spawnL1` использует тот же паттерн что и предыдущая inline-реализация

## Файлы
- Создан: `src/commands/extract-memory.ts`
- Изменён: `src/cli.ts` (routing)
