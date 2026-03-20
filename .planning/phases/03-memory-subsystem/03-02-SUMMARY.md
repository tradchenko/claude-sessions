---
phase: 03-memory-subsystem
plan: "03-02"
subsystem: memory
tags: [L0, extraction, hotness, dedup, index, cleanup]

# Dependency graph
requires:
  - phase: 03-01
    provides: memory subsystem foundation, types, index structure
provides:
  - L0Data с полями agent, duration, commands, errors (все 5 парсеров)
  - Детерминированный timestamp из данных сессии (не Date.now())
  - Hotness tau=60 дней синхронизирован в hotness.ts и session-start.ts
  - Dedup FUZZY_THRESHOLD=0.5, fuzzy → merge вместо skip
  - Cleanup stale tmp файлов при readIndex (best-effort)
affects: [03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - best-effort extraction — новые поля опциональные, pipeline не ломается при их отсутствии
    - детерминированный timestamp — из данных сессии, fallback к mtime, не Date.now()
    - merge-over-skip — fuzzy дубликаты объединяются, а не пропускаются

key-files:
  created: []
  modified:
    - src/memory/types.ts
    - src/memory/extract-l0.ts
    - src/memory/extract-l0-multi.ts
    - src/memory/hotness.ts
    - src/memory/dedup.ts
    - src/memory/index.ts
    - src/hooks/session-start.ts

key-decisions:
  - "tau=60 вместо 30: воспоминания дольше остаются горячими, меньше false-prune"
  - "FUZZY_THRESHOLD 0.6→0.5: агрессивнее детектируем похожие воспоминания"
  - "fuzzy→merge: объединяем уникальный контент из обоих воспоминаний вместо skip"
  - "cleanupStaleTmpFiles в readIndex: best-effort, ошибки игнорируются"

patterns-established:
  - "агрессивный dedup с merge: fuzzy match теперь всегда делает merge через mergeContent"
  - "extractL0FromMessages принимает agentId как 3й параметр (опциональный)"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-05]

# Metrics
duration: 20min
completed: 2026-03-20
---

# Plan 03-02: L0 extraction, hotness, dedup и целостность индекса — Summary

**L0Data расширен полями agent/duration/commands/errors для всех 5 парсеров; hotness tau=60; dedup threshold=0.5 с merge стратегией; stale tmp cleanup при readIndex**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-03-20
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments

- Интерфейс L0Data расширен 4 полями (agent, duration, commands, errors) — все опциональные
- Все 5 парсеров (codex, codex-session, qwen, gemini, companion) проставляют `agent`, вычисляют `duration`; timestamp детерминирован
- DECAY_TAU_DAYS=60 синхронизирован в hotness.ts и session-start.ts; веса frequency/recency/relevance совпадают
- FUZZY_THRESHOLD снижен 0.6→0.5, fuzzy match теперь выполняет merge вместо возврата action='fuzzy'
- readIndex чистит *.tmp.* файлы старше 5 минут (best-effort, не ломает чтение)

## Task Commits

1. **03-02-01: расширить L0Data** — `2347c74` (feat)
2. **03-02-02: L0 парсеры — agent, duration, commands, errors** — `eed1d5f` (feat)
3. **03-02-03: hotness tau=60** — `c16c423` (feat)
4. **03-02-04: dedup threshold + merge** — `2bb2ea2` (feat)
5. **03-02-05: cleanup stale tmp** — `5ab70aa` (feat)

## Files Created/Modified

- `src/memory/types.ts` — L0Data: +agent, +duration, +commands, +errors
- `src/memory/extract-l0.ts` — extractL0FromMessages принимает agentId, извлекает commands/errors
- `src/memory/extract-l0-multi.ts` — 5 парсеров: agent поле, duration, детерминированный timestamp
- `src/memory/hotness.ts` — DECAY_TAU_DAYS: 30→60
- `src/memory/dedup.ts` — FUZZY_THRESHOLD: 0.6→0.5; fuzzy → merge
- `src/memory/index.ts` — cleanupStaleTmpFiles в readIndex
- `src/hooks/session-start.ts` — DECAY_TAU_DAYS: 30→60

## Decisions Made

- tau=60: воспоминания дольше остаются горячими, меньше преждевременного prune
- FUZZY_THRESHOLD=0.5 + merge: агрессивнее детектируем похожие, объединяем контент
- extractCommands извлекает первую строку bash-блоков и `$ cmd` паттерны (до 20 штук)
- Gemini парсер не вычисляет duration (git-based, нет JSONL)

## Deviations from Plan

None — план выполнен точно по спецификации.

## Issues Encountered

В коммит 03-02-04 случайно попали staged файлы i18n (src/core/i18n/*.ts) — они были в индексе до начала плана. Файлы корректны, сборка и тесты проходят.

## Next Phase Readiness

- L0 extraction готов к использованию в extract-l1 pipeline (03-03, 03-04)
- dedup merge стратегия требует тестов в 03-05
- 213 тестов зелёные, npm run build чистый

---
*Phase: 03-memory-subsystem*
*Completed: 2026-03-20*
