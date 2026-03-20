---
plan: 02-03
title: "Resume для всех 5 агентов"
status: completed
completed_at: "2026-03-20"
commits: 4
tests_before: 88
tests_after: 104
tests_added: 16
---

# Summary: Plan 02-03 — Resume для всех 5 агентов

## Что сделано

### 02-03-01: Claude и Codex
- **Claude** `getResumeCommand`: бросает `SESSION_NOT_FOUND` если sessionId пустой, `AGENT_NOT_INSTALLED` если binary не найден. Импорт AdapterError из `core/errors.js`.
- **Codex** `getResumeCommand`: бросает `AGENT_NOT_INSTALLED` если binary не найден, `RESUME_NOT_SUPPORTED` (с suggestion "Use 'restore'") — нет нативной поддержки --resume, history.jsonl не содержит projectPath.
- **list.ts**: fix `isInstalled()` → `detect()` (метод не существовал в интерфейсе).
- Тесты: `tests/resume-claude-codex.test.mjs` (6 тестов).

### 02-03-02: Qwen и Gemini
- **Qwen** `getResumeCommand`: бросает `AGENT_NOT_INSTALLED` если binary не найден, иначе возвращает `[bin, '--resume', sessionId]` — Qwen поддерживает --resume нативно.
- **Gemini** `getResumeCommand`: бросает `AGENT_NOT_INSTALLED` если binary не найден, `SESSION_NOT_FOUND` если директория `~/.gemini/history/{project}` не существует, иначе возвращает `[bin]` (открыть в текущей директории).
- Тесты: `tests/resume-qwen-gemini.test.mjs` (7 тестов).

### 02-03-03: Companion
- **Companion** `getResumeCommand`: делегирует первому установленному реальному агенту (Claude → Codex → Qwen → Gemini). Пробрасывает AdapterError делегата. Если ни один агент не установлен → `AGENT_NOT_INSTALLED`.
- Импорты прямые (не через registry) — избегаем circular dependency.
- Тесты: `tests/resume-companion.test.mjs` (3 теста).

### 02-03-04: Обработка ошибок в picker и list
- **picker quickPick**: `getResumeCommand` обёрнут в try/catch — `AdapterError` форматируется через `formatUserError`, exit code берётся из `getExitCode` (SESSION_NOT_FOUND→2, AGENT_NOT_INSTALLED→3, RESUME_NOT_SUPPORTED→1).
- **picker Enter**: уже содержал правильную обработку — AdapterError показывается в status bar, picker продолжает работу.
- **list.ts**: `getResumeCommand` в try/catch — ошибки игнорируются (команда нужна только для отображения).

## Must-haves статус

- [x] Claude resume работает (регрессия не сломана)
- [x] Codex resume: показывает RESUME_NOT_SUPPORTED с suggestion "restore"
- [x] Qwen resume: возвращает [bin, --resume, sessionId] или AGENT_NOT_INSTALLED
- [x] Gemini resume: возвращает [bin] или SESSION_NOT_FOUND/AGENT_NOT_INSTALLED
- [x] Companion resume: делегирует реальному адаптеру, fallback Claude
- [x] "Session not found" → структурированная ошибка + exit code 2
- [x] "Agent not installed" → структурированная ошибка + exit code 3
- [x] Ошибка в picker → сообщение в status bar, picker не закрывается

## Решения

- `AdapterError` canonical location — `src/core/errors.ts` (не `src/agents/errors.ts`), т.к. picker и cli.ts уже импортируют оттуда.
- Companion использует прямые импорты адаптеров вместо registry (избегаем circular dependency: registry→companion→registry).
- Codex history.jsonl не хранит projectPath/cwd — поэтому projectPath fallback невозможен, всегда RESUME_NOT_SUPPORTED.
- Gemini sessionId = "gemini-{projectName}" — resume открывает gemini без аргументов (пользователь в нужной директории).
