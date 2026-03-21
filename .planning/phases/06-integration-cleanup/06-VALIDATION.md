---
phase: 06
slug: integration-cleanup
status: completed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-21
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (via vitest-compatible runner) |
| **Config file** | jest.config.cjs |
| **Quick run command** | `npm test -- --testPathPattern="resume-qwen-gemini\|memory-hotness"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="resume-qwen-gemini|memory-hotness"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CODE-03 | unit | `npm test -- --testPathPattern="resume-qwen-gemini"` | ✅ | ✅ |
| 06-01-02 | 01 | 1 | MEM-04 | unit | `npm test -- --testPathPattern="hotness-sync"` | ✅ | ✅ |
| 06-01-03 | 01 | 1 | DATA-01 | integration | `npm test` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
