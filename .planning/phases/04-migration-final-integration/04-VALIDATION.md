---
phase: 4
slug: migration-final-integration
status: completed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — already configured in package.json |
| **Quick run command** | `npm test -- --grep "migration"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --grep "migration"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | MIG-07 | unit | `npm test -- --grep "backup"` | ✅ | ✅ |
| 04-01-02 | 01 | 1 | MIG-01, MIG-02 | unit | `npm test -- --grep "runMigrations"` | ✅ | ✅ |
| 04-01-03 | 01 | 1 | MIG-05 | unit | `npm test -- --grep "atomic"` | ✅ | ✅ |
| 04-01-04 | 01 | 1 | MIG-03 | unit | `npm test -- --grep "idempotent"` | ✅ | ✅ |
| 04-02-01 | 02 | 2 | MIG-04 | unit | `npm test -- --grep "lazy"` | ✅ | ✅ |
| 04-02-02 | 02 | 2 | MIG-06 | unit | `npm test -- --grep "exit code"` | ✅ | ✅ |
| 04-03-01 | 03 | 2 | TEST-04 | unit | `npm test -- --grep "migration"` | ✅ | ✅ |
| 04-04-01 | 04 | 3 | TEST-05 | integration | `npm test -- --grep "cli-"` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/migration.test.mjs` — stubs for MIG-01 through MIG-07
- [x] `tests/integration/cli-list.test.mjs` — stub for TEST-05
- [x] `tests/integration/cli-resume.test.mjs` — stub for TEST-05
- [x] `tests/integration/cli-restore.test.mjs` — stub for TEST-05
- [x] `tests/integration/cli-install.test.mjs` — stub for TEST-05
- [x] `tests/integration/cli-extract-memory.test.mjs` — stub for TEST-05
- [x] `tests/helpers/migration-fixtures.mjs` — shared fixtures for migration tests

---

## Requirements Coverage

| Req ID | Description | Evidence |
|--------|-------------|----------|
| MIG-01 | Postinstall мигрирует хуки из старого формата | `tests/migration.test.mjs`, `src/migration/runner.ts` |
| MIG-02 | Postinstall мигрирует файлы памяти | `tests/migration.test.mjs`, `src/memory/migrate.ts` |
| MIG-03 | Postinstall идемпотентен | `tests/migration.test.mjs`, `src/migration/runner.ts` |
| MIG-04 | Lazy migration при первом запуске CLI | `tests/integration/cli-list.test.mjs`, `src/migration/runner.ts` |
| MIG-05 | Atomic writes для конфигов | `tests/migration.test.mjs`, `src/migration/backup.ts` |
| MIG-06 | Postinstall exit code 0 при ошибке | `tests/migration.test.mjs`, `src/migration/runner.ts` |
| MIG-07 | Backup конфигов перед миграцией | `tests/migration.test.mjs`, `src/migration/backup.ts` |
| TEST-04 | Unit тесты на миграцию | `tests/migration.test.mjs` |
| TEST-05 | Integration тесты на CLI-команды | `tests/integration/cli-*.test.mjs` (5 файлов) |

---

## Success Criteria

- [x] Миграция хуков и памяти работает автоматически (MIG-01..02)
- [x] Postinstall идемпотентен и безопасен (MIG-03, MIG-06)
- [x] Lazy migration для --ignore-scripts (MIG-04)
- [x] Atomic writes + backup (MIG-05, MIG-07)
- [x] Integration тесты на все CLI команды (TEST-05)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm install -g claude-sessions` upgrade path на реальной установке | MIG-01, MIG-02 | Требует глобальную npm установку и реальные пользовательские данные | 1. Установить предыдущую версию из npm 2. Убедиться в наличии старых хуков/сессий 3. `npm install -g claude-sessions` 4. Проверить хуки мигрированы, память цела |
| `resume` запускает реальный агент | TEST-05 | Требует установленный агент и активную сессию | Тестировать только dispatch-логику и error path автоматически |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
