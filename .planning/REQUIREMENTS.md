# Requirements: claude-sessions Audit & Stabilization

**Defined:** 2026-03-20
**Core Value:** Каждая команда из README работает надёжно и предсказуемо для всех агентов, включая edge cases и обновление с предыдущих версий.

## v1 Requirements

### Session Management

- [ ] **SESS-01**: Resume корректно запускает сессию Claude Code по session ID
- [ ] **SESS-02**: Resume корректно запускает сессию Codex по session ID
- [ ] **SESS-03**: Resume корректно запускает сессию Qwen по session ID
- [ ] **SESS-04**: Resume корректно запускает сессию Gemini по session ID
- [ ] **SESS-05**: Resume корректно запускает сессию Companion по session ID
- [ ] **SESS-06**: Resume возвращает понятную ошибку когда сессия не найдена
- [ ] **SESS-07**: Resume возвращает понятную ошибку когда агент не установлен
- [ ] **SESS-08**: List возвращает дедуплицированный список сессий для каждого агента
- [ ] **SESS-09**: List корректно фильтрует по агенту, дате, ключевому слову
- [ ] **SESS-10**: List обрабатывает пустое состояние (нет сессий) с понятным сообщением
- [ ] **SESS-11**: Restore не создаёт дубликатов — повторный restore идемпотентен
- [ ] **SESS-12**: Restore восстанавливает сессию с корректными метаданными
- [ ] **SESS-13**: TUI picker отображает сессии без ошибок и артефактов
- [ ] **SESS-14**: TUI picker корректно обрабатывает навигацию и выбор
- [ ] **SESS-15**: Session identity однозначно идентифицирует сессию across форматов агентов

### Data Resilience

- [ ] **DATA-01**: JSONL парсер пропускает невалидные строки с логированием, не падает
- [ ] **DATA-02**: Пустые директории сессий обрабатываются без ошибок
- [ ] **DATA-03**: Отсутствующие директории агентов обрабатываются без ошибок
- [ ] **DATA-04**: Частично записанные JSONL файлы (обрезанные) парсятся gracefully
- [ ] **DATA-05**: Файлы с UTF-8 BOM парсятся корректно
- [ ] **DATA-06**: Null/undefined значения в ожидаемых полях сессий не крэшат парсер
- [ ] **DATA-07**: Большие файлы (10MB+ JSONL) обрабатываются без OOM

### Memory System

- [ ] **MEM-01**: L0 extraction детерминированно извлекает метаданные из сессий всех агентов
- [ ] **MEM-02**: Hotness scoring корректно рассчитывается с decay по времени
- [ ] **MEM-03**: Дедупликация воспоминаний — одинаковые не сохраняются дважды
- [ ] **MEM-04**: Memory loading подгружает hot memories при старте сессии
- [ ] **MEM-05**: Memory index не повреждается при прерывании записи
- [ ] **MEM-06**: L1 LLM extraction аудирована, известные баги зафиксированы
- [ ] **MEM-07**: extract-memory CLI команда работает end-to-end

### Migration & Install

- [ ] **MIG-01**: Postinstall мигрирует хуки из старого формата в новый автоматически
- [ ] **MIG-02**: Postinstall мигрирует файлы памяти если формат изменился
- [ ] **MIG-03**: Postinstall идемпотентен — повторный запуск безопасен
- [ ] **MIG-04**: Lazy migration при первом запуске CLI (для --ignore-scripts)
- [ ] **MIG-05**: Atomic writes для конфигов (temp + rename)
- [ ] **MIG-06**: Postinstall exit code 0 даже при ошибке миграции (не ломает npm install)
- [ ] **MIG-07**: Backup конфигов перед миграцией

### Error Handling

- [ ] **ERR-01**: Все пользовательские ошибки содержат: что сломалось, почему, что делать
- [ ] **ERR-02**: CLI exit codes: 0 = успех, non-zero = ошибка
- [ ] **ERR-03**: Stack traces не отображаются пользователю (только в debug mode)
- [ ] **ERR-04**: Ошибки локализованы (en/ru) через i18n

### Testing & Quality

- [ ] **TEST-01**: Unit тесты на каждый агент-адаптер (Claude, Codex, Qwen, Gemini, Companion)
- [ ] **TEST-02**: Unit тесты на JSONL парсер с edge case фикстурами
- [ ] **TEST-03**: Unit тесты на подсистему памяти (extraction, scoring, dedup)
- [ ] **TEST-04**: Unit тесты на миграцию (старый формат → новый)
- [ ] **TEST-05**: Integration тесты на CLI-команды (list, resume, restore, install, extract-memory)
- [ ] **TEST-06**: Fixture-based тесты: матрица [agent] × [command] × [edge case]
- [ ] **TEST-07**: TypeScript strict mode + noUncheckedIndexedAccess включены
- [ ] **TEST-08**: README соответствует реальному поведению утилиты

### Code Quality

- [ ] **CODE-01**: BaseAgentAdapter — общая логика выделена, дублирование убрано
- [ ] **CODE-02**: Shared utilities (safeReadJson, parseJsonlFile, normalizePath) вынесены
- [ ] **CODE-03**: DI через конструктор для тестируемости адаптеров
- [ ] **CODE-04**: AdapterError с agentName для диагностики
- [ ] **CODE-05**: i18n модуль разбит на логические части (не монолитный 2132 строки)

## v2 Requirements

### Enhanced Memory
- **MEM-V2-01**: L1 extraction с улучшенной детерминированностью через strict JSON schema
- **MEM-V2-02**: Memory versioning — история изменений воспоминаний

### Performance
- **PERF-01**: List < 500ms даже с 500+ сессиями
- **PERF-02**: Streaming JSONL parsing для больших файлов

### Robustness
- **ROB-01**: Advisory file locking для concurrent access
- **ROB-02**: Config migration rollback при сбое

## Out of Scope

| Feature | Reason |
|---------|--------|
| Новые агенты | Сначала стабилизировать существующие 5 |
| Новые CLI команды | Стабилизация, не расширение |
| TUI редизайн | Только фиксы багов |
| Cloud sync | Не solo-developer use case |
| Plugin system | Premature abstraction |
| Новые runtime deps | Zero deps — ограничение |
| Config file redesign | Только если баг требует |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SESS-01 | — | Pending |
| SESS-02 | — | Pending |
| SESS-03 | — | Pending |
| SESS-04 | — | Pending |
| SESS-05 | — | Pending |
| SESS-06 | — | Pending |
| SESS-07 | — | Pending |
| SESS-08 | — | Pending |
| SESS-09 | — | Pending |
| SESS-10 | — | Pending |
| SESS-11 | — | Pending |
| SESS-12 | — | Pending |
| SESS-13 | — | Pending |
| SESS-14 | — | Pending |
| SESS-15 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| DATA-06 | — | Pending |
| DATA-07 | — | Pending |
| MEM-01 | — | Pending |
| MEM-02 | — | Pending |
| MEM-03 | — | Pending |
| MEM-04 | — | Pending |
| MEM-05 | — | Pending |
| MEM-06 | — | Pending |
| MEM-07 | — | Pending |
| MIG-01 | — | Pending |
| MIG-02 | — | Pending |
| MIG-03 | — | Pending |
| MIG-04 | — | Pending |
| MIG-05 | — | Pending |
| MIG-06 | — | Pending |
| MIG-07 | — | Pending |
| ERR-01 | — | Pending |
| ERR-02 | — | Pending |
| ERR-03 | — | Pending |
| ERR-04 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| TEST-06 | — | Pending |
| TEST-07 | — | Pending |
| TEST-08 | — | Pending |
| CODE-01 | — | Pending |
| CODE-02 | — | Pending |
| CODE-03 | — | Pending |
| CODE-04 | — | Pending |
| CODE-05 | — | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 0
- Unmapped: 48 ⚠️

---
*Requirements defined: 2026-03-20*
*Last updated: 2026-03-20 after initial definition*
