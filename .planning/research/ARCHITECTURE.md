# Архитектурные рекомендации: CLI Session Manager

## Adapter Pattern Best Practices

### Сокращение дублирования между 5 адаптерами

Выделить базовый абстрактный класс `BaseAgentAdapter` с общим поведением:

```
BaseAgentAdapter
  ├── abstract detectInstall(): Promise<boolean>
  ├── abstract listSessions(): Promise<Session[]>
  ├── abstract resumeSession(id: string): Promise<void>
  ├── protected parseJsonlFile(path: string): AsyncIterable<unknown>   // общий
  ├── protected safeReadJson<T>(path: string, fallback: T): Promise<T> // общий
  └── protected normalizePath(raw: string): string                     // общий
```

Специфика агента — только в конкретном классе. Общие утилиты не дублируются.

Альтернатива без наследования: **стратегия через composition** — `AdapterRegistry` принимает конфиг-объект с функциями. Предпочтительно для тестирования (легче мокать отдельные функции).

### Дизайн интерфейса для тестируемости

- Вводить зависимости через конструктор: `new ClaudeAdapter({ fs, paths, exec })`.
- Все файловые операции проходят через инжектируемый `fs`-модуль — не через прямые вызовы `node:fs`.
- Путь к домашней директории (`~/.claude`, `~/.codex`) — параметр, не захардкоженный. Тесты передают `tmpdir`.
- Результат `listSessions()` — чистый массив DTO, без side effects.

### Error boundary на уровне адаптера

Каждый публичный метод адаптера оборачивать в `AdapterError` с полем `agentName`:

```
try { ... } catch (cause) {
  throw new AdapterError('claude', 'listSessions', cause)
}
```

CLI-уровень ловит `AdapterError` и выводит локализованное сообщение без stack trace для пользователя. Stack trace — только при `--debug`.

---

## Session Management Architecture

### Надёжная загрузка сессий (повреждённые/отсутствующие файлы)

Паттерн **"graceful degradation per source"**:

1. Обнаружение установленных агентов — никогда не бросать исключения, возвращать `detected: false`.
2. Парсинг каждого источника сессий — обернуть в try/catch, возвращать `{ sessions: [], error: ParseError }`.
3. Финальный список — union валидных сессий из всех источников. Частичные ошибки логируются, не падают.

Для JSONL: читать построчно, пропускать невалидные строки с счётчиком `skippedLines`. Если `skippedLines / total > 0.5` — поднимать предупреждение.

### Стратегии дедупликации при restore

Проблема: после restore сессия появляется дважды — оригинал и восстановленная копия.

Решение: **content-hash deduplication**:
- Ключ дедупликации = `hash(agentName + sessionId + firstMessageTimestamp)`.
- При загрузке списка — фильтровать по ключу, оставляя последнюю по `mtime`.
- Альтернатива: флаг `restoredFrom: string` в метаданных сессии, фильтр на стороне `list`.

### Паттерны инвалидации кэша

- Кэш сессий хранить с полем `cachedAt: timestamp` и `sourcesMtime: Record<agentName, number>`.
- При загрузке — сравнивать `mtime` файлов источников с `sourcesMtime`. Если расходятся — инвалидировать.
- TTL как fallback: кэш не старше 5 минут всегда валиден (избегает stat() на каждый запуск).

---

## Memory System Architecture

### Pipeline: extract → store → load → score

```
extract(session)
  ├── L0: regex/heuristic extraction (быстро, без LLM)
  │     → title, tags, timestamps, file paths, commands
  └── L1: LLM semantic extraction (медленно, опционально)
        → summary, decisions, key facts

store(memories)
  └── append-only JSONL + индекс по sessionId

load(context)
  ├── фильтр по агенту и дате
  └── ранжирование по hotness score

score(memory) → float
  └── hotness = recencyWeight * decay(age) + accessWeight * accessCount + tagMatchWeight * tagOverlap
```

### Идемпотентность извлечения

- Перед L0/L1 extraction проверять: существует ли запись `{ sessionId, extractedAt }` в индексе.
- Если да — пропускать, если только не передан флаг `--force-reextract`.
- L1 extraction: хранить хэш входного контента. Повторный запуск с тем же контентом — no-op.

### Алгоритмы hotness scoring

**Exponential decay (рекомендуется)**:
```
hotness = baseScore * e^(-λ * daysSinceAccess)
```
`λ ≈ 0.1` — половина жизни ~7 дней.

**Альтернатива — Hacker News formula** (проще объяснить):
```
hotness = (accessCount - 1) / (ageHours + 2)^gravity
```
`gravity = 1.8` — стандартное значение.

Практические соображения:
- Хранить `accessCount` и `lastAccessedAt` — обновлять при каждом `load`.
- Буст за tag-overlap с текущим контекстом: `+0.2` за каждый совпавший тег.
- Максимум памятей для подгрузки: 20 записей, отсортированных по убыванию hotness.

---

## Migration Architecture

### Версионированная схема конфига

```json
{ "schemaVersion": 3, ... }
```

- Каждый модуль читает конфиг через `loadConfig(path)` — функция применяет все миграции от текущей версии до целевой.
- Миграции — массив `[{ version, up(config) }]`, применяются последовательно.
- Перед записью мигрированного конфига — атомарная замена (`write tmp → rename`).

### Безопасные postinstall хуки

Принципы:
1. **Idempotent**: повторный запуск `postinstall` не ломает уже мигрированную установку.
2. **Non-destructive**: читать → мигрировать → писать. Никогда не удалять без backup.
3. **Fail-silent с логом**: если postinstall упал — установка пакета не падает, ошибка пишется в `~/.claude-sessions/migration.log`.
4. **Версионный guard**: если `schemaVersion >= currentVersion` — пропустить, не выполнять повторно.

Структура скрипта:
```
scripts/postinstall.ts
  ├── readExistingConfig() → Config | null
  ├── detectSchemaVersion(config) → number
  ├── runMigrations(config, fromVersion, toVersion) → Config
  ├── writeConfig(config) → void  // атомарно
  └── updateHooks() → void        // только если формат хуков изменился
```

### Стратегии rollback

- Перед миграцией: `cp config.json config.json.bak-v{N}`.
- Максимум 3 backup-файла — ротация старых.
- При ошибке миграции: восстановить из `.bak`, записать в лог, выйти с кодом 0 (не ломать `npm install`).

---

## Testing Architecture

### Тестовая пирамида для CLI-инструментов

```
         ┌──────────────────┐
         │  E2E / smoke (5) │  — реальный subprocess, реальная FS
         ├──────────────────┤
         │  Integration(15) │  — spawn CLI, tmpdir, фиктивные файлы агентов
         ├──────────────────┤
         │   Unit tests     │  — изолированные модули, моки FS
         │     (70+)        │
         └──────────────────┘
```

Unit тесты покрывают: каждый адаптер, парсеры JSONL, migration runner, hotness scorer, i18n keys.

### Стратегии мокирования файловой системы

**Подход 1 — инъекция fs (рекомендуется)**:
```ts
// production
const adapter = new ClaudeAdapter({ fs: node_fs, homedir: os.homedir() })
// test
const adapter = new ClaudeAdapter({ fs: memfs, homedir: '/tmp/test' })
```

**Подход 2 — tmpdir с реальной FS**:
```ts
beforeEach(() => { testDir = mkdtempSync('/tmp/cs-test-') })
afterEach(() => { rmSync(testDir, { recursive: true }) })
```
Проще для integration тестов, не требует memfs.

### Интеграционные тесты для multi-agent систем

- Фикстуры: по одной директории на агента (`fixtures/claude/`, `fixtures/codex/`, ...).
- Тест `list` — populate tmpdir из фикстур, запустить CLI как subprocess, сравнить stdout.
- Тест `resume` — мокировать `exec`/`spawn` через sinon или нативный `--experimental-vm-modules`.
- Матрица тестов: `[agent] × [command] × [edge case]` — parameterized tests через `test.each`.

### Fixture-based тестирование для JSONL-парсинга

Структура фикстур:
```
fixtures/jsonl/
  ├── valid-session.jsonl          — нормальный случай
  ├── corrupted-line.jsonl         — одна невалидная строка
  ├── empty.jsonl                  — пустой файл
  ├── truncated.jsonl              — обрезанный посередине
  └── large-session.jsonl          — 1000+ строк, для perf
```

Каждая фикстура сопровождается `*.expected.json` — ожидаемый результат парсинга. Тест читает фикстуру, парсит, сравнивает с expected.

---

## Suggested Build Order

### Зависимости между шагами рефакторинга

```
1. Инфраструктура тестов (vitest config, tmpdir helpers, fixtures)
   └── нужна для всего остального

2. Базовые утилиты (safeReadJson, parseJsonlFile, normalizePath)
   └── используются во всех адаптерах

3. BaseAgentAdapter + рефакторинг адаптеров по одному
   ├── Claude (самый стабильный — эталон)
   ├── Codex
   ├── Qwen
   ├── Gemini
   └── Companion

4. Session deduplication + кэш инвалидация
   └── зависит от стабильных адаптеров

5. Memory pipeline (extract → store → load → score)
   └── независимо от адаптеров, но нужны unit тесты сначала

6. Migration runner + postinstall
   └── последним — не должен ломать стабилизированные модули

7. Integration tests на CLI-команды
   └── финальная проверка всей системы
```

### Что стабилизировать первым

**Приоритет 1 — тест-инфраструктура**: без неё нет уверенности ни в одном изменении.

**Приоритет 2 — `safeReadJson` и JSONL-парсер**: эти утилиты используются везде. Баг здесь — системный.

**Приоритет 3 — адаптер Claude**: наибольшая пользовательская база, самый изученный формат. Служит эталоном для остальных адаптеров.

**Последним — migration/postinstall**: самый рискованный для существующих установок. Писать только после полного покрытия тестами остальных модулей.

---
*Создано: 2026-03-20 | Проект: claude-sessions audit/stabilization*
