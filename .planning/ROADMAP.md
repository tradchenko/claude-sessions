# Roadmap: claude-sessions Audit & Stabilization

**Created:** 2026-03-20
**Granularity:** Coarse
**Phases:** 4
**Requirements:** 48 mapped

## Phases

### Phase 1: Аудит и тест-инфраструктура
**Goal:** Зафиксировать текущее поведение и создать тест-инфраструктуру до любых изменений кода.
**Requirements:** TEST-07, TEST-02, TEST-06, CODE-02, SESS-15, DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07
**Status:** Completed (100%)

| Plan | Title | Status |
|------|-------|--------|
| 01-01 | Аудит тест-инфраструктуры | ✅ Completed |
| 01-02 | Fixture-файлы и тесты JSONL edge cases | ✅ Completed |
| 01-03 | Session identity тесты и fixture-based матрица | ✅ Completed |

**Success Criteria:**
1. `npm test` запускается и выводит результаты без ошибок конфигурации ✅ (68 тестов, 0 падений)
2. TypeScript компилируется с `strict` + `noUncheckedIndexedAccess` ✅ (исправлены все ошибки, ESLint настроен)
3. Fixture-файлы для JSONL edge cases существуют (truncated, BOM, null fields, 10MB+) ✅
4. Session identity для каждого агента задокументирована в виде проходящих тестов ✅ (25 тестов)
5. Пользователь может запустить `claude-sessions list` и получить список без крэша даже при повреждённых данных ✅ (интеграционный тест)

---

### Phase 2: Стабилизация ядра (адаптеры и сессии)
**Goal:** Сделать все 5 агент-адаптеров надёжными — resume, list, restore работают корректно для каждого агента.
**Requirements:** SESS-01, SESS-02, SESS-03, SESS-04, SESS-05, SESS-06, SESS-07, SESS-08, SESS-09, SESS-10, SESS-11, SESS-12, SESS-13, SESS-14, CODE-01, CODE-03, CODE-04, ERR-01, ERR-02, ERR-03, ERR-04, TEST-01
**Status:** Completed (100%)

| Plan | Title | Status |
|------|-------|--------|
| 02-01 | Фундамент: DI, BaseAgentAdapter, AdapterError — все 5 адаптеров | ✅ Completed |
| 02-02 | Система структурированных ошибок и exit codes | ✅ Completed |
| 02-03 | Сессионные адаптеры: resume/restore через AdapterError | ✅ Completed |
| 02-04 | Дедупликация сессий в list | ✅ Completed |
| 02-05 | Restore: мультиагентность и идемпотентность | ✅ Completed |
| 02-06 | TUI picker: SIGWINCH и стабильность навигации | ✅ Completed |
| 02-07 | Unit тесты на адаптеры с DI | ✅ Completed |

**Success Criteria:**
1. `claude-sessions resume <id>` запускает сессию для каждого из 5 агентов; при отсутствии сессии — понятная ошибка без stack trace
2. `claude-sessions list` возвращает дедуплицированный список; повторный вызов даёт тот же результат
3. `claude-sessions restore` при двойном вызове не создаёт дубликатов
4. TUI picker открывается и позволяет выбрать сессию без артефактов отображения
5. Все ошибки пользовательского уровня локализованы (en/ru) и содержат: что сломалось, почему, что делать

---

### Phase 3: Подсистема памяти
**Goal:** Обеспечить надёжный pipeline памяти: extract → store → load → hotness для всех агентов.
**Requirements:** MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, MEM-06, MEM-07, CODE-05, TEST-03, TEST-08
**Status:** In Progress (60%)

| Plan | Title | Status |
|------|-------|--------|
| 03-01 | i18n рефакторинг: разбивка монолита на модули | ✅ Completed |
| 03-02 | L0 extraction, hotness, dedup и целостность индекса | ✅ Completed |
| 03-03 | Memory store и hotness pruning | ⬜ Not Started |
| 03-04 | extract-memory CLI команда end-to-end | ✅ Completed |
| 03-05 | Тесты подсистемы памяти | ⬜ Not Started |

**Success Criteria:**
1. `claude-sessions extract-memory` завершается успехом для сессий каждого агента, L0 метаданные извлекаются детерминированно
2. Повторный вызов extract на той же сессии не создаёт дублирующихся воспоминаний
3. Hot memories подгружаются при старте новой сессии без ошибок
4. README команды для memory точно отражают реальное поведение (проверено вручную)

---

### Phase 4: Миграция и финальная интеграция
**Goal:** Обеспечить безопасный upgrade path и покрыть все CLI-команды интеграционными тестами.
**Requirements:** MIG-01, MIG-02, MIG-03, MIG-04, MIG-05, MIG-06, MIG-07, TEST-04, TEST-05
**Success Criteria:**
1. `npm install -g claude-sessions` на существующей установке не ломает хуки и не теряет файлы памяти
2. Повторный postinstall идемпотентен — вызов дважды даёт тот же результат что и один раз
3. При `--ignore-scripts` lazy migration срабатывает при первом запуске CLI
4. Интеграционные тесты покрывают все 5 CLI-команд (`list`, `resume`, `restore`, `install`, `extract-memory`) и проходят в CI

---

## Requirement Coverage

| Phase | Requirements | Count |
|-------|-------------|-------|
| 1 | TEST-07, TEST-02, TEST-06, CODE-02, SESS-15, DATA-01–07 | 12 |
| 2 | SESS-01–15 (кроме SESS-15), CODE-01, CODE-03, CODE-04, ERR-01–04, TEST-01 | 21 |
| 3 | MEM-01–07, CODE-05, TEST-03, TEST-08 | 10 |
| 4 | MIG-01–07, TEST-04, TEST-05 | 9 |
| **Total** | | **48** ✓ |
