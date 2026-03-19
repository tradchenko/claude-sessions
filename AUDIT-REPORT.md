# Memory System — Multi-Agent Audit Report

**Дата**: 2026-03-19
**Branch**: master
**Scope**: 5 агентов, 6 компонентов памяти

---

## Архитектурный контекст

Система памяти привязана к **Claude Code hooks** (`~/.claude/settings.json` → `hooks.Stop`, `hooks.SessionStart`).
Хуки читают stdin (JSON с `session_id`, `cwd`) и работают с JSONL из `~/.claude/projects/`.
L0/L1 парсят исключительно формат Claude Code JSONL: `{type: "human"|"assistant", message: {content}}`.

---

## Claude Code

- **Stop hook**: ✅ Установлен в `settings.json`. Читает `session_id`+`cwd` из stdin, ищет JSONL в `~/.claude/projects/`, пишет в legacy + unified индекс, запускает L1 detached.
- **SessionStart hook**: ✅ Читает `index.json`, рассчитывает hotness, выводит каталог + горячие воспоминания в stdout.
- **L0 extraction**: ✅ Парсит Claude JSONL (`type: "human"/"assistant"`, `message.content` — строка или ContentBlock[]). Summary из первого user-сообщения, файлы через regex.
- **L1 extraction**: ✅ Находит JSONL через `findSessionJSONL()`, head+tail сообщений, `claude --model haiku --print`, сохраняет в `memories/{category}/{name}.md`.
- **Instructions**: ✅ `enable-memory.ts` добавляет секцию в `~/.claude/CLAUDE.md`. `getInstructionsPath()` → `~/.claude/CLAUDE.md`.
- **Missing**: Ничего. Полная поддержка.

---

## Codex CLI

- **Stop hook**: ❌ `hooksSupport: false`. Codex не читает Claude hooks из `settings.json`.
- **SessionStart hook**: ❌ Аналогично — хуки только в Claude `settings.json`.
- **L0 extraction**: ❌ Несовместимый формат. L0 ожидает `{type: "human", message: {content}}`. Codex хранит `{session_id, ts, text}`. Кроме того, единый файл `~/.codex/history.jsonl`, а не per-session в `~/.claude/projects/`.
- **L1 extraction**: ❌ `findSessionJSONL()` ищет в `~/.claude/projects/` по `{sessionId}.jsonl`. Codex — единый `~/.codex/history.jsonl`.
- **Instructions**: ⚠️ `getInstructionsPath()` → `{cwd}/AGENTS.md`. Но `enable-memory.ts` пишет только в `~/.claude/CLAUDE.md`.
- **Missing**:
  - Post-session trigger для Codex
  - Codex JSONL парсер (`{session_id, ts, text}`)
  - Codex JSONL локатор (единый файл, не per-session)
  - Инжекция memory-инструкций в AGENTS.md

---

## Qwen Code

- **Stop hook**: ❌ `hooksSupport: false`. Qwen не поддерживает Claude hooks.
- **SessionStart hook**: ❌ Аналогично.
- **L0 extraction**: ❌ Несовместимый формат. Qwen: `{uuid, sessionId, type: "user"|"assistant", message: {parts: [{text}]}}`. L0 ожидает `type: "human"` (не `"user"`) и `message.content` (не `message.parts`).
- **L1 extraction**: ❌ JSONL в `~/.qwen/projects/{project}/chats/{session}.jsonl`, не в `~/.claude/projects/`.
- **Instructions**: ⚠️ `getInstructionsPath()` → `~/.qwen/QWEN.md`. Но `enable-memory.ts` → только `CLAUDE.md`.
- **Missing**:
  - Post-session trigger для Qwen
  - Qwen JSONL парсер (формат с `parts[]`)
  - Qwen JSONL локатор (`~/.qwen/projects/`)
  - Инжекция в QWEN.md

---

## Gemini CLI

- **Stop hook**: ❌ Хотя `hooksSupport: true` в адаптере, `install.ts` регистрирует хуки **только** в Claude `settings.json`. В `~/.gemini/settings.json` ничего не пишется.
- **SessionStart hook**: ❌ Не установлен для Gemini.
- **L0 extraction**: ❌ Gemini хранит сессии как **git-репозитории** в `~/.gemini/history/{project}/`, не JSONL. L0 парсер работает только с JSONL.
- **L1 extraction**: ❌ `findSessionJSONL()` ищет `.jsonl` — Gemini использует git.
- **Instructions**: ⚠️ `getInstructionsPath()` → `~/.gemini/GEMINI.md`. `enable-memory.ts` → только `CLAUDE.md`.
- **Missing**:
  - Hook registration в Gemini settings
  - Git-based session reader (вместо JSONL парсера)
  - Инжекция в GEMINI.md

---

## Companion

- **Stop hook**: ❌ `hooksSupport: false`. Desktop launcher, не CLI-агент.
- **SessionStart hook**: ❌ Нет хука.
- **L0 extraction**: ❌ Recordings в `~/.companion/recordings/*.jsonl` с `{_header: true, session_id, backend_type}` — свой формат.
- **L1 extraction**: ❌ Другой путь и формат.
- **Instructions**: ❌ `getInstructionsPath()` → `null`. `instructionsFile: ''`.
- **Missing**:
  - Companion recordings парсер
  - Проброс воспоминаний через реального агента (Claude/Codex)

---

## Кросс-агентный обмен памятью

**Вопрос**: Могут ли воспоминания из Claude-сессии всплыть при старте Qwen-сессии?

**Ответ**: ❌ Нет.

- **Хранилище**: `~/.claude/session-memory/index.json` — единое, теоретически кросс-агентное.
- **Запись**: Только Claude (через Stop hook).
- **Чтение**: Только Claude (через SessionStart hook).
- Даже при ручном добавлении воспоминаний, Qwen/Codex/Gemini не получат их автоматически.

---

## Сводная таблица

| Компонент          | Claude | Codex | Qwen | Gemini | Companion |
|--------------------|--------|-------|------|--------|-----------|
| Stop hook          | ✅     | ❌    | ❌   | ❌     | ❌        |
| SessionStart hook  | ✅     | ❌    | ❌   | ❌     | ❌        |
| L0 extraction      | ✅     | ❌    | ❌   | ❌     | ❌        |
| L1 extraction      | ✅     | ❌    | ❌   | ❌     | ❌        |
| Instructions       | ✅     | ⚠️    | ⚠️   | ⚠️     | ❌        |
| **Итого**          | **5/5**| **0/5**| **0/5**| **0/5**| **0/5** |

---

## Рекомендации

### P0 — Без этого память работает только для Claude

1. **Adapter-driven post-session trigger**: Заменить Claude-only Stop hook на `adapter.onSessionEnd()` с агент-специфичной логикой.
2. **Агент-специфичные JSONL парсеры**: Фабрика `parseSession(agent, path) → ChatMessage[]` для каждого формата.
3. **Агент-специфичные JSONL локаторы**: `findSessionFile(agent, sessionId)` — знает где файлы каждого агента.

### P1 — Важные

4. **Универсальная инжекция инструкций**: `enable-memory.ts` должен писать в файл каждого агента (AGENTS.md, QWEN.md, GEMINI.md).
5. **Gemini git reader**: Специальный reader для git-based сессий.
6. **Gemini hooks**: `hooksSupport: true` → нужно регистрировать в `~/.gemini/settings.json`.

### P2 — Улучшения

7. **Кросс-агентный SessionStart**: Инжекция воспоминаний при старте не-Claude агентов.
8. **Companion passthrough**: Воспоминания через реального агента.
