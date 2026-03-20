# Phase 3: Подсистема памяти - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Обеспечить надёжный pipeline памяти: extract → store → load → hotness для всех 5 агентов (Claude, Codex, Qwen, Gemini, Companion). Включает L0/L1 extraction, dedup, hotness scoring, catalog generation, CLI команду `extract-memory`, и рефакторинг i18n (CODE-05). Новые capabilities (MCP расширения, новые агенты) — вне скоупа.

</domain>

<decisions>
## Implementation Decisions

### L0 Extraction
- Максимальный набор полей best-effort: summary, project, messageCount, files, agent, duration, commands, errors
- Если парсер агента не умеет извлечь поле — оставить пустым, не ломать pipeline
- Детерминированность: повторный запуск на тех же данных — тот же результат
- Валидация через fixture matrix: [5 агентов] × [edge cases] с эталонными результатами

### L1 Extraction (LLM)
- Полный аудит: prompt, парсинг ответа, retry logic
- Фикс найденных багов в рамках фазы (не откладывать)
- spawnSync остаётся как механизм запуска (менять не нужно)

### Hotness и aging
- Веса: frequency=0.4 (доминирует), recency=0.3, relevance=0.3 — оставить текущие
- Decay tau увеличить с 30 до 60 дней — воспоминания живут дольше для долгих проектов
- Лимиты: top-30 в catalog, MAX=500 в индексе, prune до 400

### Стратегия дедупликации
- Агрессивный threshold (0.5-0.6) — лучше убрать дубль, чем засорить индекс
- Merge стратегия: объединить уникальное из обоих воспоминаний, hotness обновить
- Jaccard similarity на токенах — текущий подход достаточен

### Целостность индекса (MEM-05)
- Write-rename atomic: писать во временный файл, затем rename
- Crash-safe без внешних зависимостей (zero runtime deps)
- Существующий file locking (acquireLock/releaseLock) дополнить atomic write

### Разбивка i18n (CODE-05)
- Разбить по домену/модулю: src/core/i18n/ → memory.ts, sessions.ts, agents.ts, cli.ts, common.ts
- Прямой импорт: `import { memoryStrings } from './i18n/memory.js'` — tree-shakeable
- Удалить старый монолит i18n.ts, обновить все импорты за один коммит миграции

### Claude's Discretion
- Конкретные алгоритмы парсинга commands/errors для каждого агента
- Структура fixture-файлов для тестовой матрицы
- Детали реализации atomic write (tmp file naming, cleanup)
- Конкретная разбивка строк i18n по файлам

</decisions>

<specifics>
## Specific Ideas

- Decay tau=60 — проект claude-sessions долгосрочный, месячное затухание слишком агрессивное
- Best-effort philosophy для L0: лучше пустое поле чем сломанный pipeline
- i18n миграция — чистый срез, не оставлять backward compat re-export

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/memory/hotness.ts`: calculateHotness, recalculateAll, CATEGORY_WEIGHTS — нужно обновить tau
- `src/memory/dedup.ts`: jaccardSimilarity, findMatch, mergeContent, resolveCandidate — ядро дедупликации
- `src/memory/index.ts`: readIndex, writeIndex, acquireLock/releaseLock — нужно добавить atomic write
- `src/memory/extract-l0.ts` / `extract-l0-multi.ts`: L0 extraction — расширить набор полей
- `src/memory/extract-l1.ts`: buildExtractionPrompt, parseLLMResponse — аудит
- `src/memory/catalog.ts`: generateCatalog, selectHotMemories, formatSessionStartOutput
- `src/utils/result.ts`: Result<T>, ok(), err() — стандартный паттерн
- `src/utils/fs.ts`: safeReadFile, safeReadJson — файловые операции
- `src/utils/jsonl.ts`: parseJsonlLines, parseJsonlFile — парсинг JSONL

### Established Patterns
- Result type: `{ok: true, data: T} | {ok: false, error: string}` — все функции памяти
- DI через FsDeps — мокаемая файловая система для тестов
- AdapterError с `{code, message, agentName?, suggestion?}` — ошибки адаптеров
- Fixture-based тесты: матрица [агент] × [edge case] в tests/fixtures/
- node:test + node:assert/strict — тестовый фреймворк
- Promise.allSettled для параллельных загрузок

### Integration Points
- `src/hooks/session-start.ts` — standalone скрипт, дублирует hotness/catalog логику
- `src/commands/` — CLI команды (memory-status, memory-search, extract-memory, enable/disable)
- `src/sessions/loader.ts` — checkPendingExtractions() определяет сессии для L1
- `src/mcp/server.ts` — MCP сервер предоставляет memory tools

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-memory-subsystem*
*Context gathered: 2026-03-20*
