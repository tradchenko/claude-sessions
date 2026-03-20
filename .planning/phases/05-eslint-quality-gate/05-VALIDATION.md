---
phase: 5
slug: eslint-quality-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) + eslint CLI |
| **Config file** | eslint.config.mjs (to be created) |
| **Quick run command** | `npm run lint` |
| **Full suite command** | `npm run check` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint`
- **After every plan wave:** Run `npm run check`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | CODE-01 | lint | `npm run lint` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | CODE-01 | config | `test -f eslint.config.mjs` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | CODE-01 | config | `test -f .prettierrc` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | TEST-05 | integration | `npm run check` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 1 | CODE-01 | build | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `eslint.config.mjs` — migrate from existing eslint.config.js to flat config with strict rules
- [ ] `.prettierrc` — create with project settings (tabWidth=3, singleQuote, printWidth=180)
- [ ] `npm install -D eslint-plugin-import eslint-import-resolver-typescript eslint-config-prettier` — missing dependencies

*Existing infrastructure: vitest, tsc --noEmit already configured.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
