---
phase: 2
slug: stabilize-core-adapters-sessions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js test runner (node --test) |
| **Config file** | package.json scripts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | CODE-03 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | CODE-01 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | CODE-04 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | ERR-01, ERR-02 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | ERR-03, ERR-04 | unit+integration | `npm test` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | SESS-01..SESS-07 | unit+fixture | `npm test` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | SESS-06, SESS-07 | integration | `npm test` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | SESS-08, SESS-09, SESS-10 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | SESS-11, SESS-12 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 3 | SESS-13, SESS-14 | unit+manual | `npm test` | ❌ W0 | ⬜ pending |
| 02-07-01 | 07 | 3 | TEST-01 | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/adapter-resume.test.mjs` — stubs для SESS-01..SESS-07 (resume per adapter + error cases)
- [ ] `tests/session-dedup.test.mjs` — stubs для SESS-08 (дедупликация)
- [ ] `tests/restore-idempotent.test.mjs` — stubs для SESS-11 (идемпотентность restore)
- [ ] `tests/error-format.test.mjs` — stubs для ERR-01..ERR-04 (формат ошибок + локализация)
- [ ] `tests/adapter-di.test.mjs` — stubs для CODE-01, CODE-03, CODE-04 (BaseAdapter, DI, AdapterError)
- [ ] `tests/picker-resize.test.mjs` — stubs для SESS-13 (SIGWINCH handling)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TUI picker ресайз без артефактов | SESS-13 | Визуальная проверка в реальном терминале | 1. Открыть picker, 2. Изменить размер окна, 3. Убедиться что перерисовка корректна |
| TUI picker навигация | SESS-14 | Требует интерактивный TTY | 1. Открыть picker, 2. ↑↓ Tab Enter, 3. Убедиться что фильтры и выбор работают |
| Resume запускает реального агента | SESS-01..SESS-05 | Требует установленных агентов | 1. `claude-sessions resume <id>`, 2. Убедиться что открывается правильный агент |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
