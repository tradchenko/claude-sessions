# Traceability Matrix: claude-sessions v1

**Created:** 2026-03-21
**Requirements:** 48 v1 (all mapped)
**Status:** 47 Complete, 1 Complete (TEST-08 закрыт планом 07-01)

## Matrix

| Req ID | Description | Phase | Evidence | Status |
|--------|-------------|-------|----------|--------|
| SESS-01 | Resume корректно запускает сессию Claude Code по session ID | 2 | `tests/resume-claude-codex.test.mjs`, `src/agents/claude.ts` | Complete |
| SESS-02 | Resume корректно запускает сессию Codex по session ID | 2 | `tests/resume-claude-codex.test.mjs`, `src/agents/codex.ts` | Complete |
| SESS-03 | Resume корректно запускает сессию Qwen по session ID | 2 | `tests/resume-qwen-gemini.test.mjs`, `src/agents/qwen.ts` | Complete |
| SESS-04 | Resume корректно запускает сессию Gemini по session ID | 2 | `tests/resume-qwen-gemini.test.mjs`, `src/agents/gemini.ts` | Complete |
| SESS-05 | Resume корректно запускает сессию Companion по session ID | 2 | `tests/resume-companion.test.mjs`, `src/agents/companion.ts` | Complete |
| SESS-06 | Resume возвращает понятную ошибку когда сессия не найдена | 2 | `tests/adapter-resume.test.mjs`, `src/agents/base-adapter.ts` | Complete |
| SESS-07 | Resume возвращает понятную ошибку когда агент не установлен | 2 | `tests/adapter-resume.test.mjs`, `src/agents/base-adapter.ts` | Complete |
| SESS-08 | List возвращает дедуплицированный список сессий для каждого агента | 2 | `tests/session-dedup.test.mjs`, `src/sessions/loader.ts` | Complete |
| SESS-09 | List корректно фильтрует по агенту, дате, ключевому слову | 2 | `tests/integration/cli-list.test.mjs`, `src/commands/list.ts` | Complete |
| SESS-10 | List обрабатывает пустое состояние с понятным сообщением | 2 | `tests/integration/cli-list.test.mjs`, `src/commands/list.ts` | Complete |
| SESS-11 | Restore не создаёт дубликатов — повторный restore идемпотентен | 2 | `tests/restore-idempotent.test.mjs` | Complete |
| SESS-12 | Restore восстанавливает сессию с корректными метаданными | 2 | `tests/restore-multiagent.test.mjs`, `src/commands/restore.ts` | Complete |
| SESS-13 | TUI picker отображает сессии без ошибок и артефактов | 2 | `tests/picker-resize.test.mjs`, `src/commands/picker.ts` | Complete |
| SESS-14 | TUI picker корректно обрабатывает навигацию и выбор | 2 | `tests/picker-resize.test.mjs`, `src/commands/picker.ts` | Complete |
| SESS-15 | Session identity однозначно идентифицирует сессию across форматов агентов | 1 | `tests/session-identity.test.mjs`, `src/agents/types.ts` | Complete |
| DATA-01 | JSONL парсер пропускает невалидные строки с логированием, не падает | 1 | `tests/jsonl-parser.test.mjs`, `src/utils/jsonl.ts` | Complete |
| DATA-02 | Пустые директории сессий обрабатываются без ошибок | 1 | `tests/data-resilience.test.mjs`, `src/agents/gemini.ts` | Complete |
| DATA-03 | Отсутствующие директории агентов обрабатываются без ошибок | 1 | `tests/data-resilience.test.mjs`, `src/utils/fs.ts` | Complete |
| DATA-04 | Частично записанные JSONL файлы (обрезанные) парсятся gracefully | 1 | `tests/jsonl-parser.test.mjs`, `tests/fixtures/` | Complete |
| DATA-05 | Файлы с UTF-8 BOM парсятся корректно | 1 | `tests/jsonl-parser.test.mjs`, `tests/fixtures/` | Complete |
| DATA-06 | Null/undefined значения в ожидаемых полях сессий не крэшат парсер | 1 | `tests/data-resilience.test.mjs`, `src/utils/jsonl.ts` | Complete |
| DATA-07 | Большие файлы (10MB+ JSONL) обрабатываются без OOM | 1 | `tests/data-resilience.test.mjs`, `tests/fixtures/` | Complete |
| MEM-01 | L0 extraction детерминированно извлекает метаданные из сессий всех агентов | 3 | `tests/memory-extract-l0.test.mjs`, `src/memory/extract-l0-multi.ts` | Complete |
| MEM-02 | Hotness scoring корректно рассчитывается с decay по времени | 3 | `tests/memory-hotness.test.mjs`, `src/memory/hotness.ts` | Complete |
| MEM-03 | Дедупликация воспоминаний — одинаковые не сохраняются дважды | 3 | `tests/memory-dedup.test.mjs`, `src/memory/dedup.ts` | Complete |
| MEM-04 | Memory loading подгружает hot memories при старте сессии | 3 | `tests/hotness-sync.test.mjs`, `src/hooks/session-start.ts` | Complete |
| MEM-05 | Memory index не повреждается при прерывании записи | 3 | `tests/memory-index.test.mjs`, `src/memory/index.ts` | Complete |
| MEM-06 | L1 LLM extraction аудирована, известные баги зафиксированы | 3 | `tests/memory-extract-l1.test.mjs`, `src/memory/extract-l1.ts` | Complete |
| MEM-07 | extract-memory CLI команда работает end-to-end | 3 | `tests/integration/cli-extract-memory.test.mjs`, `src/commands/extract-memory.ts` | Complete |
| MIG-01 | Postinstall мигрирует хуки из старого формата в новый автоматически | 4 | `tests/migration.test.mjs`, `src/migration/runner.ts` | Complete |
| MIG-02 | Postinstall мигрирует файлы памяти если формат изменился | 4 | `tests/migration.test.mjs`, `src/memory/migrate.ts` | Complete |
| MIG-03 | Postinstall идемпотентен — повторный запуск безопасен | 4 | `tests/migration.test.mjs`, `src/migration/runner.ts` | Complete |
| MIG-04 | Lazy migration при первом запуске CLI (для --ignore-scripts) | 4 | `tests/integration/cli-list.test.mjs`, `src/migration/runner.ts` | Complete |
| MIG-05 | Atomic writes для конфигов (temp + rename) | 4 | `tests/migration.test.mjs`, `src/migration/backup.ts` | Complete |
| MIG-06 | Postinstall exit code 0 даже при ошибке миграции | 4 | `tests/migration.test.mjs`, `src/migration/runner.ts` | Complete |
| MIG-07 | Backup конфигов перед миграцией | 4 | `tests/migration.test.mjs`, `src/migration/backup.ts` | Complete |
| ERR-01 | Все пользовательские ошибки содержат: что сломалось, почему, что делать | 2 | `tests/error-format.test.mjs`, `src/agents/base-adapter.ts` | Complete |
| ERR-02 | CLI exit codes: 0 = успех, non-zero = ошибка | 2 | `tests/errors.test.mjs`, `src/cli.ts` | Complete |
| ERR-03 | Stack traces не отображаются пользователю (только в debug mode) | 2 | `tests/error-format.test.mjs`, `src/agents/base-adapter.ts` | Complete |
| ERR-04 | Ошибки локализованы (en/ru) через i18n | 2 | `tests/error-format.test.mjs`, `src/core/i18n.ts` | Complete |
| TEST-01 | Unit тесты на каждый агент-адаптер (Claude, Codex, Qwen, Gemini, Companion) | 2 | `tests/adapter-di.test.mjs`, `tests/adapter-resume.test.mjs` | Complete |
| TEST-02 | Unit тесты на JSONL парсер с edge case фикстурами | 1 | `tests/jsonl-parser.test.mjs`, `tests/fixtures/` | Complete |
| TEST-03 | Unit тесты на подсистему памяти (extraction, scoring, dedup) | 3 | `tests/memory-*.test.mjs` (6 файлов) | Complete |
| TEST-04 | Unit тесты на миграцию (старый формат → новый) | 4 | `tests/migration.test.mjs` | Complete |
| TEST-05 | Integration тесты на CLI-команды (list, resume, restore, install, extract-memory) | 4 | `tests/integration/cli-*.test.mjs` (5 файлов) | Complete |
| TEST-06 | Fixture-based тесты: матрица [agent] × [command] × [edge case] | 1 | `tests/fixture-matrix.test.mjs` | Complete |
| TEST-07 | TypeScript strict mode + noUncheckedIndexedAccess включены | 1 | `tsconfig.json`, `npm run typecheck` | Complete |
| TEST-08 | README соответствует реальному поведению утилиты | 7 | `README.md` верифицирован в плане 07-01: команды delete/restore добавлены, тест-счётчик исправлен | Complete |
| CODE-01 | BaseAgentAdapter — общая логика выделена, дублирование убрано | 5 | `src/agents/base-adapter.ts` | Complete |
| CODE-02 | Shared utilities (safeReadJson, parseJsonlFile, normalizePath) вынесены | 1 | `src/utils/fs.ts`, `src/utils/jsonl.ts`, `src/utils/paths.ts` | Complete |
| CODE-03 | DI через конструктор для тестируемости адаптеров | 2 | `src/agents/base-adapter.ts`, `tests/adapter-di.test.mjs` | Complete |
| CODE-04 | AdapterError с agentName для диагностики | 2 | `src/agents/base-adapter.ts`, `tests/errors.test.mjs` | Complete |
| CODE-05 | i18n модуль разбит на логические части (не монолитный 2132 строки) | 3 | `src/core/i18n.ts` (модули), план 03-01 | Complete |

## Summary

- **Total v1 requirements:** 48
- **Complete:** 48
- **Pending:** 0
- **TEST-08 closed:** plan 07-01 (2026-03-21)
