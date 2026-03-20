# Phase 5: ESLint config и quality gate - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Добавить ESLint конфигурацию с нуля и создать quality gate (lint + typecheck). Закрыть ESLint config discrepancy и разблокировать quality gate для integration тестов. Исправить все существующие нарушения в рамках фазы.

</domain>

<decisions>
## Implementation Decisions

### Конфигурация ESLint
- Flat config формат (eslint.config.mjs) — новый стандарт ESLint 9+
- Strict уровень правил: typescript-eslint/strict + recommended
- Плагины: typescript-eslint + eslint-plugin-import (порядок импортов, неиспользуемые, циклические)
- Все существующие нарушения исправить сразу — чистый старт без компромиссов

### Quality gate механизм
- npm script только (без pre-commit hooks)
- `npm run lint` — eslint .
- `npm run lint:fix` — eslint . --fix
- `npm run check` — npm run lint && npm run typecheck (объединённый gate)
- typecheck уже есть: `tsc --noEmit`

### Интеграция с Prettier
- eslint-config-prettier — отключает конфликтные правила ESLint
- Prettier форматирует, ESLint линтит логику — чёткое разделение
- Создать .prettierrc с настройками: tabWidth=3, singleQuote=true, printWidth=180

### Scope проверок
- Линтить src/ + tests/ — одинаковые правила для всего кода
- Игнорировать: build/, node_modules/, dist/, .planning/, .claude/
- npm run lint:fix для автоисправления

### Claude's Discretion
- Конкретные правила ESLint для отключения/настройки при необходимости
- Порядок секций в eslint.config.mjs
- Формат .prettierrc (json vs yaml)

</decisions>

<specifics>
## Specific Ideas

- Quality gate = lint + typecheck в одном скрипте `check`
- Prettier настройки должны быть явными в файле, а не только в CLAUDE.md
- Strict с первого дня — не копить техдолг

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `typecheck` скрипт уже существует: `tsc --noEmit`
- vitest для тестов, можно проверить совместимость

### Established Patterns
- TypeScript проект с ESM (type: module в package.json)
- Build через tsc + esbuild bundle
- Тесты через vitest run

### Integration Points
- package.json scripts — добавить lint, lint:fix, check
- Новые devDependencies: eslint, typescript-eslint, eslint-plugin-import, eslint-config-prettier
- Новые файлы: eslint.config.mjs, .prettierrc

</code_context>

<deferred>
## Deferred Ideas

None — обсуждение осталось в рамках scope фазы

</deferred>

---

*Phase: 05-eslint-quality-gate*
*Context gathered: 2026-03-21*
