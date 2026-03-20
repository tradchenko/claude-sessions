# Phase 3: Подсистема памяти — Research

**Researched:** 2026-03-20
**Phase:** 03-memory-subsystem
**Requirements:** MEM-01..07, CODE-05, TEST-03, TEST-08

---

## 1. Current State Analysis

### Что существует

| Файл | Статус | Описание |
|------|--------|----------|
| `src/memory/hotness.ts` | Существует | `calculateHotness`, `recalculateAll`, `CATEGORY_WEIGHTS` |
| `src/memory/dedup.ts` | Существует | `jaccardSimilarity`, `findMatch`, `mergeContent`, `resolveCandidate` |
| `src/memory/index.ts` | Существует | `readIndex`, `writeIndex` (уже atomic!), `acquireLock`, `releaseLock` |
| `src/memory/extract-l0.ts` | Существует | `extractL0FromMessages`, `extractFilePaths` — только summary/files/messageCount |
| `src/memory/extract-l0-multi.ts` | Существует | Парсеры для codex/qwen/gemini/companion — 5 форматов |
| `src/memory/extract-l1.ts` | Существует | `buildExtractionPrompt`, `parseLLMResponse`, spawnSync pipeline |
| `src/memory/catalog.ts` | Существует | `generateCatalog`, `selectHotMemories`, `formatSessionStartOutput` |
| `src/commands/extract-memory.ts` | **ОТСУТСТВУЕТ** | CLI команда нужно создать с нуля |
| `src/hooks/session-start.ts` | Существует | Standalone скрипт — дублирует hotness/catalog логику |
| `src/core/i18n.ts` | Существует | Монолитный файл, ~2132 строки, все строки в одном месте |

### Что уже сделано в Phase 2
- `atomic write` в `writeIndex` — **уже реализован** (`tmp.${pid}` + `renameSync`) ✓
- `acquireLock`/`releaseLock` — **уже реализованы** с PID-проверкой живого процесса ✓
- Result type, DI через FsDeps, AdapterError — паттерны уже устоялись ✓
- 213 тестов зелёные, `node:test` + `node:assert/strict` ✓

---

## 2. Технический подход по каждому требованию

### MEM-01: L0 extraction детерминированность (все 5 агентов)

**Проблема:** `extractL0FromMessages` возвращает `{ summary, project, messageCount, files, timestamp }`. Поля `topics`, `agent`, `duration`, `commands`, `errors` — **отсутствуют** в L0Data.

**Решение:**
1. Расширить интерфейс `L0Data` в `src/memory/types.ts`:
   ```ts
   agent?: string;
   duration?: number; // мс между первым и последним сообщением
   commands?: string[]; // bash/tool invocations
   errors?: string[]; // error lines from session
   topics?: string[];
   ```
2. Обновить `extractL0FromMessages` — добавить extraction команд и ошибок из текста (regex или tool_use поля).
3. Каждый агентский парсер в `extract-l0-multi.ts` передаёт `agentId` в результат.
4. **Детерминированность** — `Date.now()` в timestamp нарушает её. Если timestamp есть в данных сессии — брать оттуда; иначе брать из mtime файла.
5. Fixture matrix: `tests/fixtures/{agent}/{edge-case}.jsonl` + эталонные `*.expected.json`.

### MEM-02: Hotness scoring с decay по времени

**Проблема:** `DECAY_TAU_DAYS = 30` в двух местах — в `src/memory/hotness.ts` и в `src/hooks/session-start.ts` (standalone). Нужно менять в обоих, иначе расхождение.

**Решение:**
1. В `hotness.ts` — изменить `DECAY_TAU_DAYS` с 30 на **60**.
2. В `session-start.ts` — синхронно обновить ту же константу (standalone копия логики).
3. Текущие веса `frequency=0.4, recency=0.3, relevance=0.3` — **оставить** (соответствуют CONTEXT.md).
4. Добавить тест: `calculateHotness` с датой 60 дней назад даёт `recencyScore ≈ 0.37` (exp(-1)).

### MEM-03: Дедупликация — одинаковые не сохраняются дважды

**Текущее состояние:** `dedup.ts` уже реализует `findMatch` с exact/fuzzy стратегиями.

**Проблема 1:** `FUZZY_THRESHOLD = 0.6` — пропускает дубли с similarity 0.5-0.6. По CONTEXT.md нужен **агрессивный threshold 0.5-0.6**.
- Снизить `FUZZY_THRESHOLD` с `0.6` до `0.5`.

**Проблема 2:** В `extract-l1.ts` при `resolution.action === 'fuzzy'` — **skip** (не merge). Это нарушает требование merge стратегии из CONTEXT.md.
- Исправить: при fuzzy match выполнять merge вместо skip.

**Проблема 3:** `EXACT_SKIP_THRESHOLD = 0.8` — если точное совпадение и similarity > 0.8, skip. Логика корректна, оставить.

### MEM-04: Memory loading при старте сессии

**Текущее состояние:** `src/hooks/session-start.ts` — standalone скрипт, дублирует логику hotness/catalog. `formatSessionStartOutput` в `catalog.ts` — правильная реализация.

**Проблема:** Два отдельных места с одной логикой. Если hotness меняется — нужно обновлять оба.

**Решение:** Session-start hook остаётся standalone (не может импортировать пакет — запускается из `~/.claude/scripts/`). Но при изменении tau/weights нужно синхронизировать оба файла в одном коммите.

**Тест MEM-04:** mock index → вызвать `formatSessionStartOutput` → проверить что hot memories присутствуют в выводе без ошибок.

### MEM-05: Целостность индекса при прерывании

**Текущее состояние:** `writeIndex` в `src/memory/index.ts` уже реализует:
```ts
const tmpPath = `${indexPath}.tmp.${process.pid}`;
writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
renameSync(tmpPath, indexPath);
```

**Статус: РЕАЛИЗОВАНО** в Phase 2. Требует только тестового покрытия (TEST-03).

**Потенциальный риск:** `tmp` файлы могут остаться при crash до `rename`. Добавить cleanup при `readIndex` — если `*.tmp.*` файл старше 5 минут, удалить.

### MEM-06: L1 LLM extraction аудит и известные баги

**Найденные проблемы в `extract-l1.ts`:**

1. **Нет retry:** если `spawnSync` вернул `status !== 0` — сразу `throw new Error`. Нет ни одной повторной попытки.
2. **parseLLMResponse:** regex `\[[\s\S]*\]` — возьмёт первый `[...]` в ответе. Если LLM выдал текст перед JSON — корректно. Если LLM выдал markdown с `[link]` до JSON — возьмёт неправильный фрагмент.
3. **HEAD_COUNT=15, TAIL_COUNT=35** — только 50 сообщений из сессии. Для длинных сессий может пропустить важные паттерны из середины. Документировать как known limitation.
4. **Gemini skip:** `if (agentId === 'gemini') process.exit(0)` — правильно, Gemini не имеет JSONL. Но нет записи в `extraction_failed` или `l1_skipped` поле. При повторных вызовах будет снова `process.exit(0)`.
5. **fuzzy skip вместо merge** (см. MEM-03 выше) — ошибка в логике resolve.
6. **Нет валидации схемы кандидата:** `candidate.content` может быть пустой строкой — такой кандидат попадёт в индекс.

**Фиксы в рамках фазы:**
- Добавить `l1_skipped` флаг для Gemini в index.sessions
- Исправить fuzzy→merge
- Добавить фильтр пустого content в `parseLLMResponse`
- Улучшить regex для JSON: искать `\[` с учётом предшествующего контекста

### MEM-07: extract-memory CLI команда (end-to-end)

**Статус: ФАЙЛ ОТСУТСТВУЕТ.** `src/commands/extract-memory.ts` — нужно создать.

**Что нужно:**
1. `src/commands/extract-memory.ts` — CLI точка входа.
2. Принимает аргументы: `--agent <agentId>` (опционально), `--session <id>` (опционально), `--all` флаг.
3. Запускает L0 extraction → сохраняет в `index.sessions` → запускает L1 (spawnSync на `extract-l1.ts`).
4. Вывод: прогресс + итоговая статистика (N sessions processed, M memories extracted).
5. Exit code 0 на успех, non-zero на ошибку.
6. Интеграция с `src/commands/index.ts` (routing).

**Поток:**
```
extract-memory → loadSessions() → for each → L0 → store in index.sessions
                → checkPendingExtractions() → spawn extract-l1 per pending session
```

### CODE-05: i18n рефакторинг

**Текущее состояние:** `src/core/i18n.ts` — монолит ~2132 строки, все языки для всех доменов.

**Решение (согласно CONTEXT.md):**
```
src/core/i18n/
  ├── common.ts     # today, yesterday, daysAgo, noDescription, msgs
  ├── sessions.ts   # noSessionsFound, recentSessions, searchResults, picker strings
  ├── agents.ts     # agentNotInstalled, resumeError, и т.д.
  ├── cli.ts        # cli помощь, usage strings
  └── memory.ts     # memory-specific строки (если есть)
```

**Стратегия миграции:**
1. Создать новые файлы в `src/core/i18n/`.
2. Обновить все импорты по всему проекту за один коммит.
3. Удалить `src/core/i18n.ts`.
4. Нет re-export для backward compat — clean break.

**Риск:** Много импортов `from '../core/i18n.js'` по всему проекту — нужно grep всех.

### TEST-03: Unit тесты на подсистему памяти

**Что нужно покрыть:**

| Модуль | Тест |
|--------|------|
| `hotness.ts` | `calculateHotness` с разными датами/частотами, `recalculateAll`, tau=60 |
| `dedup.ts` | `jaccardSimilarity` граничные случаи, `findMatch` exact/fuzzy/none, `mergeContent`, `resolveCandidate` |
| `index.ts` | `writeIndex` atomic (tmp file проверка), `acquireLock`/`releaseLock` race |
| `extract-l0.ts` | `extractFilePaths` regex, `extractL0FromMessages` детерминированность |
| `extract-l0-multi.ts` | Fixture matrix 5 агентов × edge cases |
| `extract-l1.ts` | `buildExtractionPrompt` формат, `parseLLMResponse` valid/invalid JSON |
| `catalog.ts` | `generateCatalog` пустой индекс, `selectHotMemories` проект-фильтр |

### TEST-08: README соответствует реальному поведению

**Что проверить вручную (checklists в PLAN):**
1. `claude-sessions extract-memory` — команда работает end-to-end.
2. Флаги `--agent`, `--session`, `--all` — документированы и работают.
3. Описание pipeline L0→L1 в README корректно.

---

## 3. Зависимости и риски

### Зависимости

| Зависит от | Что нужно | Статус |
|------------|-----------|--------|
| Phase 1 (аудит) | `src/utils/`, `node:test` инфраструктура | Завершено ✓ |
| Phase 2 (ядро) | DI FsDeps, BaseAgentAdapter, AdapterError | Завершено ✓ |
| `src/sessions/loader.ts` | `loadSessions()` для extract-memory CLI | Существует ✓ |
| Claude CLI (`/usr/local/bin/claude`) | L1 extraction | Runtime dependency |

### Риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| i18n миграция ломает импорты | Высокая | grep всех импортов, один коммит-миграция |
| session-start.ts расходится с hotness.ts | Средняя | Обновлять синхронно, тест на константы |
| L1 parseLLMResponse ловит не тот JSON | Средняя | Улучшить regex, добавить тест на markdown ответы |
| extract-memory CLI — нет routing entry | Высокая | Проверить src/commands/index.ts routing |
| Gemini l1_ready никогда не выставляется | Низкая | Добавить l1_skipped флаг |
| tmp файлы после crash засоряют директорию | Низкая | Cleanup в readIndex |

---

## 4. Архитектурные рекомендации

### Порядок реализации

1. **Сначала тесты** (правило проекта): fixtures для L0, unit тесты для hotness/dedup/catalog.
2. **L0 expansion** (MEM-01): добавить поля agent/duration/commands/errors в типы и парсеры.
3. **Hotness tau fix** (MEM-02): tau=60 в обоих файлах (hotness.ts + session-start.ts) атомарно.
4. **Dedup fix** (MEM-03): threshold 0.5, fuzzy→merge.
5. **L1 audit** (MEM-06): баги, Gemini флаг, content validation.
6. **extract-memory CLI** (MEM-07): новый файл + routing.
7. **i18n split** (CODE-05): последним — большой рефакторинг, лучше после стабилизации логики.

### Структура тестов

```
tests/
  memory-hotness.test.mjs      # calculateHotness, recalculateAll, tau
  memory-dedup.test.mjs        # jaccard, findMatch, merge, threshold
  memory-index.test.mjs        # atomic write, lock acquire/release
  memory-extract-l0.test.mjs   # filePaths regex, l0 deterministic
  memory-extract-l1.test.mjs   # buildPrompt, parseLLMResponse
  memory-catalog.test.mjs      # generateCatalog, selectHotMemories
  fixtures/
    memory/
      claude/basic.jsonl
      codex/basic.jsonl
      qwen/basic.jsonl
      companion/basic.jsonl
      shared/empty.jsonl
      shared/malformed.jsonl
```

### Паттерны из проекта (обязательно соблюдать)

- Все публичные функции возвращают `Result<T>` или `void` + throw → catch в CLI.
- DI через параметры (FsDeps) — не глобальный fs.
- `node:test` + `node:assert/strict` — никаких внешних test runners.
- Prettier: tabWidth=3, singleQuote=true, printWidth=180.

---

## 5. Validation Architecture (для TEST планирования)

### Unit тесты (автоматические)

| Тест | Метод | Assertion |
|------|-------|-----------|
| `hotness tau=60` | вызвать с датой 60 дней назад | recencyScore ≈ 0.368 |
| `dedup exact match` | candidate с существующим key | action=skip или merge |
| `dedup fuzzy 0.5` | два похожих текста | findMatch возвращает fuzzy |
| `atomic write` | writeIndex → проверить что tmp не остался | no `*.tmp.*` files |
| `parseLLMResponse` | markdown с JSON внутри | корректный массив |
| `parseLLMResponse` | пустой ответ LLM | пустой массив `[]` |
| `L0 deterministic` | два вызова на одних данных | идентичные результаты |
| `L0 agent fields` | claude session JSONL | agent='claude' в L0Data |

### Integration тесты (TEST-08)

- `extract-memory --help` → правильный usage.
- `extract-memory --all` на пустом индексе → exit 0, "0 sessions processed".
- `extract-memory --session <id>` → L0 сохраняется в index.json.

### README verification (ручная)

- Команды из README выполнить буквально, сравнить вывод с документацией.
- Особое внимание: флаги extract-memory, формат вывода memory-status, memory-search.

---

*Research completed: 2026-03-20*
*Knowledge base source: batch:Memory files,Commands,Utils,Hooks,Tests memory,...*
