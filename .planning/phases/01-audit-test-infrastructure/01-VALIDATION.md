---
phase: 1
slug: audit-test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | package.json scripts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | TEST-07 | config | `npm test` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | CODE-02 | compile | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | DATA-01..07 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | DATA-05 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | SESS-15 | unit | `npm test` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | TEST-02 | integration | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/` — создать директорию тестов
- [ ] `tests/fixtures/shared/` — fixture-файлы для edge cases
- [ ] `tests/fixtures/claude/` — fixture для Claude сессий
- [ ] Настроить `node:test` в package.json scripts

*Existing infrastructure: node:test доступен (Node.js built-in), но тесты и fixtures отсутствуют.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `claude-sessions list` с реальными данными | SESS-15 | Требует реальные агентные данные | Запустить `claude-sessions list` на машине с установленными агентами |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
