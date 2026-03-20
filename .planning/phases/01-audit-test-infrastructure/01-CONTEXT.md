# Phase 1: Аудит и тест-инфраструктура - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Зафиксировать текущее поведение и создать тест-инфраструктуру до любых изменений кода. Включает: strict TypeScript, ESLint, fixture-файлы для JSONL edge cases, тесты на session identity каждого агента, извлечение shared utilities.

Требования: TEST-07, TEST-02, TEST-06, CODE-02, SESS-15, DATA-01–07

</domain>

<decisions>
## Implementation Decisions

### Стратегия strict TypeScript
- Включить `strict` + `noUncheckedIndexedAccess` и фиксить ВСЕ ошибки сразу в Phase 1
- Чистый baseline перед Phase 2 — никаких отложенных TS ошибок
- API можно менять свободно (проект до v1 stable — backward-compat не нужен)
- Target: ES2022, Module: NodeNext (совпадает с esbuild target node18)
- ESLint с @typescript-eslint/recommended — включить в Phase 1 вместе с strict TS

### Структура фикстур
- Организация по агентам: `tests/fixtures/{agent}/` (claude-code, codex, gemini-cli, opencode, vscode-copilot)
- Общие фикстуры в `tests/fixtures/shared/`
- Источник данных — микс: синтетические для edge cases (truncated, BOM, null fields), анонимизированные реальные для valid-session
- Большой файл 10MB+ генерируется на лету через test helper — не коммитится в репо
- Тесты размещаются отдельно от кода: `tests/unit/`, `tests/integration/`, `tests/fixtures/`

### Shared utilities (CODE-02)
- Вынести И улучшить API (error handling, типизация, validation)
- Расположение: `src/utils/` с отдельными файлами: `jsonl.ts`, `paths.ts`, `fs.ts`, `index.ts` (re-exports)
- Error handling: Result type `{ ok: true; data: T } | { ok: false; error: string }`
- Никаких неожиданных exceptions из utilities — вызывающий код обязан обработать ошибку через тип

### Session identity (SESS-15)
- Документация через тесты-as-docs: проходящие тесты = спецификация формата
- Полное покрытие: структура JSONL, пути хранения, ID извлечение, metadata extraction
- Основные тесты на фикстурах (детерминированно, работает в CI)
- Дополнительные conditional тесты на реальных данных машины (скипаются если агент не установлен)

### Claude's Discretion
- Конкретные правила ESLint (какие rules включить/выключить помимо recommended)
- Naming convention для test files
- Внутренняя структура Result type (нужен ли error code помимо message)
- Порядок рефакторинга модулей при strict TS миграции

</decisions>

<specifics>
## Specific Ideas

- Result type для error handling в utilities — явное вдохновение функциональным подходом
- Тесты identity должны покрывать все 5 агентов: Claude Code, Codex, Qwen (в коде может быть как opencode), Gemini CLI, VS Code Copilot (Companion)
- Zod уже в зависимостях — можно использовать для валидации schema если полезно

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- vitest уже настроен (vitest.config.ts, скрипт `npm test`)
- Zod v3.25 в dependencies — можно использовать для runtime validation
- TypeScript 5.7, tsx для dev-запуска
- esbuild для bundling (server.bundle.mjs)
- Существующие benchmark-тесты в tests/ (benchmark.ts, use-cases.ts, context-comparison.ts)

### Established Patterns
- 5 адаптеров: claude-code, codex, gemini-cli, opencode, vscode-copilot — каждый с index.ts, config.ts, hooks.ts
- Модуль сессий: src/session/ (snapshot.ts, extract.ts, db.ts)
- Adapter detection: src/adapters/detect.ts
- ESM modules (`"type": "module"` в package.json)

### Integration Points
- tsconfig.json — нужно обновить для strict mode
- package.json scripts — нужно добавить lint скрипт
- vitest.config.ts — нужно настроить пути к тестам

</code_context>

<deferred>
## Deferred Ideas

None — обсуждение оставалось в рамках фазы.

</deferred>

---

*Phase: 01-audit-test-infrastructure*
*Context gathered: 2026-03-20*
