# Features Dimension — CLI Session Management Audit

*Research for claude-sessions stabilization milestone. Date: 2026-03-20.*

---

## Table Stakes (must have or users leave)

### Session listing with reliable filtering
- Users expect `list` to always return accurate, deduplicated results
- Filtering by agent, date, keyword must be consistent and fast
- Empty states must be handled gracefully (no sessions found → clear message, not crash)
- **Testing complexity**: Medium. Requires fixture data for each agent format. Edge cases: empty dirs, partially written files, concurrent writes.

### Resume that works 100% of the time for all agents
- This is the core promise of the tool. A resume that fails 20% of the time destroys trust entirely.
- Each of the 5 agents (Claude, Codex, Qwen, Gemini, Companion) has a different session file format — each path must be separately validated and tested.
- Resume must detect when a session is already active and handle it without corrupting state.
- **Testing complexity**: High. Each agent adapter needs integration tests with real file fixtures. Gemini's git-repo format is especially divergent.
- **Dependency**: Adapter layer must be correct before resume can be reliable.

### Restore without data corruption or duplication
- Known issue: restore creates duplicate entries in session lists.
- Users who restore expect to see one session, not two or three copies.
- Idempotency is required: running restore twice should produce the same result as running it once.
- **Testing complexity**: High. Must test restore → list → restore again cycle for all agents.
- **Dependency**: Depends on session identity logic (how sessions are uniquely identified across formats).

### Error messages that explain what went wrong and how to fix it
- Cryptic errors (stack traces, undefined is not a function) cause immediate abandonment.
- Every user-facing error must include: what failed, why it likely failed, and what the user can do next.
- Examples: missing agent installation, corrupted JSONL, wrong Node.js version, missing permissions.
- **Testing complexity**: Low to medium. Snapshot tests on error message strings. Requires deliberately corrupted fixtures.

### Graceful handling of missing/corrupted data files
- JSONL files can be partially written (crash mid-session), empty, or contain invalid JSON lines.
- Sessions directories may not exist on fresh installs of agents.
- Tool must not crash — it must skip bad entries and report what was skipped.
- **Testing complexity**: Medium. Fixture-based: truncated JSONL, empty files, dirs with no sessions.

### Upgrade path that preserves user data
- Users update via `npm update -g claude-sessions`. They must not lose memory, hooks, or session cache.
- Hook format in `~/.claude/settings.json` has broken across versions before — postinstall must detect and migrate.
- Migration must be automatic, silent on success, and loud on failure (with instructions to recover).
- **Testing complexity**: High. Requires simulating old-format data and verifying postinstall migrates correctly. Hard to test without version fixtures.
- **Dependency**: Must know all prior formats to write migration guards.

---

## Differentiators (competitive advantage)

### Memory extraction and injection across sessions
- L0 (quick metadata) and L1 (LLM semantic) extraction from session transcripts.
- Memory loaded into new sessions gives continuity across days/weeks of work.
- Hotness scoring — frequently accessed memories surface first.
- No other session manager for AI agents does this. It is the strongest unique value.
- **Complexity**: Extraction quality depends on LLM; L0 can be tested deterministically, L1 cannot. Memory loading order and deduplication are testable.

### Multi-agent support (5 different AI CLIs)
- Claude, Codex, Qwen, Gemini, Companion — each has a different storage format and resume mechanism.
- Being the single tool that manages all of them is a strong lock-in advantage.
- Divergence between adapters is the main source of bugs. The differentiator only works if all 5 are reliable.
- **Complexity**: 5 separate adapter integration test suites needed. Shared adapter interface reduces this.

### TUI picker for interactive selection
- Terminal-native UX for browsing and selecting sessions without typing exact IDs.
- Raises the perceived quality of the tool significantly.
- Stabilization scope: fix bugs only, no redesign.

### Automatic session hooks
- Hooks in agent settings.json trigger memory extraction automatically on session end.
- Zero-effort memory capture is a major DX win.
- Risk area: hook format has broken before. Must be the most regression-tested part of the upgrade path.

---

## Anti-features (things to deliberately NOT build)

### Feature creep risks during stabilization

- **New agent adapters**: Adding a 6th agent before the existing 5 are reliable makes the problem larger, not better. Hard no.
- **New CLI commands**: Every new command is a new surface to test and document. Stabilization means making existing commands trustworthy, not adding new ones.
- **UI/UX redesign of TUI**: Visual redesign during a stabilization milestone introduces new bugs with no reliability benefit.
- **Plugin/extension system**: Premature abstraction. The adapter pattern is already the right abstraction — a full plugin system adds complexity without user value today.
- **Cloud sync or remote storage**: Completely out of scope. Introduces auth, network errors, and privacy concerns.
- **Session sharing between users**: Same issue as cloud sync. Not a solo-developer CLI use case.
- **New runtime dependencies**: Locked constraint. Zero deps is a feature, not a limitation — it eliminates an entire class of install failures.
- **Config file redesign**: Changing the config format mid-stabilization creates migration debt. Only change config if a bug requires it.
- **Interactive setup wizard**: Nice to have, but adds code that needs testing. Postinstall automation is sufficient.

### Why "just add one feature" is dangerous during audits
- Audit work surfaces hidden coupling. Adding a feature during audit means the feature is built on unmapped, untested foundations.
- New features reset test coverage progress — each new path needs its own tests.
- Scope creep delays the milestone and can prevent it from shipping at all.

---

## Complexity Notes

| Feature | Testing Complexity | Key Dependencies |
|---|---|---|
| Session listing | Medium | Agent file format fixtures |
| Resume (all agents) | High | Agent adapters, session identity |
| Restore dedup | High | Session identity, list logic |
| Error messages | Low–Medium | Error taxonomy, i18n strings |
| Corrupted file handling | Medium | JSONL parser, graceful skip logic |
| Upgrade / migration | High | Version detection, format history |
| Memory extraction (L0) | Medium | Transcript parser, metadata schema |
| Memory extraction (L1) | Low (unit) / untestable (quality) | LLM call isolation |
| Memory injection | Medium | Load order, dedup, hotness score |
| Hook install/update | High | settings.json format per agent version |
| TUI picker | Low (bugs only) | List output correctness |

**Key cross-cutting dependency**: Session identity — how a session is uniquely identified across formats — underlies listing, restore dedup, and resume. Getting this wrong cascades into every feature. It should be audited and locked down first.

---

## Quality Expectations

### What users expect from a mature CLI tool

- **Predictability**: The same command on the same data always produces the same result.
- **Speed**: `list` should return in <500ms even with hundreds of sessions.
- **No silent failures**: If something goes wrong, the tool says so. It never silently succeeds while doing the wrong thing.
- **Clean exit codes**: `0` on success, non-zero on failure. Scripts depend on this.
- **Idempotent operations**: Running `install`, `restore`, or `migrate` twice is safe.
- **No data loss**: The tool never deletes or overwrites user data without explicit confirmation.

### Error handling patterns

- **Parse errors**: Skip bad entries, log which file/line was skipped, continue.
- **Missing files/dirs**: Check existence before access, return clear "not found" message with path.
- **Agent not installed**: Detect early (at `list` time), not late (at `resume` time).
- **Permission errors**: Catch EACCES/EPERM, explain which path needs what permission.
- **Partial writes**: JSONL lines that are not valid JSON must be skipped, not crash the parser.
- **Migration failures**: Postinstall migration failure must not break the existing install. Roll back or skip with a warning.

### Edge case categories for session management

1. **Empty state**: No sessions, no agents installed, first run after install.
2. **Large scale**: 500+ sessions, 10MB+ JSONL files, deep memory archives.
3. **Corrupted data**: Truncated JSONL, invalid JSON lines, missing required fields, null/undefined values in expected positions.
4. **Concurrent access**: Two terminals open, both listing or resuming simultaneously.
5. **Format evolution**: Old sessions created by a prior version of the tool or agent.
6. **Partial install**: Agent installed but never used (empty session dirs exist).
7. **Cross-platform paths**: Windows WSL path separators, home dir resolution, symlinked dirs.
8. **Mid-operation crash**: Session was being written when process was killed — resulting file is incomplete.
9. **Upgrade during active session**: User runs `npm update` while a session is open. Hooks must not be re-written in a way that breaks the active session.
