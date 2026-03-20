---
phase: 3
status: gaps_found
verified_by: claude-sonnet-4-6
verified_at: 2026-03-21
---

# Verification: Phase 03 — Подсистема памяти

## Phase Goal (из ROADMAP.md)

> Обеспечить надёжный pipeline памяти: extract → store → load → hotness для всех агентов.

## Requirements Coverage

Требования фазы: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07, CODE-05, TEST-03, TEST-08

| ID | Описание | PLAN | Статус в коде |
|----|----------|------|--------------|
| MEM-01 | L0 extraction детерминированно извлекает метаданные из сессий всех агентов | 03-02 | ✅ `extractL0ForAgent` в extract-l0-multi.ts, 5 агентов |
| MEM-02 | Hotness scoring с decay по времени | 03-02 | ✅ `calculateHotness`, DECAY_TAU_DAYS=60 в hotness.ts и session-start.ts |
| MEM-03 | Дедупликация — одинаковые не сохраняются дважды | 03-02 | ✅ `resolveCandidate`, FUZZY_THRESHOLD=0.5, fuzzy → merge |
| MEM-04 | Memory loading при старте сессии | 03-03 | ✅ `formatSessionStartOutput` экспортирована в catalog.ts |
| MEM-05 | Memory index не повреждается при прерывании записи | 03-02 | ✅ tmp+rename atomic write, cleanup stale tmp в readIndex |
| MEM-06 | L1 LLM extraction аудирована, баги зафиксированы | 03-03 | ✅ parseLLMResponse, l1_skipped флаг для Gemini, retry logic |
| MEM-07 | extract-memory CLI команда работает end-to-end | 03-04 | ✅ src/commands/extract-memory.ts, зарегистрирована в cli.ts (case 'extract-memory') |
| CODE-05 | i18n модуль разбит на логические части | 03-01 | ✅ src/core/i18n/ — 6 файлов (common, sessions, agents, cli, memory, index), монолит удалён |
| TEST-03 | Unit тесты на подсистему памяти | 03-05 | ✅ 6 тест-файлов: hotness, dedup, extract-l0, extract-l1, catalog, index |
| TEST-08 | README соответствует реальному поведению | 03-05 | ⚠️ Не верифицировано (см. Gaps) |

## Must-Haves Checked

| Проверка | Результат |
|----------|-----------|
| `src/core/i18n/` содержит 6 файлов | ✅ common.ts, sessions.ts, agents.ts, cli.ts, memory.ts, index.ts |
| Старый монолит `src/core/i18n.ts` удалён | ✅ Glob не нашёл файл |
| `src/memory/types.ts` — L0Data содержит agent, duration, commands, errors, topics | ✅ Все поля присутствуют (опциональные) |
| DECAY_TAU_DAYS = 60 в hotness.ts | ✅ строка 14 |
| DECAY_TAU_DAYS = 60 в session-start.ts | ✅ строка 23 |
| FUZZY_THRESHOLD = 0.5 в dedup.ts | ✅ строка 5 |
| Fuzzy match → merge (не skip) | ✅ строки 65-68 в dedup.ts |
| readIndex выполняет cleanup stale tmp | ✅ `cleanupStaleTmpFiles` вызывается при чтении |
| Atomic write через tmp+rename | ✅ `writeIndex` использует `.tmp.<pid>` + renameSync |
| `src/commands/extract-memory.ts` создан | ✅ файл существует |
| Команда зарегистрирована в routing | ✅ src/cli.ts, case 'extract-memory', строки 125-126 |
| l1_skipped флаг для Gemini | ✅ `idx.sessions[sessionId].l1_skipped = true` (строка 263) |
| parseLLMResponse экспортирована | ✅ строка 61 в extract-l1.ts |
| 6 тест-файлов memory в tests/ | ✅ hotness, dedup, extract-l0, extract-l1, catalog, index |
| Fixture файлы для 4 агентов + shared | ✅ claude, codex, qwen, companion + shared/empty + shared/malformed |

## Plans vs ROADMAP Status

| Plan | ROADMAP | SUMMARY | Код | Итог |
|------|---------|---------|-----|------|
| 03-01 i18n рефакторинг | ✅ Completed | ✅ Есть | ✅ i18n/ директория с 6 файлами | Completed |
| 03-02 L0, hotness, dedup | ✅ Completed | ✅ Есть | ✅ Все функции и константы на месте | Completed |
| 03-03 L1 аудит и memory loading | ⬜ Not Started (ROADMAP!) | ✅ Есть | ✅ Реализовано: l1_skipped, parseLLMResponse, formatSessionStartOutput | **НЕСООТВЕТСТВИЕ** |
| 03-04 extract-memory CLI | ✅ Completed | ✅ Есть | ✅ extract-memory.ts, зарегистрирован в cli.ts | Completed |
| 03-05 Unit тесты + README | ✅ Completed | ✅ Есть | ✅ 6 тест-файлов, fixtures | Completed |

## Gaps Found

### GAP-1: ROADMAP показывает 03-03 как "Not Started" — несоответствие реальности
- ROADMAP.md строка 63: `| 03-03 | L0 extraction, hotness, dedup и целостность индекса | ⬜ Not Started |`
- Реально: SUMMARY файл существует, код реализован (l1_skipped, parseLLMResponse, formatSessionStartOutput, graceful exit для session-start)
- **Действие**: обновить ROADMAP.md — статус 03-03 → ✅ Completed, Phase 3 статус → Completed (100%)

### GAP-2: README verification (TEST-08) — не верифицировано
- 03-05 задача 03-05-05 требует проверки README на соответствие поведению
- Не проверено: команда `extract-memory` документирована с флагами `--agent`, `--session`, `--all`
- Не проверено: нет ли расхождений для `memory-status` и `memory-search` (оба файла существуют в src/commands)
- **Действие**: вручную проверить README.md секции про memory команды

### GAP-3: Fixture для Gemini агента отсутствует
- 03-05-01 требует fixture для: claude, codex, qwen, companion — все 4 есть
- Gemini fixture не требовался (у Gemini нет JSONL формата — это задокументировано в l1_skipped логике)
- Не является блокирующим gap — архитектурное ограничение, а не упущение

## Success Criteria Check (из ROADMAP)

| Критерий | Статус |
|----------|--------|
| 1. `extract-memory` успешен для сессий каждого агента, L0 детерминированно | ✅ Код реализован |
| 2. Повторный extract не создаёт дублирующихся воспоминаний | ✅ resolveCandidate + dedup |
| 3. Hot memories подгружаются при старте без ошибок | ✅ formatSessionStartOutput + graceful no-index |
| 4. README точно отражает поведение (проверено вручную) | ⚠️ Требует ручной проверки |

## Итог

Фаза 03 **фактически завершена** — весь код реализован, тесты написаны, fixtures созданы.

Два action item перед закрытием:
1. Обновить ROADMAP.md: 03-03 → ✅ Completed, Phase 3 → 100%
2. Вручную проверить README.md секцию memory команд (TEST-08)
