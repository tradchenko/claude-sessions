---
phase: 02-stabilize-core-adapters-sessions
plan: 01
subsystem: agents
tags: [dependency-injection, class-refactoring, typescript, adapters]

# Dependency graph
requires:
  - phase: 01-audit-test-infrastructure
    provides: тест-инфраструктура, fixture-файлы, session identity тесты
provides:
  - BaseAgentAdapter абстрактный класс с DI (FsDeps)
  - AdapterError класс с кодами ошибок и статическими фабриками
  - Все 5 адаптеров как классы с экспортом singleton + class
  - defaultFsDeps() для production, инжекция для тестов
affects: [02-02, 02-03, 02-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [dependency-injection, abstract-class, singleton-plus-class-export]

key-files:
  created:
    - src/agents/errors.ts
    - src/agents/base-adapter.ts
  modified:
    - src/agents/types.ts
    - src/agents/claude.ts
    - src/agents/codex.ts
    - src/agents/qwen.ts
    - src/agents/gemini.ts
    - src/agents/companion.ts

key-decisions:
  - "BaseAgentAdapter — абстрактный класс, не интерфейс: даёт wrapError() и дефолтный isSessionAlive()"
  - "CompanionAdapter implements AgentAdapter (не extends Base): Companion — launcher, не агент"
  - "Паттерн dual export: singleton для обратной совместимости + класс для DI в тестах"
  - "FsDeps инжектируется через конструктор с дефолтом defaultFsDeps() — нет глобального состояния"

patterns-established:
  - "Dual export: export const xAdapter = new XAdapter(); export { XAdapter }"
  - "DI через конструктор: constructor(fsDeps?: FsDeps) { this.fs = fsDeps ?? defaultFsDeps() }"
  - "wrapError() в блоках catch: превращает любой unknown в AdapterError с контекстом"

requirements-completed: [CODE-03, CODE-01, CODE-04]

# Metrics
duration: 45min
completed: 2026-03-20
---

# Plan 02-01: Фундамент — DI, BaseAgentAdapter, AdapterError

**5 адаптеров переписаны с object literals на классы с DI файловой системы через FsDeps интерфейс**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-03-20
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments

- Создан `AdapterError` с enum кодов и статическими фабриками (sessionNotFound, agentNotInstalled, corruptData, resumeNotSupported)
- Создан `BaseAgentAdapter` — абстрактный класс с DI конструктором, `wrapError()`, дефолтным `isSessionAlive()`
- Все 5 адаптеров (Claude, Codex, Qwen, Gemini, Companion) переписаны как классы с dual export
- Registry не изменялся — продолжает импортировать singleton'ы (обратная совместимость)
- 88 тестов проходят, TypeScript компилируется без ошибок

## Task Commits

1. **Task 01: FsDeps + AdapterError** — `0d574c7`
2. **Task 02: BaseAgentAdapter** — `b81aa7b`
3. **Task 03: ClaudeAdapter + CodexAdapter** — `107d960`
4. **Task 04: QwenAdapter + GeminiAdapter** — `6b061f4`
5. **Task 05: CompanionAdapter + registry** — `8a919ca`

## Files Created/Modified

- `src/agents/errors.ts` — AdapterError класс, AdapterErrorCode enum, defaultFsDeps()
- `src/agents/base-adapter.ts` — BaseAgentAdapter абстрактный класс с DI
- `src/agents/types.ts` — добавлен интерфейс FsDeps
- `src/agents/claude.ts` — ClaudeAdapter extends BaseAgentAdapter
- `src/agents/codex.ts` — CodexAdapter extends BaseAgentAdapter
- `src/agents/qwen.ts` — QwenAdapter extends BaseAgentAdapter
- `src/agents/gemini.ts` — GeminiAdapter extends BaseAgentAdapter
- `src/agents/companion.ts` — CompanionAdapter implements AgentAdapter (композиция)

## Decisions Made

- CompanionAdapter не наследует BaseAgentAdapter — Companion это launcher-утилита, не настоящий агент. Композиция семантически точнее.
- Registry не трогался — dual export singleton обеспечивает обратную совместимость без правок registry.

## Deviations from Plan

None — план выполнен точно как написан.

## Issues Encountered

None.

## Next Phase Readiness

- Все адаптеры готовы к тестированию с моками через DI
- FsDeps интерфейс позволяет изолировать FS в тестах
- План 02-02 (тесты адаптеров с DI) может стартовать немедленно

---
*Phase: 02-stabilize-core-adapters-sessions*
*Completed: 2026-03-20*
