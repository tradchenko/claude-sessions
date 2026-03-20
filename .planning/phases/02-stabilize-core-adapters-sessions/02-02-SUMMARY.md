---
phase: 02-stabilize-core-adapters-sessions
plan: 02
subsystem: errors
tags: [exit-codes, i18n, error-handling, cli, debug-flag]

# Dependency graph
requires:
  - phase: 02-01
    provides: AdapterError class и AdapterErrorCode типы
provides:
  - Модуль src/core/errors.ts с formatUserError, handleFatalError, getExitCode
  - i18n ключи для структурированных ошибок (11 языков)
  - --debug флаг в CLI с показом stack traces
  - try/catch обёртка всего CLI с handleFatalError
affects: [все команды CLI, адаптеры бросающие AdapterError]

# Tech tracking
tech-stack:
  added: []
  patterns: [структурированные ошибки с трёхчастным форматом Error/Cause/Fix, exit codes по типу ошибки]

key-files:
  created:
    - src/core/errors.ts
  modified:
    - src/core/i18n.ts
    - src/cli.ts

key-decisions:
  - "i18n ключи добавлены во все 11 языков: en + ru полностью, остальные через en fallback"
  - "filteredArgs используется вместо args, чтобы --debug не попадал в команды"
  - "try/catch обёртывает весь switch-блок, включая quick launch по номеру"

patterns-established:
  - "Все fatal ошибки → handleFatalError(err, debug): never"
  - "Usage ошибки (нет аргумента) → process.stderr.write + process.exit(1)"
  - "AdapterError: exit code определяется по code, не hardcoded 1"

requirements-completed: [ERR-01, ERR-02, ERR-03, ERR-04]

# Metrics
duration: 25min
completed: 2026-03-20
---

# Plan 02-02: Система структурированных ошибок и exit codes — Summary

**Единая система ошибок CLI: formatUserError с форматом Error/Cause/Fix, exit codes 0–4, --debug флаг для stack traces, i18n на 11 языков**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-20
- **Completed:** 2026-03-20
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Модуль `src/core/errors.ts` с `formatUserError`, `handleFatalError`, `getExitCode`, константами exit codes (0–4)
- i18n ключи `errorWhat/Cause/Fix`, `errSessionNotFound`, `errAgentNotInstalled`, `errCorruptData`, `errResumeNotSupported`, `errSuggestion*`, `noSessionsHint` для всех 11 языков
- CLI обёрнут в try/catch с `handleFatalError(err, debug)`, добавлен `--debug` флаг, stack traces скрыты без флага

## Task Commits

1. **Task 01: Создать модуль форматирования ошибок и exit codes** — `a352bd3` (feat)
2. **Task 02: Добавить i18n ключи для структурированных ошибок** — `6c237d2` (feat)
3. **Task 03: Интегрировать систему ошибок в CLI entry point** — `8638d2f` (feat)

## Files Created/Modified
- `src/core/errors.ts` — модуль с AdapterError, formatUserError, handleFatalError, getExitCode, exit codes
- `src/core/i18n.ts` — 11 новых ключей для структурированных ошибок, все 11 языков
- `src/cli.ts` — --debug флаг, filteredArgs, try/catch → handleFatalError

## Decisions Made
- Задача 02-02-01 была уже выполнена в предыдущей сессии (коммит `a352bd3`)
- Задача 02-02-02 также уже была выполнена частично — ключи в i18n.ts существовали, но не были закоммичены
- `filteredArgs = args.filter(a => a !== '--debug')` — чистый способ изолировать debug флаг

## Deviations from Plan
None — план выполнен точно как описано.

## Issues Encountered
None.

## Next Phase Readiness
- Система ошибок готова, адаптеры могут бросать `AdapterError` с кодами
- Следующий план 02-03: сессионные адаптеры (resume/restore через AdapterError)

---
*Phase: 02-stabilize-core-adapters-sessions*
*Completed: 2026-03-20*
