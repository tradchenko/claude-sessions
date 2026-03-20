# Phase 4: Миграция и финальная интеграция - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Обеспечить безопасный upgrade path при `npm install -g claude-sessions` и покрыть все 5 CLI-команд (`list`, `resume`, `restore`, `install`, `extract-memory`) интеграционными тестами. Включает: postinstall миграцию, lazy migration при `--ignore-scripts`, backup конфигов, идемпотентность, и E2E тесты миграции.

Требования: MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, TEST-04, TEST-05

</domain>

<decisions>
## Implementation Decisions

### Стратегия определения upgrade
- Версионный штамп (`schema_version: 1, 2, 3...`) в `~/.claude-sessions/meta.json`
- Отсутствие meta.json = v0 (первая установка или старая версия) — запустить все миграции с нуля
- Целочисленный schema version — каждая миграция инкрементирует на 1
- Миграции выполняются последовательно от текущей версии до целевой

### Backup и rollback
- Backup в `~/.claude-sessions/backups/` с таймстампом в имени
- Хранить последние 3 backup-копии, старые удалять автоматически
- Backup только файлов которые миграция меняет: settings.json (хуки) + memory index
- Нет авто-rollback — при ошибке логировать и exit 0 (MIG-06). Пользователь восстанавливает вручную из backups/

### Lazy migration: точка входа
- Проверка в cli.ts перед dispatch любой команды — одна точка входа
- Тот же код `runMigrations()` что и postinstall, разница только в уровне вывода
- Короткое сообщение пользователю: «⚡ Миграция v0→v1...» одной строкой
- Lazy migration делает полный install (если хуков нет — установить, если старый формат — мигрировать)

### Интеграционные тесты
- Размещение в `tests/integration/` (новый набор), единый `npm test`
- Happy path + 2-3 критичных edge cases на команду (пустые данные, повреждённые файлы, отсутствующие агенты)
- Temp dir + DI (FsDeps): реальные файлы но изолированно, cleanup после теста
- E2E тест миграции: старый формат в temp dir → runMigrations() → проверить что list/resume работают с мигрированными данными
- Legacy test/run.mjs оставить как есть

### Claude's Discretion
- Формат backup имени (таймстамп vs инкрементальный номер)
- Конкретные миграции v0→v1 (какие трансформации)
- Структура meta.json (минимальная vs расширенная)
- Порядок и группировка интеграционных тест-файлов
- Cleanup стратегия для temp directories

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **migrateHooks()** (`src/commands/install.ts`): уже конвертирует старый плоский формат хуков → новый `{matcher, hooks: [...]}`
- **migrateSessionIndex()** (`src/memory/migrate.ts`): идемпотентная миграция session-index в MemoryIndex формат
- **installHook()** (`src/commands/install.ts`): идемпотентная установка Stop hook
- **FsDeps DI** (Phase 2): все адаптеры тестируемы через dependency injection
- **AdapterError** (Phase 2): структурированные ошибки с agentName, code, suggestion
- **Result type** (Phase 1): `{ ok: true; data: T } | { ok: false; error: string }` в utilities
- **Atomic write** (Phase 3): write-rename паттерн для crash-safe записи

### Established Patterns
- **postinstall**: `node ./dist/commands/install.js --auto 2>/dev/null || true` — exit 0 гарантирован
- **Тесты**: `node:test` (built-in), организация в `tests/` с fixtures по агентам
- **i18n модульный**: сообщения в `src/core/i18n/` по доменам
- **Zero runtime deps**: никаких новых зависимостей

### Integration Points
- `src/cli.ts` — switch/case dispatch, точка для lazy migration check
- `src/commands/install.ts` — postinstall entry point, migrateHooks()
- `src/memory/migrate.ts` — session/memory index миграция
- `package.json` scripts.postinstall — вызов install --auto

</code_context>

<specifics>
## Specific Ideas

- `runMigrations()` — единая функция, вызываемая и из postinstall, и из CLI (lazy). Параметр `silent: boolean` управляет выводом
- Миграции как массив `{ fromVersion: number, toVersion: number, migrate: () => Promise<void> }` — расширяемо для будущих версий
- E2E тест: подготовить fixtures со старым форматом хуков (плоский `{type, command}`) и старым session-index → прогнать миграцию → проверить что list возвращает сессии

</specifics>

<deferred>
## Deferred Ideas

None — обсуждение осталось в рамках скоупа фазы

</deferred>

---

*Phase: 04-migration-final-integration*
*Context gathered: 2026-03-21*
