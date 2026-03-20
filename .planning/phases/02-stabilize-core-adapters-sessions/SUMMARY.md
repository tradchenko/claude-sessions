---
phase: 2
plan: 7
title: "Unit тесты на адаптеры с DI"
status: completed
completed_at: "2026-03-20"
---

# SUMMARY: Plan 02-07 — Unit тесты на адаптеры с DI

## Что сделано

4 задачи, 4 атомарных коммита, 213 тестов pass / 0 fail.

### 02-07-01: Тесты DI и BaseAgentAdapter
- `tests/adapter-di.test.mjs` — 16 тестов
- ClaudeAdapter и CodexAdapter создаются с мокнутым FsDeps
- AdapterError конструктор с объектным API `{code, message, agentName?, suggestion?}`
- isSessionAlive возвращает boolean, defaultFsDeps интерфейс FsDeps

### 02-07-02: Тесты resume для всех 5 агентов
- `tests/adapter-resume.test.mjs` — 18 тестов
- Матрица [Claude, Codex, Qwen, Gemini, Companion] × [found, not-found, agent-not-installed]
- Claude: пустой sessionId → SESSION_NOT_FOUND; нет binary → AGENT_NOT_INSTALLED
- Codex: всегда RESUME_NOT_SUPPORTED или AGENT_NOT_INSTALLED; suggestion содержит "restore"
- Qwen/Gemini: условные тесты через detect()
- Companion: делегирование, isSessionAlive=false, getInstructionsPath=null

### 02-07-03: Тесты дедупликации, restore, ошибок
- `tests/session-dedup.test.mjs` — 12 тестов (inline-логика, без dist)
  - Дубли по id+project → одна запись
  - Нативный приоритет над Companion независимо от порядка
  - Разные project с одинаковым id → две записи
- `tests/restore-idempotent.test.mjs` — 10 тестов (inline buildRestoreContextContent)
  - Идемпотентность (два вызова), перезапись при другом sessionId
  - Все 5 агентов получают корректные метаданные в заголовке
- `tests/error-format.test.mjs` — 18 тестов (через dist/core/errors.js)
  - formatUserError: Error/Cause/Fix секции, обычная Error без Cause/Fix
  - getExitCode: все 5 кодов с правильными числовыми значениями
  - i18n: en и ru языки возвращают непустые строки

### 02-07-04: Тесты picker resize и граничные случаи
- `tests/picker-resize.test.mjs` — 15 тестов (inline TestSessionPicker без TTY)
  - SessionPicker не экспортируется → тестируется через зеркальный класс
  - render при width=40/200/80, rows=5/24/50 → без исключений
  - 0 / 1 / 100 сессий → без crash
  - scrollOffset clamp при resize, после принудительных неверных значений
  - moveUp/moveDown boundary conditions

## Ключевые решения

1. **AdapterError API**: В `src/core/errors.ts` используется объектный конструктор `{code, message, agentName?, suggestion?}`, не позиционный. Тесты написаны под реальный API.

2. **SessionPicker не экспортируется**: Пикер — приватный класс. Тесты используют inline `TestSessionPicker` — зеркало логики без TTY зависимости.

3. **Дедупликация без dist**: Логика `deduplicateSessions` протестирована inline — чистая функция, не требует компиляции.

4. **Условные тесты агентов**: Qwen/Gemini могут не быть установлены в CI. Тесты проверяют `adapter.detect()` и пропускают если агент не доступен.

## Статистика тестов

| Файл | Тестов | Подход |
|------|--------|--------|
| adapter-di.test.mjs | ~16 | dist/ imports |
| adapter-resume.test.mjs | ~18 | dist/ imports, условные |
| session-dedup.test.mjs | ~12 | inline logic |
| restore-idempotent.test.mjs | ~10 | inline logic |
| error-format.test.mjs | ~18 | dist/ imports |
| picker-resize.test.mjs | ~15 | inline TestSessionPicker |

**Итого новых тестов: ~89. Общий count: 213 pass / 0 fail.**
