# Phase 4: Миграция и финальная интеграция — Research

## Executive Summary

Фаза 4 строит поверх стабильного ядра (Phases 1-3) два независимых слоя: (1) систему версионированной миграции с `meta.json`, backup и lazy-check в `cli.ts`, и (2) интеграционные тесты всех 5 CLI-команд в `tests/integration/`. Ни `meta.json`, ни `backups/`, ни единой функции `runMigrations()` в codebase пока нет — всё создаётся с нуля. Функции `migrateHooks()` и `migrateSessionIndex()` уже работают и будут обёрнуты, а не переписаны.

---

## Domain Analysis

### Migration Scenarios

| Сценарий | Признак | Действие |
|----------|---------|----------|
| Fresh install | `~/.claude-sessions/` отсутствует | Создать директории, установить хуки, записать `meta.json {schema_version: 1}` |
| Upgrade из JS (v1.x) | `~/.claude-sessions/` есть, `meta.json` отсутствует — v0 | Запустить все миграции с v0→1, бэкапить settings.json |
| Upgrade из TS pre-migration | `meta.json` есть, `schema_version < N` | Запустить миграции от текущей версии до целевой |
| Already up-to-date | `schema_version == N` | No-op (идемпотентность) |
| `--ignore-scripts` | postinstall не запускался, версия не определена | Lazy migration при первом запуске любой CLI-команды |

### Current Postinstall Flow

`package.json` → `node ./dist/commands/install.js --auto 2>/dev/null || true`

`install.ts` при `--auto` выполняет:
1. `ensureClaudeDir()` — создаёт `~/.claude/`
2. `installCommands()` — копирует slash-commands (идемпотентно по содержимому)
3. `installScripts()` — копирует save-summary.js (идемпотентно)
4. `installHook()` — добавляет Stop hook (проверяет `alreadyInstalled`)
5. `migrateHooks(settings)` — конвертирует flat format → `{matcher, hooks: [...]}`
6. `migrateSessionIndex()` → `generateL0ForExistingSessions()` из `src/memory/migrate.ts`

**Проблемы идемпотентности:**
- Нет `meta.json` — нет способа знать, что миграция уже выполнялась
- `installHook()` проверяет наличие `stop.js` в settings.json, но `migrateSessionIndex()` запускается при каждом вызове без проверки уже мигрированного состояния — `migrateSessionIndex()` сам идемпотентен (проверяет `existsSync(newIndexPath)`), но `generateL0ForExistingSessions()` будет перезапускаться на каждый postinstall
- Нет backup перед записью settings.json в `installHook()` и `migrateHooks()`

### CLI Commands Inventory

Из `src/cli.ts` — 5 команд, которые нужно покрыть интеграционными тестами (согласно требованиям):

| Команда | Entry point | Ключевые edge cases |
|---------|-------------|---------------------|
| `list` | `commands/list.ts` | пустые данные, --agent фильтр, --search, дедупликация |
| `resume` | через picker/adapter | агент не установлен, сессия не найдена |
| `restore <id>` | `commands/restore.ts` | несуществующий id, повторный restore (идемпотентность) |
| `install` | `commands/install.ts` | --auto режим, повторный вызов (идемпотентность) |
| `extract-memory` | `commands/extract-memory.ts` | пустой проект, повреждённый JSONL |

### Existing Test Coverage

- **299 тестов** в `tests/*.test.mjs` (unit-уровень)
- **Миграция**: `migrateHooks()` тестируется косвенно в `adapter-di.test.mjs`, `adapter-resume.test.mjs`; прямых тестов на `migrateSessionIndex()` и `generateL0ForExistingSessions()` нет
- **Интеграционные тесты CLI**: отсутствуют — `tests/integration/` директории нет
- **TEST-04** (unit тесты на миграцию) и **TEST-05** (integration тесты CLI) — не покрыты

---

## Technical Findings

### meta.json — отсутствует, нужно создать с нуля

Структура (минимальная):
```json
{ "schema_version": 1, "migrated_at": "ISO-timestamp" }
```
Путь: `~/.claude-sessions/meta.json`. Управляется `runMigrations()`.

### runMigrations() — центральная функция

Вызывается из двух мест:
1. `install.ts` при `--auto` (postinstall) — `silent: true`
2. `cli.ts` перед dispatch (lazy) — `silent: false`, одна строка пользователю

Паттерн: массив миграций `{ fromVersion, toVersion, migrate }`, выполняются последовательно.

### Backup — не реализован

Нужен `~/.claude-sessions/backups/`. Стратегия: бэкапить только файлы которые миграция меняет (`~/.claude/settings.json` + `memory-index.json`). Хранить последние 3 копии. Имя: `settings-<ISO-timestamp>.json`.

### Atomic write — частично реализован

`src/memory/index.ts` использует write-rename (atomic). `src/commands/install.ts` использует `writeFileSync` напрямую без atomic — при записи settings.json (MIG-05) нужно исправить.

### FsDeps DI

Реализован в Phase 2 для адаптеров. Для интеграционных тестов использовать temp dir + реальный fs, но с переопределением путей через параметры (не через env или global config) — так изолировано и без мокирования.

### Integration test architecture

- `tests/integration/` — новый каталог
- Единый `npm test` уже запускает `tests/**/*.test.mjs` — glob подхватит новые файлы
- Паттерн: `mkdtemp` → установить минимальный контекст → вызвать command function напрямую (не через child_process) → assert → cleanup в `after()`
- Legacy `test/run.mjs` — не трогать

---

## Requirement Analysis

### MIG-01: Postinstall мигрирует хуки из старого формата

**Что есть:** `migrateHooks()` в `install.ts` — конвертирует flat `{type, command}` → `{matcher, hooks: [...]}`, обновляет legacy paths.
**Что нужно:** Обернуть в `runMigrations()` с проверкой `meta.json`, чтобы не запускать повторно если уже выполнено.

### MIG-02: Postinstall мигрирует файлы памяти

**Что есть:** `migrateSessionIndex()` в `src/memory/migrate.ts` — идемпотентна, мержит старый `session-index.json` в `memory-index.json`.
**Что нужно:** То же — интегрировать в `runMigrations()`, проверять `meta.json`.

### MIG-03: Postinstall идемпотентен

**Что есть:** Отдельные функции идемпотентны (installHook, migrateSessionIndex), но нет единого механизма.
**Что нужно:** `meta.json` + проверка `schema_version >= target` → early return.

### MIG-04: Lazy migration при --ignore-scripts

**Что есть:** `cli.ts` — чистый switch/case без проверки миграции.
**Что нужно:** Добавить вызов `runMigrations({ silent: false })` перед switch. Условие: только если `meta.json` отсутствует или `schema_version < N`.

### MIG-05: Atomic writes для конфигов

**Что есть:** `src/memory/index.ts` — atomic write реализован. `install.ts` — `writeFileSync` напрямую.
**Что нужно:** Заменить `writeFileSync(SETTINGS_FILE, ...)` в `installHook()` на atomic write. Аналогично при записи `meta.json`.

### MIG-06: Exit code 0 при ошибке миграции

**Что есть:** `postinstall` в `package.json` — `|| true` гарантирует exit 0. `install.ts` — try/catch с console.log.
**Что нужно:** `runMigrations()` должна ловить все ошибки, логировать, и возвращать gracefully (не throws).

### MIG-07: Backup перед миграцией

**Что есть:** Ничего — нет директории backups, нет механизма backup.
**Что нужно:** Создать `~/.claude-sessions/backups/`. Перед изменением settings.json и memory-index.json — копировать с ISO-timestamp. Cleanup старых: хранить 3 последних.

### TEST-04: Unit тесты на миграцию

**Что есть:** `src/memory/migrate.ts` — покрыта косвенно. Прямых тестов нет.
**Что нужно:** Новый файл `tests/migration.test.mjs`:
- `migrateHooks()`: flat format → wrapped, idempotent on already-wrapped, legacy path update
- `migrateSessionIndex()`: fresh, merge с существующим, corrupt old index
- `runMigrations()`: v0→v1, idempotent (v1→v1), error handling

### TEST-05: Integration тесты на CLI-команды

**Что есть:** Нет файлов в `tests/integration/`.
**Что нужно:** 5 файлов по командам:
- `tests/integration/cli-list.test.mjs`
- `tests/integration/cli-resume.test.mjs`
- `tests/integration/cli-restore.test.mjs`
- `tests/integration/cli-install.test.mjs`
- `tests/integration/cli-extract-memory.test.mjs`

---

## Validation Architecture

### Smoke-тест миграции (E2E)

1. Подготовить `tmpdir` с:
   - `~/.claude/settings.json` со старым flat hook format `{type: "command", command: "...save-session-summary.mjs"}`
   - `~/.claude-sessions/session-index.json` со старым форматом (без `l0`)
   - Без `meta.json`
2. Вызвать `runMigrations(tmpdir)`
3. Assert:
   - `meta.json` создан, `schema_version == 1`
   - `settings.json` содержит `{matcher, hooks: [...]}` format
   - `memory-index.json` создан, `version: 1`
   - `backups/` содержит копию settings.json

### Idempotency-тест

1. Запустить `runMigrations()` дважды
2. Assert: результат идентичен, лишних backup-копий не создаётся, `migrated_at` не обновляется

### CLI Integration тест паттерн

```js
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

let dir;
before(() => { dir = mkdtempSync(join(tmpdir(), 'cs-test-')); });
after(() => { rmSync(dir, { recursive: true, force: true }); });

test('list возвращает пустой список', async () => {
  // Передать dir как DATA_DIR через параметр/env
  const result = await list({ dataDir: dir, args: [] });
  assert.equal(result.sessions.length, 0);
});
```

### CI-проверка

- `npm test` покрывает `tests/**/*.test.mjs` — новые файлы подхватываются автоматически
- Добавить smoke-тест миграции в `tests/migration-e2e.test.mjs`

---

## Risks & Unknowns

| Риск | Уровень | Митигация |
|------|---------|-----------|
| `install.ts` тесно связан с реальными путями (`SETTINGS_FILE`, `CLAUDE_DIR`) — сложно тестировать изолировано | Высокий | Рефакторить `runMigrations()` принимать пути как параметры, а не из глобального config |
| Команда `resume` в CLI запускает child_process агента — интеграционный тест требует мока | Средний | Тестировать только dispatch-логику и error path; E2E с реальным агентом — вне скопа |
| `generateL0ForExistingSessions()` читает реальные JSONL из `PROJECTS_DIR` — привязан к реальной fs | Средний | Передавать `projectsDir` как параметр (уже есть в сигнатуре) |
| Нет gemini fixtures в `tests/fixtures/` — integration тест extract-memory для gemini может требовать создания | Низкий | Использовать claude/codex fixtures, параметризовать |
| `install.ts` содержит интерактивный `askYesNo()` — блокирует в non-TTY | Низкий | `--auto` флаг уже обходит это; в тестах использовать `--auto` |

---

## Dependencies

### Внешние (нет новых runtime deps)
- Всё на Node.js built-ins: `fs`, `path`, `os`, `node:test`

### Внутренние (уже реализованы в предыдущих фазах)
- `src/utils/fs.ts` — atomic write (Phase 3)
- `src/memory/migrate.ts` — `migrateSessionIndex()`, `generateL0ForExistingSessions()` (Phase 3)
- `src/commands/install.ts` — `migrateHooks()`, `installHook()` (Phase 1-2)
- `FsDeps` DI pattern (Phase 2)
- `Result<T>` type в `src/utils/result.ts` (Phase 1)
- `tests/helpers/` — вспомогательные утилиты для тестов (Phase 1)

### Порядок реализации внутри Phase 4

1. Создать `src/migration/runner.ts` — `runMigrations()` с `meta.json` и backup
2. Интегрировать в `install.ts` (postinstall path)
3. Интегрировать в `cli.ts` (lazy path)
4. Написать unit тесты `tests/migration.test.mjs` (TEST-04)
5. Написать integration тесты `tests/integration/cli-*.test.mjs` (TEST-05)

---

## RESEARCH COMPLETE

*Дата: 2026-03-21*
*Фаза: 04-migration-final-integration*
