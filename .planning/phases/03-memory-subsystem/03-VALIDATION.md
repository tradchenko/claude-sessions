---
phase: 3
slug: memory-subsystem
status: completed
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-21
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | jest.config.cjs |
| **Quick run command** | `npm test -- --testPathPattern="memory"` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="memory"`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CODE-05 | unit | `npm test` | ✅ | ✅ |
| 03-02-01 | 02 | 1 | MEM-01 | unit | `npm test -- --testPathPattern="memory-extract-l0"` | ✅ | ✅ |
| 03-02-02 | 02 | 1 | MEM-02 | unit | `npm test -- --testPathPattern="memory-hotness"` | ✅ | ✅ |
| 03-03-01 | 03 | 2 | MEM-03 | unit | `npm test -- --testPathPattern="memory-dedup"` | ✅ | ✅ |
| 03-03-02 | 03 | 2 | MEM-05 | unit | `npm test -- --testPathPattern="memory-index"` | ✅ | ✅ |
| 03-04-01 | 04 | 2 | MEM-04 | unit | `npm test -- --testPathPattern="hotness-sync"` | ✅ | ✅ |
| 03-04-02 | 04 | 2 | TEST-08 | unit | `npm test -- --testPathPattern="hotness-sync"` | ✅ | ✅ |
| 03-05-01 | 05 | 3 | MEM-06 | unit | `npm test -- --testPathPattern="memory-extract-l1"` | ✅ | ✅ |
| 03-05-02 | 05 | 3 | MEM-07 | integration | `npm test -- --testPathPattern="cli-extract-memory"` | ✅ | ✅ |
| 03-05-03 | 05 | 3 | TEST-03 | unit | `npm test -- --testPathPattern="memory-"` | ✅ | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Requirements Coverage

| Req ID | Description | Evidence |
|--------|-------------|----------|
| MEM-01 | L0 extraction детерминированно извлекает метаданные | `tests/memory-extract-l0.test.mjs`, `src/memory/extract-l0-multi.ts` |
| MEM-02 | Hotness scoring с decay по времени | `tests/memory-hotness.test.mjs`, `src/memory/hotness.ts` |
| MEM-03 | Дедупликация воспоминаний | `tests/memory-dedup.test.mjs`, `src/memory/dedup.ts` |
| MEM-04 | Memory loading при старте сессии | `tests/hotness-sync.test.mjs`, `src/hooks/session-start.ts` |
| MEM-05 | Memory index не повреждается при прерывании | `tests/memory-index.test.mjs`, `src/memory/index.ts` |
| MEM-06 | L1 LLM extraction аудирована | `tests/memory-extract-l1.test.mjs`, `src/memory/extract-l1.ts` |
| MEM-07 | extract-memory CLI работает end-to-end | `tests/integration/cli-extract-memory.test.mjs`, `src/commands/extract-memory.ts` |
| CODE-05 | i18n модуль разбит на логические части | `src/core/i18n.ts`, план 03-01 |
| TEST-03 | Unit тесты на подсистему памяти | `tests/memory-*.test.mjs` (6 файлов) |
| TEST-08 | SYNC guard тест для hotness константы | `tests/hotness-sync.test.mjs` |

---

## Success Criteria

- [x] L0 extraction работает для всех агентов (MEM-01)
- [x] Hotness scoring с time decay корректен (MEM-02)
- [x] Дедупликация предотвращает повторы (MEM-03)
- [x] Memory loading при старте сессии (MEM-04)
- [x] Memory index атомарен и не повреждается (MEM-05)

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
