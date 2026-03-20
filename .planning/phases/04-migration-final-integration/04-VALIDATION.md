---
phase: 4
slug: migration-final-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 04-01-01 | 01 | 1 | MIG-07 | unit | `npm test -- --grep "backup"` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | MIG-01, MIG-02 | unit | `npm test -- --grep "runMigrations"` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | MIG-05 | unit | `npm test -- --grep "atomic"` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | MIG-03 | unit | `npm test -- --grep "idempotent"` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | MIG-04 | unit | `npm test -- --grep "lazy"` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | MIG-06 | unit | `npm test -- --grep "exit code"` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | TEST-04 | unit | `npm test -- --grep "migration"` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 3 | TEST-05 | integration | `npm test -- --grep "cli-"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/migration.test.mjs` — stubs for MIG-01 through MIG-07
- [ ] `tests/integration/cli-list.test.mjs` — stub for TEST-05
- [ ] `tests/integration/cli-resume.test.mjs` — stub for TEST-05
- [ ] `tests/integration/cli-restore.test.mjs` — stub for TEST-05
- [ ] `tests/integration/cli-install.test.mjs` — stub for TEST-05
- [ ] `tests/integration/cli-extract-memory.test.mjs` — stub for TEST-05
- [ ] `tests/helpers/migration-fixtures.mjs` — shared fixtures for migration tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm install -g claude-sessions` upgrade path на реальной установке | MIG-01, MIG-02 | Требует глобальную npm установку и реальные пользовательские данные | 1. Установить предыдущую версию из npm 2. Убедиться в наличии старых хуков/сессий 3. `npm install -g claude-sessions` 4. Проверить хуки мигрированы, память цела |
| `resume` запускает реальный агент | TEST-05 | Требует установленный агент и активную сессию | Тестировать только dispatch-логику и error path автоматически |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
