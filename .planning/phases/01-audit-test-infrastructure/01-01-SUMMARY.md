# Summary: Plan 01-01 — TypeScript strict mode, ESLint и shared utilities

**Статус:** Завершён
**Дата:** 2026-03-20
**Коммиты:** 4

## Выполненные задачи

### 01-01-01: Включить noUncheckedIndexedAccess
- Добавлен `"noUncheckedIndexedAccess": true` в `tsconfig.json`
- Исправлены все TS-ошибки (12 файлов) через proper narrowing, optional chaining и nullish coalescing
- Ни одного `@ts-ignore`

### 01-01-02: Создать Result type и модуль src/utils/
- `src/utils/result.ts` — `Result<T>`, `ok()`, `err()`
- `src/utils/fs.ts` — `safeReadFile`, `safeReadJson`, `safeReaddir`
- `src/utils/jsonl.ts` — `parseJsonlLines`, `parseJsonlFile` (обработка BOM, пустых строк)
- `src/utils/paths.ts` — `normalizePath`
- `src/utils/index.ts` — реэкспорт всех утилит

### 01-01-03: Рефакторинг адаптеров на shared utilities
- `claude.ts` — `loadSessionIndex` и `isSessionAlive` → `safeReadJson`
- `codex.ts` — `parseHistory` → `parseJsonlFile`
- `qwen.ts` — `readFirstLines` → `parseJsonlFile`, `hasQwenHooks` → `safeReadJson`
- `companion.ts` — `loadSessionNames` → `safeReadJson`
- `sessions/loader.ts` — `readSessionIndex` → `safeReadJson`, удалены мёртвые импорты

### 01-01-04: Настроить ESLint
- Установлен `eslint@10`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- Создан `eslint.config.js` (flat config для ESLint v9+/v10)
- Добавлен скрипт `"lint": "eslint src/"` в `package.json`
- Исправлены все 9 lint-ошибок (неиспользуемые импорты и переменные)

## Финальная верификация

- `npx tsc --noEmit` — exit 0, ошибок нет
- `npm run lint` — exit 0, ошибок нет
- `src/utils/` содержит все 5 файлов: result.ts, jsonl.ts, fs.ts, paths.ts, index.ts
- Ни одного `@ts-ignore` в коде
- Все адаптеры импортируют из `src/utils/`

## Ключевые решения

- ESLint 10 требует flat config (`eslint.config.js`), не `.eslintrc.json`
- `filter(Boolean)` возвращает `(T | undefined)[]` при `noUncheckedIndexedAccess` — нужен type predicate `(x): x is T => Boolean(x)`
- Деструктуризация `const [a, b] = arr` даёт `string | undefined` — нужен guard
- `_moveCursor` и `_clearScreen` в picker.ts — утилиты оставлены с `_`-prefix для будущего использования
