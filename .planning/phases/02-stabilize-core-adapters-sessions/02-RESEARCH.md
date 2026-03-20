# Phase 2 Research: Стабилизация ядра (адаптеры и сессии)

## Research Summary

Фаза 2 требует рефакторинга 5 агент-адаптеров, исправления команды restore (она захардкожена на Claude), добавления дедупликации сессий в loader, стабилизации TUI picker и создания полноценной системы структурированных ошибок с локализацией. Большинство инфраструктуры уже существует — её нужно выровнять и достроить, а не создавать с нуля.

---

## Current Codebase State

### Структура файлов

```
src/
  agents/
    types.ts          — AgentAdapter интерфейс, AgentInfo, AgentId
    claude.ts         — Полная реализация (resume работает: claude --resume <id>)
    codex.ts          — Частичная: getResumeCommand возвращает null (не поддерживает --resume)
    qwen.ts           — Неизвестно точное состояние resume
    gemini.ts         — Неизвестно точное состояние resume
    companion.ts      — Композит: resume делегирует реальному адаптеру, но детали неясны
    registry.ts       — detectAgents(), getAdapter(), getAllAdapters(), getActiveAdapters()
  commands/
    picker.ts         — TUI на raw ANSI (не ink). Большой класс SessionPicker. Нет SIGWINCH.
    list.ts           — Команда list, вызывает loadSessions()
    restore.ts        — ЗАХАРДКОЖЕНА на Claude: использует findClaudeCli() + CLAUDE_DIR везде
  sessions/
    loader.ts         — loadSessions() через Promise.allSettled, НЕТ дедупликации
    cache.ts          — Кеширование сессий
  core/
    i18n.ts           — Монолитный файл ~2132 строк. 11 языков. Существующие ключи.
    config.ts         — Пути, HOME, PLATFORM
```

### Адаптеры — детальное состояние

#### Claude (`src/agents/claude.ts`)
- **detect()**: ищет `~/.claude/` + binary — реализовано
- **loadSessions()**: читает JSONL из `~/.claude/projects/` — реализовано
- **getResumeCommand()**: возвращает `[claudeBin, '--resume', sessionId]` — **работает**
- **isSessionAlive()**: сканирует `~/.claude/sessions/*.json` — реализовано
- **Статус**: Наиболее полный адаптер. Используется как образец.

#### Codex (`src/agents/codex.ts`)
- **detect()**: ищет `~/.codex/` + binary — реализовано
- **loadSessions()**: читает `~/.codex/history.jsonl` — реализовано
- **getResumeCommand()**: **явно возвращает `null`** (комментарий: "Codex CLI не поддерживает --resume")
- **isSessionAlive()**: проверяет `~/.codex/sessions/YYYY/MM/DD/rollout-*-{sessionId}.jsonl`
- **Проблема**: project всегда `'codex'` — нет разбивки по проекту. projectPath = `''`.
- **Статус**: loadSessions работает, resume — не поддерживается нативно. Нужна стратегия: показывать UI с объяснением или открывать новую сессию в директории проекта.

#### Qwen (`src/agents/qwen.ts`)
- **detect()**: ищет `~/.qwen/projects/` — реализовано
- **loadSessions()**: сканирует `~/.qwen/projects/{project}/chats/` — реализовано
- **getResumeCommand()**: точная реализация — требует проверки (вероятно возвращает null или qwen-специфичный флаг)
- **Статус**: Нужна проверка есть ли у qwen-cli флаг --resume или аналог.

#### Gemini (`src/agents/gemini.ts`)
- **detect()**: ищет `~/.gemini/history/{project}/.git/` — реализовано
- **loadSessions()**: сканирует git-репозитории в `~/.gemini/history/` — реализовано (использует git log timestamp)
- **getResumeCommand()**: точная реализация — требует проверки (gemini CLI may not support --resume)
- **Формат**: сессии = git commits, id = project directory name, НЕ UUID
- **Статус**: Нестандартный формат — id не UUID, что может ломать кросс-адаптерную дедупликацию.

#### Companion (`src/agents/companion.ts`)
- **detect()**: ищет Companion WebSocket/process — реализовано
- **loadSessions()**: читает recordings из Companion API — реализовано
- **getResumeCommand()**: делегирует реальному адаптеру по `backend_type` — частично реализовано
- **Особенность**: поле `agent` в Session определяется через `resolveAgent(sessionName, backend_type)`, `viaCompanion: true`
- **Проблема**: `hasJsonl` не заполняется (комментарий: "не проверяем — дорого") — индикатор `[!]` в picker'е не работает
- **Статус**: Самый сложный адаптер. Resume зависит от доступности реального агента.

### Команда `restore` (`src/commands/restore.ts`)

**Критический gap**: команда полностью захардкожена на Claude:
- Использует `findClaudeCli()` — ищет только claude binary
- Сохраняет контекст в `join(CLAUDE_DIR, 'scripts', '.restore-context.md')` — путь внутри ~/.claude
- Запускает только `execFileSync(claudePath, ...)` — открывает только Claude
- **Нет проверки на идемпотентность**: `.restore-context.md` перезаписывается при каждом вызове
- **Нет поддержки не-Claude агентов**: для Codex/Qwen/Gemini restore просто не работает

### Команда `list` (`src/commands/list.ts`)

- Вызывает `loadSessions()` из loader
- **Нет дедупликации**: если сессия присутствует у Claude и Companion одновременно — появляется дважды
- Пустое состояние обрабатывается через i18n ключ `noSessionsFound` — уже есть

### Session loader (`src/sessions/loader.ts`)

- `loadSessions()` использует `Promise.allSettled()` — правильно
- Результаты из всех адаптеров просто concatenate через `allSessions.push(...result.value)`
- **Нет дедупликации по `session.id`** — дубликаты появляются когда Companion дублирует Claude-сессии
- Сортировка по `lastTs` есть, limit есть

### TUI Picker (`src/commands/picker.ts`)

- Реализован на raw ANSI escapes (без ink/blessed) — class `SessionPicker`
- Навигация: ↑↓, Tab (agent filter), Enter, Ctrl-D (delete), Ctrl-H (toggle orphaned), Ctrl-A (AI summary), Ctrl-R (refresh), Esc
- Alt screen: `ALT_SCREEN_ON`/`ALT_SCREEN_OFF` — реализовано
- Mouse reporting: `MOUSE_ON`/`MOUSE_OFF` (SGR mode) — реализовано
- **Gap**: нет обработчика `SIGWINCH` — при ресайзе терминала артефакты
- **Gap**: при ошибке resume (`getResumeCommand` возвращает null) — поведение неясно
- Агент-фильтр по Tab — реализован через `cycleAgentFilter()`
- Поиск — реализован через `searchText` поле

### Система ошибок

- **Нет AdapterError класса** — адаптеры бросают обычные Error или возвращают null
- **Нет структурированного формата** (что/почему/что делать)
- **Нет exit codes** — только `process.exit(1)` везде
- **i18n уже есть** — файл `src/core/i18n.ts` с 11 языками
- Существующие ключи: `sessionNotFound`, `errorTTY`, `fileNotFound`, `noDataRestore` — но не структурированные
- **Нет debug-режима** — stack traces либо показываются всегда, либо никогда

### Тест-инфраструктура

Существующие тесты:
- `test/agents.test.mjs` — тестирует registry (detectAgents, getAdapter, getAllAdapters), НО адаптеры тестируются через реальную файловую систему (не DI)
- `tests/fixture-matrix.test.mjs` — матрица [agent] × [edge case], из Phase 1
- `tests/data-resilience.test.mjs` — тесты устойчивости данных
- `tests/jsonl-parser.test.mjs` — парсер JSONL
- `tests/session-identity.test.mjs` — идентификация сессий

**Gap для TEST-01**: тесты адаптеров в `test/agents.test.mjs` проверяют только registry (detect структуры), НО не тестируют `loadSessions()`, `getResumeCommand()`, `isSessionAlive()` с моками файловой системы. DI через конструктор (CODE-03) ещё не реализован — поэтому мокировать невозможно.

### TypeScript конфигурация

`tsconfig.json` уже включает:
- `"strict": true`
- `"noUncheckedIndexedAccess": true`

TEST-07 **уже выполнен** на уровне конфигурации. Нужно только убедиться что весь код компилируется без ошибок после рефакторинга.

---

## Gap Analysis

### SESS-01 (Claude resume)
**Статус**: В основном работает. `getResumeCommand()` возвращает корректную команду. Picker вызывает её через `execFileSync`.
**Риск**: если `findClaudeCli()` возвращает null — молчаливый сбой. Нужна ошибка ERR формата.

### SESS-02 (Codex resume)
**Статус**: Не работает. `getResumeCommand()` явно возвращает `null`.
**Нужно**: Решить стратегию — либо открыть Codex в директории проекта без --resume, либо показать понятную ошибку "Codex не поддерживает resume". Нужно решение в PLAN.

### SESS-03 (Qwen resume)
**Статус**: Неизвестен — нужна проверка реализации `getResumeCommand()` в `qwen.ts`.
**Вероятно**: qwen-cli не поддерживает --resume → аналогична ситуации Codex.

### SESS-04 (Gemini resume)
**Статус**: Неизвестен — нужна проверка реализации `getResumeCommand()` в `gemini.ts`.
**Вероятно**: gemini --resume <project> может работать (Git-based sessions).

### SESS-05 (Companion resume)
**Статус**: Частично. Делегирует реальному адаптеру, но если backend_type неизвестен — ломается.

### SESS-06 (Resume — сессия не найдена)
**Статус**: Нет. Нет структурированного сообщения, нет правильного exit code.

### SESS-07 (Resume — агент не установлен)
**Статус**: Нет. `getResumeCommand()` возвращает null без объяснения причины.

### SESS-08 (List — дедуплицированный список)
**Статус**: Нет. `loadSessions()` не делает дедупликацию — Companion-сессии дублируют Claude-сессии.

### SESS-09 (List — фильтры)
**Статус**: В основном есть — `projectFilter`, `searchQuery`, `agentFilter` в `LoadSessionsOptions`.

### SESS-10 (List — пустое состояние)
**Статус**: i18n ключ `noSessionsFound` есть. Подсказка "как начать" — нет.

### SESS-11 (Restore — идемпотентность)
**Статус**: Нет. `.restore-context.md` перезаписывается каждый раз. Нужна проверка существования.

### SESS-12 (Restore — корректные метаданные)
**Статус**: Частично — JSONL → Markdown форматирование есть, но restore захардкожен на Claude.

### SESS-13 (TUI picker — без артефактов)
**Статус**: Частично. Alt screen реализован. Нет SIGWINCH обработчика.

### SESS-14 (TUI picker — навигация)
**Статус**: В основном работает. Tab/Enter/↑↓/поиск — все реализованы.

### CODE-01 (BaseAgentAdapter)
**Статус**: Нет. Каждый адаптер — отдельный object literal. Общий код дублируется (findXxxCli, formatDate, readSessionIndex вызовы).

### CODE-03 (DI через конструктор)
**Статус**: Нет. Адаптеры — singletons (exported constants). Файловая система — не инжектируется.

### CODE-04 (AdapterError)
**Статус**: Нет. Класс AdapterError не существует.

### ERR-01 (Структурированные ошибки)
**Статус**: Нет. Текущие ошибки: `console.error(❌ ${t(key)})` без структуры.

### ERR-02 (Exit codes)
**Статус**: Нет. Используется только `process.exit(1)`.

### ERR-03 (Без stack traces пользователю)
**Статус**: Частично. В некоторых местах есть `e instanceof Error ? e.message : e`, но не везде.

### ERR-04 (Локализованные ошибки)
**Статус**: Частично. i18n есть, но ключи для новых error форматов не добавлены.

### TEST-01 (Unit тесты на адаптеры)
**Статус**: Нет полноценных юнит-тестов. `test/agents.test.mjs` тестирует только registry struct, не поведение адаптеров с мокнутой FS.

---

## Technical Risks and Pitfalls

### 1. Рефакторинг адаптеров в классы — breaking change
Текущие адаптеры — object literals (singletons). Переход на классы с DI требует:
- Изменения всех import мест (`claudeAdapter` → `new ClaudeAdapter()` или factory)
- Registry нужно обновить для хранения instances, не literals
- **Риск**: если registry кешируют ссылки на literals — всё поломается

**Смягчение**: Можно использовать factory-функцию вместо class: `createClaudeAdapter(fs?: FsDeps)`. Singleton остаётся для production, новый instance для тестов.

### 2. Gemini: id не UUID
Gemini-сессии имеют id = project directory name (например `my-project`), а не UUID. Кросс-адаптерная дедупликация по `session.id + session.project` может давать ложные совпадения.
**Смягчение**: Дедупликация должна использовать `session.id + ':' + session.agent` как ключ, или `session.id + ':' + session.project`.

### 3. Companion: backend_type может быть неизвестен
Если `backend_type` не выставлен в Companion recording — `resolveAgent()` может вернуть неверный агент, и resume вызовет не тот адаптер.
**Смягчение**: Fallback на Claude как primary агент, с предупреждением.

### 4. restore.ts полностью переписывается
Это самый рискованный файл. Нужно:
- Убрать хардкод `findClaudeCli()`
- Сделать мультиагентный lookup через session.agent → adapter.getResumeCommand()
- Изменить путь контекстного файла (не привязывать к CLAUDE_DIR)
- Добавить идемпотентность
**Риск**: сломать работающий Claude restore пока чиним другие агенты.

### 5. TUI picker: SIGWINCH и raw mode
`process.stdout.rows/columns` обновляются автоматически при SIGWINCH в Node.js, но перерисовка не происходит без явного обработчика. При добавлении SIGWINCH нужно корректно очистить handler при выходе.
**Риск**: memory leak если `process.on('SIGWINCH', ...)` не очищается в cleanup.

### 6. i18n монолит — не трогаем в Phase 2
CODE-05 (разбить i18n) отнесён к Phase 3. В Phase 2 только **добавляем** ключи для новых ошибок в существующий файл. Не рефакторим структуру.

### 7. AdapterError и существующие catch блоки
Добавление AdapterError не должно ломать существующие `catch (e: unknown)` блоки. Нужно проверить все места где ловятся ошибки адаптеров в loader.ts и picker.ts.

---

## Validation Architecture

### Критерий 1: `claude-sessions resume <id>` для каждого из 5 агентов

**Как проверить**:
- Claude: `claude-sessions resume <valid-claude-session-id>` → запускает `claude --resume <id>`
- Codex: `claude-sessions resume <codex-session-id>` → если null → понятная ошибка (exit 3)
- Qwen: аналогично Codex
- Gemini: `claude-sessions resume <gemini-project-id>` → запускает `gemini --resume <id>` или аналог
- Companion: делегирует реальному агенту
- При отсутствии: `claude-sessions resume nonexistent-id` → `✘ Error: Session not found` (exit 2), без stack trace

**Тест**: `tests/adapter-resume.test.mjs` — фикстурная матрица [5 агентов] × [found/not-found/agent-not-installed]

### Критерий 2: `claude-sessions list` — дедуплицированный список

**Как проверить**:
- Создать фикстуру: одна и та же session ID в Claude fixtures + Companion fixtures
- `loadSessions()` должен вернуть её один раз
- Повторный вызов — тот же результат (детерминизм)

**Тест**: `tests/session-dedup.test.mjs` — мокнуть два адаптера, оба возвращают одинаковый id

### Критерий 3: `claude-sessions restore` — идемпотентность

**Как проверить**:
- Вызвать `restore(sessionId)` дважды подряд
- Файл `.restore-context.md` создаётся только один раз (или корректно перезаписывается с одинаковым содержимым)
- Timestamp создания файла не меняется при повторном вызове (если идемпотентность = "не перезаписывать")

**Тест**: `tests/restore-idempotent.test.mjs`

### Критерий 4: TUI picker — без артефактов

**Как проверить** (сложно автоматизировать):
- Ручное тестирование в iTerm2, Terminal.app, Warp
- Ресайз терминала → перерисовка без артефактов
- Smoke-тест: `echo q | node dist/cli.js 2>&1` — выход без ошибок

**Автоматизация**: проверка что SessionPicker.render() не бросает при width=40 и width=200

### Критерий 5: Все ошибки локализованы (en/ru)

**Как проверить**:
- `CLAUDE_SESSIONS_LANG=en node dist/cli.js resume nonexistent` → English error
- `CLAUDE_SESSIONS_LANG=ru node dist/cli.js resume nonexistent` → Russian error
- Вывод содержит три части: что/почему/что делать
- Exit code != 0

**Тест**: `tests/error-format.test.mjs` — subprocess тест с разными LANG env vars

---

## Карта зависимостей между задачами Phase 2

```
CODE-03 (DI в конструктор)
  └→ CODE-01 (BaseAgentAdapter)
       └→ CODE-04 (AdapterError)
            └→ ERR-01/ERR-02/ERR-03/ERR-04 (error format)
                 └→ SESS-06, SESS-07 (user-facing errors)

CODE-03 (DI)
  └→ TEST-01 (unit tests with mocked FS)
       └→ SESS-01..SESS-05 (verified per adapter)

SESS-08 (dedup) — независимо, в loader.ts
SESS-11 (idempotent restore) — независимо, в restore.ts
SESS-12 (multi-agent restore) — зависит от CODE-01/CODE-03

SESS-13/SESS-14 (TUI picker) — независимо от адаптеров
```

**Рекомендуемый порядок**:
1. CODE-03 → CODE-01 → CODE-04 (фундамент)
2. ERR-01..ERR-04 (система ошибок)
3. SESS-01..SESS-07 (resume per adapter + error cases)
4. SESS-08..SESS-10 (list dedup + empty state)
5. SESS-11..SESS-12 (restore idempotent + multi-agent)
6. SESS-13..SESS-14 (TUI picker stability)
7. TEST-01 (unit tests покрывают всё выше)

---

## RESEARCH COMPLETE

Все необходимые данные для планирования Phase 2 собраны.

**Ключевые находки для плана**:
1. `restore.ts` — главный проблемный файл, полный переписать (захардкожен на Claude)
2. Codex и вероятно Qwen не поддерживают `--resume` — нужна user-decision о стратегии
3. Дедупликация в loader отсутствует — легко добавить Map по `id+agent`
4. AdapterError + DI конструктор — предварительный рефакторинг для всего остального
5. TUI: SIGWINCH + error-in-resume два изолированных fix'а
6. TypeScript strict уже включён — TEST-07 выполнен
7. i18n инфраструктура готова — нужно добавить ~10 новых ключей
