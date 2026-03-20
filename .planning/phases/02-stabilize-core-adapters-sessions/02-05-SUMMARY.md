---
phase: 02-stabilize-core-adapters-sessions
plan: 05
subsystem: commands
tags: [restore, registry, multiagent, idempotency, atomic-write, adapter-pattern]

# Dependency graph
requires:
  - phase: 02-01
    provides: BaseAgentAdapter, AdapterError, registry.getAdapter
  - phase: 02-03
    provides: getResumeCommand для всех агентов
provides:
  - restore работает для всех 5 агентов через registry
  - идемпотентный restore — повторный вызов не создаёт дублей
  - атомарная запись .restore-context.md через temp+rename
  - единообразный Markdown frontmatter с метаданными (session/agent/project/created)
  - структурированные ошибки (AGENT_NOT_INSTALLED, RESUME_NOT_SUPPORTED) без crash
affects: [03-memory, 04-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [atomic-write-temp-rename, idempotent-file-write, registry-adapter-lookup, frontmatter-metadata]

key-files:
  created:
    - tests/restore-multiagent.test.mjs
  modified:
    - src/commands/restore.ts

key-decisions:
  - "Контекстный файл в session.projectPath — не в ~/.claude/scripts/ (агент-независимо)"
  - "Идемпотентность через поиск sessionId в существующем файле"
  - "Атомарная запись: writeFileSync(.tmp) + renameSync → atomic"
  - "formatRestoreContext экспортируется как pure function (тестируемость)"
  - "launchAgentWithContext — отдельная функция с обработкой AdapterError"
  - "Минимальный контекст с предупреждением если JSONL недоступен (не crash)"

patterns-established:
  - "atomic-write: всегда temp+rename для критичных файлов"
  - "idempotency-check: проверить содержимое существующего файла перед перезаписью"
  - "registry-lookup: getAdapter(session.agent) вместо хардкода агента"

requirements-completed: [SESS-11, SESS-12]

# Metrics
duration: 25min
completed: 2026-03-20
---

# Plan 02-05: Restore — мультиагентность и идемпотентность

**restore.ts переписан на registry-based подход: все 5 агентов, идемпотентный контекстный файл в projectPath с atomic write и frontmatter метаданными**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-03-20
- **Tasks:** 3 (реализованы в одном коммите как связанные изменения)
- **Files modified:** 2

## Accomplishments
- Убран хардкод Claude: `findClaudeCli()` + `CLAUDE_DIR` заменены на `registry.getAdapter(session.agent)`
- Идемпотентность: повторный вызов restore с тем же sessionId переиспользует файл без побочных эффектов
- Атомарная запись `.restore-context.md` через temp+rename — предотвращает corrupt при прерывании
- Единообразный Markdown frontmatter для всех агентов: session, agent, project, created
- Структурированные ошибки AdapterError (AGENT_NOT_INSTALLED, RESUME_NOT_SUPPORTED) — не crash
- Минимальный контекст с предупреждением если JSONL недоступен
- 53 новых теста, итого 157 pass

## Task Commits

1. **Tasks 02-05-01 + 02-05-02 + 02-05-03 (combined)** — `174ddd8` (feat: мультиагентность и идемпотентность)

## Files Created/Modified
- `src/commands/restore.ts` — переписан: registry lookup, atomic write, idempotency, frontmatter
- `tests/restore-multiagent.test.mjs` — 53 теста: SESS-11 (мультиагентность) + SESS-12 (идемпотентность + метаданные)

## Decisions Made
- Контекстный файл хранится в `session.projectPath` вместо `~/.claude/scripts/` — агент-независимо и ближе к проекту
- `formatRestoreContext` экспортируется — pure function упрощает будущее тестирование
- Fallback на `claude` если `session.agent` не определён (обратная совместимость)
- Три задачи закоммичены одним атомарным коммитом т.к. все изменения в одном файле и неразрывно связаны

## Deviations from Plan
None — план выполнен точно по спецификации. Три задачи объединены в один коммит как взаимозависимые изменения одного файла.

## Issues Encountered
None

## Next Phase Readiness
- restore поддерживает все 5 агентов
- Контекст сохраняется рядом с проектом (удобно для memory-subsystem в Phase 3)
- atomic write паттерн готов к переиспользованию в Phase 3

---
*Phase: 02-stabilize-core-adapters-sessions*
*Completed: 2026-03-20*
