---
phase: 04-migration-final-integration
plan: "04"
subsystem: testing
tags: [integration-tests, cli, list, resume, restore, install, extract-memory, migration, e2e]

requires:
  - phase: 04-01
    provides: runMigrations, backupFile, readMeta/writeMeta
  - phase: 04-02
    provides: lazy migration в CLI, i18n ключи
  - phase: 04-03
    provides: unit тесты миграции, migration-fixtures
  - phase: 03-05
    provides: extractL0ForAgent, readIndex/writeIndex, memory pipeline

provides:
  - tests/integration/ директория с 5 тест-файлами (57 тестов)
  - tests/integration/helpers.mjs — общие утилиты createTestEnv/cleanup/fixtures
  - E2E тест миграции: старый формат → runMigrations → list работает
  - fix npm test glob: кавычки для корректного ** подхвата (319+57=376 тестов)

affects: [CI, npm test, coverage]

tech-stack:
  added: []
  patterns:
    - "Интеграционные тесты тестируют бизнес-логику напрямую (не через child_process)"
    - "Каждый тест: before() создаёт temp dir, after() cleanup — полная изоляция"
    - "Импорт из dist/ — стандартный паттерн проекта для всех тест-файлов"
    - "Mock адаптеры через inline объекты — без сторонних mock-библиотек"

key-files:
  created:
    - tests/integration/helpers.mjs
    - tests/integration/cli-list.test.mjs
    - tests/integration/cli-resume.test.mjs
    - tests/integration/cli-restore.test.mjs
    - tests/integration/cli-install.test.mjs
    - tests/integration/cli-extract-memory.test.mjs
  modified:
    - package.json (npm test glob fix)

key-decisions:
  - "Тестируем бизнес-логику напрямую (parseJsonl, groupSessions, formatRestoreContext) а не через полный CLI spawn — адаптеры читают глобальные пути из config модуля без DI"
  - "Resume тесты используют inline mock адаптеры (makeWorkingAdapter/makeNotInstalledAdapter) вместо моков dist модулей"
  - "npm test glob исправлен кавычками: 'tests/**/*.test.mjs' — zsh разворачивал без кавычек до ** обхода"
  - "extractL0ForAgent тестируется через raw JSONL lines — формат codex/qwen/gemini из существующей документации"

requirements-completed: [TEST-05]

duration: 35min
completed: 2026-03-21
---

# Phase 4 Plan 04: Интеграционные тесты CLI-команд Summary

**57 интеграционных тестов для 5 CLI-команд (list/resume/restore/install/extract-memory) + E2E миграция + fix npm test glob → 376 тестов итого**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-21T01:00:00Z
- **Completed:** 2026-03-21T01:35:00Z
- **Tasks:** 6
- **Files modified:** 7 (6 новых + package.json)

## Accomplishments

- 5 интеграционных тест-файлов по одному на команду: list (11), resume (9), restore (14), install (11), extract-memory (12)
- E2E тест миграции: старый формат fixtures → runMigrations() → meta.json v1 → list работает с мигрированными данными
- Обнаружен и исправлён баг: zsh glob без кавычек не подхватывал tests/integration/ (57 тестов вместо 376)
- helpers.mjs с общими утилитами: createTestEnv, cleanupTestEnv, createSessionFixture, createSettingsFixture, createMemoryIndexFixture, createMetaFixture

## Task Commits

1. **Task 04-04-01: helpers.mjs** — `13bd0f7` (feat)
2. **Task 04-04-02: cli-list** — `66d22b0` (feat)
3. **Task 04-04-03: cli-resume** — `b1e8cbb` (feat)
4. **Task 04-04-04: cli-restore** — `310e285` (feat)
5. **Task 04-04-05: cli-install + E2E** — `1fa080a` (feat)
6. **Task 04-04-06: cli-extract-memory** — `0ef481f` (feat)
7. **[Rule 1 - Bug] fix npm test glob** — `776fa90` (fix)

## Files Created/Modified

- `tests/integration/helpers.mjs` — createTestEnv, cleanupTestEnv, createSessionFixture, createSettingsFixture
- `tests/integration/cli-list.test.mjs` — парсинг history.jsonl, дедупликация, фильтр agent, повреждённые данные
- `tests/integration/cli-resume.test.mjs` — dispatch логика, AdapterError SESSION_NOT_FOUND/AGENT_NOT_INSTALLED/RESUME_NOT_SUPPORTED
- `tests/integration/cli-restore.test.mjs` — formatRestoreContext, isSameSessionContext, atomicWrite идемпотентность
- `tests/integration/cli-install.test.mjs` — migrateHooks, E2E миграция v0→v1, runMigrations идемпотентность
- `tests/integration/cli-extract-memory.test.mjs` — extractL0ForAgent (codex/qwen), readIndex/writeIndex pipeline, E2E
- `package.json` — npm test glob исправлен: `'tests/**/*.test.mjs'`

## Decisions Made

- Тестируем бизнес-логику напрямую, а не через CLI spawn: адаптеры читают `CLAUDE_DIR` из глобального config модуля без DI, что делает override HOME в тестах ненадёжным. Решение: тестировать функции (parseJsonl, formatRestoreContext, extractL0ForAgent) напрямую.
- Mock адаптеры через inline объекты (`makeWorkingAdapter`, `makeNotInstalledAdapter`) — без jest/sinon, в духе проекта.
- extractL0ForAgent тестируется через raw lines в форматах codex и qwen — покрывает основные агенты.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Исправлен npm test glob — zsh разворачивал *** без кавычек**
- **Found during:** Verification после Task 04-04-06
- **Issue:** `npm test` запускал только `tests/*.test.mjs` (57 тестов) вместо `tests/**/*.test.mjs` (376 тестов) — zsh разворачивал glob в shell до передачи в node
- **Fix:** Обернул glob в одинарные кавычки: `node --test 'tests/**/*.test.mjs'`
- **Files modified:** package.json
- **Verification:** `npm test` → 376 tests, 0 fail
- **Committed in:** `776fa90`

---

**Total deviations:** 1 auto-fixed (Rule 1 — Bug)
**Impact on plan:** Критичный баг — без исправления integration тесты не запускались через npm test. Никакого scope creep.

## Issues Encountered

None — все задачи выполнены по плану.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 завершена полностью (4/4 планов)
- 376 тестов зелёные: 319 unit + 57 integration
- Все 5 CLI-команд покрыты интеграционными тестами
- E2E миграция верифицирована
- Готово к финальному milestone review

## Self-Check: PASSED

- [x] `tests/integration/helpers.mjs` существует
- [x] `tests/integration/cli-list.test.mjs` существует — 11 тестов
- [x] `tests/integration/cli-resume.test.mjs` существует — 9 тестов
- [x] `tests/integration/cli-restore.test.mjs` существует — 14 тестов
- [x] `tests/integration/cli-install.test.mjs` существует — 11 тестов
- [x] `tests/integration/cli-extract-memory.test.mjs` существует — 12 тестов
- [x] `npm test` → 376 tests, 0 fail
- [x] git log содержит 7 коммитов с тегом `04-04`

---
*Phase: 04-migration-final-integration*
*Completed: 2026-03-21*
