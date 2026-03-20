---
plan: "03-05"
status: completed
completed_at: "2026-03-21"
tests_added: 86
tests_total: 299
commits: 5
---

# Summary: Plan 03-05 — Unit тесты подсистемы памяти и README verification

## Результат

Все 5 задач выполнены. 6 тест-файлов созданы, 86 новых тестов добавлены, npm test зелёный (299/299).

## Задачи

### 03-05-01: Fixtures для memory тестов ✅
Создана `tests/fixtures/memory/` с fixture файлами для 4 агентов:
- `claude/basic.jsonl` + `basic.expected.json` — формат event с type/message
- `codex/basic.jsonl` + `basic.expected.json` — формат role/content/id
- `qwen/basic.jsonl` + `basic.expected.json` — формат type/message/session_id
- `companion/basic.jsonl` + `basic.expected.json` — формат event/role/text/ts
- `shared/empty.jsonl` — пустой файл
- `shared/malformed.jsonl` — 7 невалидных строк разных типов

### 03-05-02: Тесты hotness и dedup ✅ (26 тестов)
- `memory-hotness.test.mjs` (10 тестов): DECAY_TAU_DAYS=60 верифицирован численно, веса frequency=0.4/recency=0.3/relevance=0.3, recalculateAll
- `memory-dedup.test.mjs` (16 тестов): jaccardSimilarity (6 случаев), findMatch (4), mergeContent (3), resolveCandidate (5) включая fuzzy→merge

### 03-05-03: Тесты index, extract-l0, extract-l1, catalog ✅ (60 тестов)
- `memory-index.test.mjs` (11): writeIndex атомарность, readIndex graceful, stale tmp cleanup (>5 мин удаляется, <5 мин остаётся), lock/unlock цикл
- `memory-extract-l0.test.mjs` (17): extractFilePaths regex, fixture matrix для всех 4 агентов, extractL0FromJSONL, edge cases (empty/malformed → не throw)
- `memory-extract-l1.test.mjs` (17): buildExtractionPrompt, parseLLMResponse (валидный JSON, JSON в markdown, фильтрация пустых/unknown/missing)
- `memory-catalog.test.mjs` (15): generateCatalog, selectHotMemories (фильтр по проекту, top-N), formatSessionStartOutput

### 03-05-04: Запуск всех тестов ✅
`npm test` → 299 тестов, 0 провалов. Покрытие по модулям:
- hotness: 10, dedup: 16, index: 11, extract-l0: 17, extract-l1: 17, catalog: 15

### 03-05-05: README verification ✅
Найдено расхождение: флаги `--agent`, `--session`, `--all` команды `extract-memory` существовали в коде но не были задокументированы. Исправлено:
- Таблица команд: добавлены флаги в строку `cs extract-memory`
- Раздел Memory system: добавлены примеры использования + описание L0→L1 pipeline

## Ключевые решения

- `await import()` нельзя использовать в обычных (non-async top-level) callback — перенёс импорты в top-level
- Fixture matrix: каждый агент имеет свой формат JSONL — тесты включают парсеры под каждый формат
- FUZZY_THRESHOLD=0.5: верифицирован через тест resolveCandidate с fuzzy→merge поведением

## Файлы созданы/изменены

- `tests/fixtures/memory/` — 10 fixture файлов
- `tests/memory-hotness.test.mjs`
- `tests/memory-dedup.test.mjs`
- `tests/memory-index.test.mjs`
- `tests/memory-extract-l0.test.mjs`
- `tests/memory-extract-l1.test.mjs`
- `tests/memory-catalog.test.mjs`
- `README.md` — документация флагов extract-memory
