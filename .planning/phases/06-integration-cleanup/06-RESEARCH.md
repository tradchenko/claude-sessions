# Phase 06 Research: Integration cleanup — shared utils и hotness dedup

**Date:** 2026-03-21
**Phase:** 06-integration-cleanup

---

## Phase Overview

Цель фазы — устранить два вида дублирования кода:

1. **gemini.ts** не использует shared utils (`safeReadJson`, `parseJsonlFile`) из `src/utils/` — хотя эти утилиты существуют и все другие адаптеры на них переходят.
2. **session-start.ts** дублирует hotness формулы локально, вместо того чтобы импортировать их из `src/memory/hotness.ts`.

Requirements: DATA-01 (JSONL парсер пропускает невалидные строки), CODE-03 (DI через конструктор), MEM-04 (memory loading при старте).

---

## Codebase Analysis

### gemini.ts — текущее состояние

Файл: `/Users/tradchenko/claude-sessions/src/agents/gemini.ts`

**Что НЕ дублирует**: gemini.ts на данный момент **не читает JSON/JSONL файлы напрямую**. Он работает с git-репозиториями через `execSync('git log ...')` и `statSync()`, а также использует `readSessionIndex()` из `src/sessions/loader.ts`.

**Вывод**: gemini.ts не содержит прямого дублирования `safeReadJson` / `parseJsonlFile`. Однако проверка на соответствие CODE-03 (DI через конструктор) — адаптер принимает конструктор без аргументов, файловые операции жёстко прошиты.

**Импорты gemini.ts**:
- `existsSync, readdirSync, statSync` из `node:fs` (прямые, не через utils)
- `readSessionIndex` из `sessions/loader.ts`
- `BaseAgentAdapter` — есть
- `AdapterError` — есть

**Реальный gap**: `safeReaddir` из shared utils не используется вместо прямого `readdirSync`. `safeReadJson` не применяется при чтении session index (это делает `readSessionIndex` во внутренней реализации loader.ts).

### session-start.ts — дублирование hotness

Файл: `/Users/tradchenko/claude-sessions/src/hooks/session-start.ts`

**Критическая находка**: Файл является **standalone скриптом** с явным комментарием:
```
// Standalone — does not import package modules (runs from ~/.claude/scripts/).
```

Скрипт содержит полные копии:
- `CATEGORY_WEIGHTS` (идентичен `src/memory/hotness.ts`)
- `calculateHotness()` (идентичная реализация)
- `recalculateAll()` (идентичная реализация)
- `DECAY_TAU_DAYS = 60` (идентична константа)

Комментарий в файле: `// SYNC: эти значения должны совпадать с src/memory/hotness.ts и src/memory/catalog.ts`

**Причина standalone**: Скрипт копируется в `~/.claude/scripts/` и запускается вне контекста npm пакета, поэтому не может импортировать из `dist/`.

### Shared utils — существующие API

Файл: `/Users/tradchenko/claude-sessions/src/utils/fs.ts`
- `safeReadFile(path: string): Result<string>` — читает файл, возвращает Result
- `safeReadJson<T>(path: string): Result<T>` — читает и парсит JSON, возвращает Result
- `safeReaddir(path: string): Result<string[]>` — читает директорию

Файл: `/Users/tradchenko/claude-sessions/src/utils/jsonl.ts`
- `parseJsonlLines(content: string): Result<unknown[]>` — парсит JSONL строки
- `parseJsonlFile(filePath: string): Result<unknown[]>` — читает и парсит JSONL файл

Всё реэкспортировано из `src/utils/index.ts`.

### Тесты

- `tests/resume-qwen-gemini.test.mjs` — тесты `GeminiAdapter.getResumeCommand()`, используют `dist/agents/gemini.js`
- `tests/memory-hotness.test.mjs` — тесты `calculateHotness`, `recalculateAll`, `CATEGORY_WEIGHTS` из `dist/memory/hotness.js`
- Тестов для `session-start.ts` нет — это standalone скрипт

---

## Implementation Approach

### Задача 1: gemini.ts → shared utils

**Реальный scope** (по результатам анализа): gemini.ts не читает JSON/JSONL напрямую, но использует прямые `fs` вызовы без Result-обёрток.

Конкретные изменения:
1. Заменить прямой `readdirSync(HISTORY_DIR, { withFileTypes: true })` на подход с `safeReaddir` + обработку Result
2. `existsSync` вызовы — допустимы как guard checks, не требуют замены
3. `statSync` в fallback — обернуть через `safeReadFile` или оставить в try/catch (уже обёрнуто)

**Альтернатива**: Если audit показал что gap в gemini.ts связан с отсутствием DI для fs (CODE-03), то нужно добавить DI-параметры в конструктор (аналогично другим адаптерам после Phase 2).

### Задача 2: session-start.ts — hotness dedup

**Ограничение standalone**: Скрипт не может импортировать из `dist/` пакета напрямую.

**Подходы**:

**Вариант A (Build-time copy)**: При сборке (`npm run build`) копировать скомпилированный `hotness.js` рядом со скриптом и изменить import path. Сложно, требует изменения build pipeline.

**Вариант B (Bundled standalone)**: Использовать esbuild/rollup для бандлинга `session-start.ts` вместе с `hotness.ts` в единый файл. Наиболее чистый подход.

**Вариант C (Accepted duplication с SYNC guard)**: Оставить дублирование, но добавить тест, который сравнивает значения констант и формулу в обоих файлах. Комментарий `// SYNC` уже присутствует — нужно его закрепить тестом.

**Вариант D (Import from relative dist)**: В `session-start.ts` изменить import на относительный путь к `dist/memory/hotness.js` при условии, что скрипт запускается из корня пакета.

**Рекомендация**: Вариант C (SYNC guard тест) — наименее рискованный. Вариант B — если требуется полное устранение дублирования.

---

## Files Affected

| Файл | Изменение |
|------|-----------|
| `src/agents/gemini.ts` | Заменить `readdirSync` на `safeReaddir` из shared utils |
| `src/hooks/session-start.ts` | Вариант B: рефакторинг в bundled скрипт; Вариант C: добавить SYNC тест |
| `tests/resume-qwen-gemini.test.mjs` | Проверить — изменения gemini.ts не должны сломать |
| `tests/memory-hotness.test.mjs` | Добавить SYNC тест если Вариант C |
| `package.json` | Если Вариант B: добавить bundle step |

---

## Dependencies and Risks

### Риск 1: session-start.ts — standalone constraint
Скрипт явно задокументирован как standalone. Попытка импортировать из `dist/` может сломать работу хука в системах где путь к dist отличается. Нужно проверить как скрипт деплоится (команда `install`).

### Риск 2: gemini.ts — safeReaddir signature
`safeReaddir` возвращает `Result<string[]>` (строки), но `readdirSync` с `{ withFileTypes: true }` возвращает `Dirent[]`. Потребуется либо изменить подход (отдельный `statSync` для проверки isDirectory), либо не использовать `safeReaddir` для этого случая.

### Риск 3: Тесты gemini адаптера
`tests/resume-qwen-gemini.test.mjs` импортирует из `dist/` — нужен `npm run build` перед тестами. После изменений убедиться что build проходит и тесты не падают.

### Риск 4: DATA-01 coverage
`parseJsonlFile` уже обрабатывает невалидные строки (пропускает молча). Если gemini.ts не читает JSONL — DATA-01 не применим к нему. Нужно уточнить в audit report что именно имеется в виду.

---

## Validation Architecture

### После изменений gemini.ts:
```
npm run build && node tests/run.mjs tests/resume-qwen-gemini.test.mjs
```

### Тест SYNC констант (если Вариант C):
Создать `tests/hotness-sync.test.mjs` — импортировать константы из `dist/memory/hotness.js` и сравнить с жёстко заданными значениями из `session-start.ts`:
- `DECAY_TAU_DAYS === 60`
- `CATEGORY_WEIGHTS` идентичен по всем 6 категориям
- Формула `calculateHotness` даёт те же результаты что локальная копия

### Quality gate:
```
npm run check   # lint + typecheck: 0 errors
npm test        # все тесты проходят
```

---

## Summary

**Реальный scope фазы**:
1. **gemini.ts**: небольшая замена `readdirSync` (withFileTypes) на более безопасный паттерн; основной JSON/JSONL gap отсутствует — адаптер работает через git, а не файлы напрямую.
2. **session-start.ts**: выбор стратегии для дублирования hotness. Рекомендуется Вариант C (SYNC guard тест) как безопасный, или Вариант B (bundling) как полное решение.

**Предупреждение**: Необходимо изучить как `session-start.ts` деплоится через `commands/install.ts` перед финальным решением по стратегии импорта.
