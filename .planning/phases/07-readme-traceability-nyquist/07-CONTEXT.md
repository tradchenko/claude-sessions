# Phase 7: README verification, traceability и Nyquist - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Закрыть TEST-08 (README verification), обновить traceability table для всех 48 requirements и привести все 6 завершённых фаз к Nyquist compliance через VALIDATION.md. Также провести полную ревизию ROADMAP.md и создать STATE.md.

</domain>

<decisions>
## Implementation Decisions

### README верификация
- Проверять CLI-команды через реальный запуск (--help вывод) + grep исходников TUI для хоткеев
- Проверять таблицу Supported agents через код адаптеров в src/adapters/ — пути данных, хуки, MCP, resume поддержка
- Найденные расхождения — сразу править README.md (один коммит на все исправления)
- Scope: README.md + все файлы в docs/ (llms.txt, llms-full.txt, platform-support.md)

### Traceability table
- Отдельный файл .planning/TRACEABILITY.md
- Полная матрица: | Req ID | Description | Phase | Evidence | Status |
- Evidence: путь к файлу + краткое описание (например `tests/adapters.test.ts` — DI injection тесты)
- Поточная проверка каждого из 48 requirements — для каждого найти тест/код подтверждающий реализацию

### Nyquist VALIDATION.md
- По одному файлу на фазу: .planning/phases/XX-name/XX-VALIDATION.md
- Глубина: чеклист success criteria + реальный прогон (npm test, grep кода, запуск CLI)
- Evidence фиксируется для каждого criterion
- Непройденные criteria — записать как gap (❌ + описание), не блокировать и не фиксить в рамках Phase 7

### ROADMAP cleanup
- Полная ревизия: исправить 03-03 статус + проверить консистентность всех статусов планов
- Обновить шапку ROADMAP (даты, финальные метрики)
- Добавить секцию Summary: кол-во тестов, покрытие requirements, даты завершения фаз
- Создать .planning/STATE.md с текущим статусом проекта

### Claude's Discretion
- Шаблон VALIDATION.md — структура и оформление
- Порядок проверки requirements (по фазам или по категориям)
- Формат STATE.md
- Детали Summary секции в ROADMAP

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- src/adapters/ — 5 адаптеров (claude-code, codex, gemini-cli, opencode, vscode-copilot) с config.ts, hooks.ts, index.ts
- README.md — v2.1.0, 12 CLI-команд, таблица Supported agents, TUI picker
- docs/ — llms.txt, llms-full.txt, platform-support.md

### Established Patterns
- ROADMAP.md — фазы с планами, success criteria, requirement mapping
- Phase directories: .planning/phases/XX-name/ с планами XX-YY-PLAN.md

### Integration Points
- package.json bin commands — определяют доступные CLI-команды
- src/cli.ts — точка входа CLI, определяет все команды
- tests/ — существующие тесты для верификации

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-readme-traceability-nyquist*
*Context gathered: 2026-03-21*
