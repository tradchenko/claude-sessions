# Phase 2: Стабилизация ядра (адаптеры и сессии) - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Сделать все 5 агент-адаптеров надёжными — resume, list, restore работают корректно для каждого агента. Рефакторинг адаптеров с BaseAgentAdapter, структурированные ошибки, дедупликация сессий, стабильный TUI picker.

</domain>

<decisions>
## Implementation Decisions

### Рефакторинг адаптеров
- Извлечь BaseAgentAdapter класс с общей логикой (detect, path resolution, error wrapping)
- 4 адаптера (Claude, Codex, Qwen, Gemini) наследуют BaseAgentAdapter
- Companion — отдельный паттерн: НЕ наследует Base, а делегирует реальным адаптерам (композит). Имплементирует AgentAdapter интерфейс напрямую
- DI в конструктор только для fs-операций (readFile, readdir, stat). Позволяет мокать файловую систему в тестах
- AdapterError — класс extends Error с полями agentName, code, suggestion. Базовый класс оборачивает все ошибки в AdapterError автоматически

### Формат ошибок
- Структурированный формат для пользователя:
  ```
  ✘ Error: [что сломалось]
    Cause: [почему]
    Fix: [что делать]
  ```
- Режим отладки через --debug флаг (показывает stack traces)
- Раздельные exit codes: 0=успех, 1=общая ошибка, 2=session not found, 3=agent not installed, 4=повреждённые данные
- Локализация ошибок на все 11 языков (en, ru, es, fr, de, zh, zh-tw, ja, ko, pt, tr) через существующий i18n

### Дедупликация сессий
- Кросс-адаптерная дедупликация по session.id + session.project
- Приоритет у нативного адаптера (Claude > Companion)
- Restore идемпотентный: проверяет существование restore-context.md перед созданием, если есть — переиспользует
- Пустой list показывает полезное сообщение: "Сессий не найдено" + подсказка как начать
- Фильтр по неустановленному агенту: предупреждение "Qwen не установлен" + пустой список (не ошибка)

### TUI picker стабильность
- Обработка SIGWINCH — полная перерисовка при ресайзе терминала
- Ошибка resume внутри picker: показать в status bar / модальном окне. Пользователь остаётся в picker'е
- Кросс-платформенная поддержка: macOS (iTerm2, Terminal.app, Warp) + Linux (gnome-terminal, kitty) + Windows Terminal
- Навигация: ↑↓ навигация, Enter выбор, Tab фильтр по агенту, / поиск, q/Esc выход. Без vim-style

### Claude's Discretion
- Конкретная реализация BaseAgentAdapter (какие методы абстрактные, какие с дефолтной реализацией)
- Внутренняя структура AdapterError кодов (enum или строковые константы)
- Формат кеширования дедупликации
- Детали ANSI rendering при перерисовке

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **AgentAdapter интерфейс** (`src/agents/types.ts`): detect, loadSessions, getResumeCommand, isSessionAlive, getInstructionsPath
- **5 адаптеров** (`src/agents/claude.ts`, `codex.ts`, `qwen.ts`, `gemini.ts`, `companion.ts`): рабочие, нужна стабилизация
- **Registry** (`src/agents/registry.ts`): detectAgents, getActiveAdapters, readAgentsConfig
- **Session loader** (`src/sessions/loader.ts`): параллельная загрузка из всех адаптеров через Promise.allSettled
- **Session cache** (`src/sessions/cache.ts`): быстрый старт с 5-минутным TTL
- **i18n** (`src/core/i18n.ts`): 11 языков, автоопределение, fallback на en
- **Safe reads** (`src/utils/fs.ts`): safeReadJson, safeReadFile — Result type без исключений
- **JSONL parser** (`src/utils/jsonl.ts`): построчное чтение, buffer limit, BOM handling
- **TUI Picker** (`src/commands/picker.ts`, 23KB): полнофункциональный с поиском, фильтрацией, цветами

### Established Patterns
- Result type: `{ ok: true, data: T } | { ok: false, error: string }` — из Phase 1
- Graceful degradation: Promise.allSettled вместо Promise.all
- Fallback chains: JSONL → snapshot, unified index → legacy session-index.json
- Fixture-based тесты: матрица [5 агентов] × [valid/empty/missing/corrupted]

### Integration Points
- CLI entry: `claude-sessions` (picker), `list`, `restore`, `resume` команды
- Adapter detection: registry.ts → adapter.detect() для каждого
- Session loading: loader.ts → parallel adapter.loadSessions()
- Resume flow: picker.ts → adapter.getResumeCommand() → execFileSync

</code_context>

<specifics>
## Specific Ideas

- Phase 1 установила Result type и fixture-based тесты — продолжать тот же паттерн
- Companion как композит — отражает реальную природу (обёртка над реальными агентами)
- Структурированные ошибки по аналогии с Rust/Go — Error / Cause / Fix блоками
- Раздельные exit codes для скриптовой автоматизации

</specifics>

<deferred>
## Deferred Ideas

None — обсуждение осталось в рамках фазы

</deferred>

---

*Phase: 02-stabilize-core-adapters-sessions*
*Context gathered: 2026-03-20*
