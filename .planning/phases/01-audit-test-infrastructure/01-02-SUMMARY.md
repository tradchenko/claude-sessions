---
plan: 01-02
title: "Fixture-файлы и тесты JSONL edge cases"
status: completed
completed: 2026-03-20
---

# SUMMARY: Plan 02 — Fixture-файлы и тесты JSONL edge cases

## Результат

Все 5 задач выполнены. 19 тестов пишут и проходят. Каждый DATA-01..07 покрыт.

## Что сделано

### 01-02-01: Fixture-файлы
- `tests/fixtures/shared/`: truncated.jsonl, bom.jsonl (с UTF-8 BOM), null-fields.jsonl, empty.jsonl, invalid-lines.jsonl
- `tests/fixtures/claude/`: valid-history.jsonl, valid-session.jsonl
- `tests/fixtures/codex/`: valid-history.jsonl
- `tests/fixtures/qwen/`: valid-session.jsonl
- `tests/fixtures/companion/`: valid-recording.jsonl

### 01-02-02: Test helper
- `tests/helpers/generate-large-jsonl.mjs` — генерирует JSONL заданного размера в tmpdir(), пишет порциями по 10K строк

### 01-02-03: JSONL parser tests (12 тестов)
- DATA-01: невалидные строки пропускаются (plain text, XML, пустые)
- DATA-04: обрезанная строка пропускается, остальные парсятся
- DATA-05: BOM-prefix не мешает парсингу первой строки
- DATA-06: null-поля (sessionId, timestamp, project) не вызывают краш

### 01-02-04: Data resilience tests (7 тестов)
- DATA-02: пустая директория агента → пустой массив, нет исключений
- DATA-03: несуществующая директория агента → пустой массив, нет исключений
- DATA-07: 10MB+ JSONL парсится без OOM, возвращает корректный результат

### 01-02-05: Test runner
- `npm test` → `node --test tests/**/*.test.mjs` (19 тестов, 0 падений)
- `npm run test:legacy` → старый test/run.mjs (build + CLI тесты)
- `tests/run.mjs` — альтернативный entry point

## Commits

- `e6014f6` feat(01-02-01): создать fixture-файлы для JSONL edge cases
- `bf6deb2` feat(01-02-02): добавить хелпер генерации 10MB+ JSONL файлов
- `538986b` feat(01-02-03): написать тесты JSONL-парсера на fixture-файлах
- `f37d90e` feat(01-02-04): написать тесты data resilience
- `985912b` feat(01-02-05): обновить test runner для новых тестов

## Decisions

- Тесты написаны inline (без импорта из dist/) — документируют текущее поведение до рефакторинга
- 10MB файл не коммитится — генерируется в tmpdir() и удаляется в after()
- `test:legacy` сохранён чтобы не сломать существующие CLI-тесты (требуют build)
- `parseJsonlContent` в тестах совпадает по логике с адаптерами: BOM-strip + split + try/catch JSON.parse
