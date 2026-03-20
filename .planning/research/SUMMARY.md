# Research Summary: claude-sessions Audit & Stabilization

*Синтез четырёх исследовательских измерений. Дата: 2026-03-20.*

---

## Key Findings

### Recommended Stack

| Инструмент | Версия | Обоснование |
|------------|--------|-------------|
| `node:test` | Node.js ≥20 built-in | Zero deps constraint — встроенный runner, поддерживает ESM, async/await, subtests |
| `tsx` | `4.x` | Быстрый запуск TS без компиляции через esbuild; лучше ts-node для ESM в 2025 |
| `c8` | `10.x` | V8-native coverage, работает с ESM без трансформаций; nyc устарел |
| `typescript` | `5.5.x` | Строгий режим + `noUncheckedIndexedAccess` — критично для JSONL-парсинга |
| `eslint@9.x` + `@typescript-eslint@8.x` + `eslint-plugin-unicorn@55.x` | latest | Flat config, TS-специфичные правила, edge case detection без runtime deps |

Ключевые паттерны без внешних зависимостей: branded types для путей, type guards для JSONL-парсинга, Dependency Injection для fs.

### Table Stakes for Stabilization

Следующее должно работать надёжно — без этого пользователи уходят:

1. **Resume для всех 5 агентов** — core promise инструмента. Отказ 20% случаев уничтожает доверие. Зависит от корректного adapter layer.
2. **Session listing без дубликатов** — фильтрация по агенту/дате/ключевому слову, graceful empty states, без крэшей.
3. **Restore без дублирования** — known bug. Idempotency обязательна: restore дважды = тот же результат что и один раз.
4. **Graceful обработка повреждённых данных** — JSONL с невалидными строками, пустые файлы, отсутствующие директории → skip + log, не crash.
5. **Upgrade path без потери данных** — postinstall мигрирует hooks/config автоматически, тихо при успехе, громко при ошибке.
6. **Внятные сообщения об ошибках** — что сломалось, почему, что делать. Никаких stack traces для пользователя.

### Architecture Priorities

**Наиболее импактные цели рефакторинга:**

- **Session identity** — как сессия уникально идентифицируется across форматов. Лежит в основе list, restore dedup и resume. Ошибка здесь каскадирует во все фичи. **Аудитировать и зафиксировать первым.**
- **Shared utilities** (`safeReadJson`, `parseJsonlFile`, `normalizePath`) — используются всеми адаптерами. Баг здесь системный.
- **BaseAgentAdapter** — выделить общую логику, убрать дублирование между 5 адаптерами. DI через конструктор (`{ fs, paths, exec }`).
- **Error boundaries** — `AdapterError` с `agentName`, локализованные сообщения на CLI-уровне без stack trace.
- **Migration runner** — версионированная схема, idempotent, atomic writes, backup-before-migrate.

**Рекомендуемый порядок сборки:**

```
1. Тест-инфраструктура (node:test config, tmpdir helpers, JSONL fixtures)
2. Базовые утилиты (safeReadJson, parseJsonlFile, normalizePath) + branded types
3. BaseAgentAdapter + рефакторинг адаптеров по одному (Claude → Codex → Qwen → Gemini → Companion)
4. Session dedup + cache invalidation
5. Memory pipeline (extract → store → load → score)
6. Migration runner + postinstall
7. Integration tests на CLI-команды (финальная проверка)
```

### Critical Pitfalls

Топ-5 рисков по импакту:

| # | Риск | Импакт | Профилактика |
|---|------|--------|--------------|
| 1 | **Рефакторинг без тестов** | Регрессии у живых пользователей | Правило: тест пишется до любого изменения модуля |
| 2 | **Postinstall ломает существующие установки** | npm install завершается с ошибкой, потеря конфига | Всегда exit code 0; backup перед изменением; idempotency; ленивая миграция при первом запуске |
| 3 | **Big-bang перезапись адаптеров** | Долгая ветка, высокий риск регрессий | Strangler fig: один адаптер за итерацию, PR ≤ один модуль |
| 4 | **Scope creep — новые фичи вместо фиксов** | Milestone не шипится | Жёсткий out-of-scope список; новые идеи → issue с меткой `post-stabilization` |
| 5 | **JSONL edge cases** — truncated, empty, UTF-8 BOM, файл заблокирован агентом | Silent data loss или crash | Fixture-based тесты на каждый edge case; парсеры возвращают `Result<T, Error>`, не бросают |

Дополнительные риски: race conditions в memory store (atomic write + advisory lock), config migration перезаписывает пользовательские поля (merge не replace), LLM extraction недетерминирована (strict JSON schema + fallback к L0).

### Phase Mapping

**Phase 1 — Аудит (до любых изменений)**
- Написать характеристические (golden) тесты на текущее поведение
- Настроить TypeScript строгий режим + ESLint — находит баги без рефакторинга
- Аудит session identity, путей агентов, JSONL edge cases
- Зафиксировать out-of-scope список

**Phase 2 — Стабилизация ядра**
- Базовые утилиты + branded types + type guards
- Рефакторинг адаптеров по одному через BaseAgentAdapter
- Session dedup fix (content-hash deduplication)
- Unit тесты: матрица `[agent] × [command] × [edge case]`

**Phase 3 — Migration & Resilience**
- Migration runner с versioned schema
- Postinstall: idempotent, atomic, fail-silent с логом, ленивая миграция
- Memory pipeline: hotness scoring, dedup, extraction idempotency
- Integration тесты на CLI-команды как subprocess

---

## Consensus & Conflicts

### Где все измерения согласны

- **Тест-инфраструктура первой** — без неё нельзя ничего менять безопасно (STACK, ARCHITECTURE, PITFALLS)
- **Zero deps — жёсткое ограничение** — не нарушать, все инструменты devDependencies (STACK, FEATURES)
- **Session identity — критический cross-cutting concern** — аудитировать раньше всего (FEATURES, ARCHITECTURE, PITFALLS)
- **Один модуль за итерацию** — все источники против big-bang рефакторинга (PITFALLS, ARCHITECTURE)
- **Graceful degradation обязательна** — ни один сбой не должен крэшить инструмент (FEATURES, ARCHITECTURE, PITFALLS)

### Где есть напряжение

- **DI через конструктор vs tmpdir isolation** — ARCHITECTURE предпочитает DI с memfs, PITFALLS предупреждает против over-mocking и рекомендует реальные tmp-директории. Решение: DI для unit тестов, tmpdir для integration.
- **Memory system scope** — FEATURES считает memory extraction дифференциатором и важной частью стабилизации; PITFALLS фиксирует много рисков (LLM недетерминирован, hotness decay, index corruption). Решение: L0 extraction в scope стабилизации, L1 — только аудит и фикс известных багов.
- **Postinstall vs lazy migration** — ARCHITECTURE предлагает migration runner в postinstall; PITFALLS указывает на `--ignore-scripts` и `npm ci` обходящие postinstall. Решение: оба механизма — postinstall + проверка версии при первом запуске CLI.

---

## Recommendations

**1. Запустить тест-инфраструктуру до первого коммита с изменениями кода**
Без golden tests на текущее поведение любой рефакторинг — слепой. Начать с фикстур для JSONL edge cases и одного полного теста на Claude adapter. Это разблокирует всё остальное.

**2. Зафиксировать session identity как первый deliverable Phase 2**
Это единственный модуль, баг в котором каскадирует в list, resume и restore одновременно. Написать спецификацию + тесты до рефакторинга любого адаптера.

**3. Заморозить feature scope письменно до начала работы**
Явный out-of-scope список (новые агенты, новые команды, TUI редизайн, cloud sync) должен быть в PROJECT.md и проверяться на каждом PR. Scope creep — единственный риск, который полностью остановит milestone.

---

*Синтезировано из: STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md | 2026-03-20*
