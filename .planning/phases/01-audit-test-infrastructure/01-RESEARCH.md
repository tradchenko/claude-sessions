# Phase 1: Аудит и тест-инфраструктура — RESEARCH

**Составлено:** 2026-03-20
**Фаза:** 01-audit-test-infrastructure
**Требования:** TEST-07, TEST-02, TEST-06, CODE-02, SESS-15, DATA-01–07

---

## Структура проекта

### Ключевые файлы

```
/Users/tradchenko/claude-sessions/
├── src/
│   ├── agents/
│   │   ├── types.ts          # AgentAdapter interface, AgentId, AgentInfo
│   │   ├── registry.ts       # detectAgents, getAdapter, getAllAdapters
│   │   ├── claude.ts         # Claude Code adapter
│   │   ├── codex.ts          # OpenAI Codex CLI adapter
│   │   ├── gemini.ts         # Gemini CLI adapter
│   │   ├── qwen.ts           # Qwen Code adapter
│   │   └── companion.ts      # Companion desktop wrapper adapter
│   ├── sessions/
│   │   ├── loader.ts         # loadSessions, readSessionIndex, Session interface
│   │   ├── cache.ts
│   │   └── lazy-extract.ts
│   ├── commands/             # CLI команды (list, restore, delete, etc.)
│   ├── hooks/                # session-start, save-summary, stop
│   ├── mcp/server.ts
│   ├── memory/               # Подсистема памяти (L0/L1 extraction)
│   └── core/
│       ├── config.ts         # Пути HOME, CLAUDE_DIR, HISTORY_FILE, etc.
│       └── i18n.ts
├── test/
│   ├── run.mjs               # Главный test runner (node:test)
│   ├── agents.test.mjs       # Тесты агентов
│   ├── memory.test.mjs
│   └── memory-integration.test.mjs
├── package.json
└── tsconfig.json
```

---

## Текущая тест-инфраструктура

### Что есть

- **Тест-раннер:** Node.js built-in `node:test` (НЕ vitest, НЕ jest)
- **Команда:** `npm test` = `npm run build && node --test test/run.mjs`
- **Тест-файлы:** 3 файла в `test/` — `run.mjs`, `agents.test.mjs`, `memory.test.mjs`, `memory-integration.test.mjs`
- **Подход:** Импорт из `dist/` (скомпилированный код), не из `src/`
- **Моки:** Создаются вручную через `tmpdir()` + `mkdirSync` + `writeFileSync`
- Существующий mock создаёт `~/.claude` с `history.jsonl`, `session-index.json`, JSONL-файл сессии

### Что отсутствует

- **vitest** — в CONTEXT.md упомянут как уже настроенный, но `vitest.config.ts` НЕ НАЙДЕН; в devDependencies только `@types/node` и `typescript`
- **Fixture-файлы** — директории `tests/fixtures/` нет, ни одного fixture-файла
- **Тесты на edge cases** JSONL: truncated, BOM, null fields, 10MB+ — нет
- **Тесты session identity** по агентам — только базовые интеграционные тесты
- **ESLint** — не установлен, нет конфига
- **lint-скрипт** в package.json — отсутствует

### Важное расхождение в CONTEXT.md

CONTEXT.md говорит «vitest уже настроен (vitest.config.ts)» — это неверно. Реальность: тесты используют `node:test`. Решение: либо мигрировать на vitest (нужна установка), либо остаться на `node:test`. Решение нужно принять при планировании.

---

## TypeScript конфигурация

### Текущий tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
    // НЕТ: noUncheckedIndexedAccess
    // НЕТ: noImplicitOverride
  },
  "exclude": ["node_modules", "dist", "test"]
}
```

### Что нужно добавить (TEST-07)

- `noUncheckedIndexedAccess: true` — отсутствует
- `moduleResolution: "NodeNext"` — CONTEXT говорит NodeNext, но стоит Node16 (минорное расхождение)
- `include` секция не покрывает `test/` (тесты на `.mjs` — это не проблема, они не типизированы)

### Статус компиляции

`npx tsc --noEmit` — результат не был захвачен (команда не вернула ошибок в stdout). Нужно запустить отдельно при планировании. Вероятно, текущий код компилируется с `strict: true` без ошибок, но `noUncheckedIndexedAccess` откроет новые ошибки в местах доступа к массивам/индексам.

---

## Session Identity — по агентам (SESS-15)

### Claude Code (`src/agents/claude.ts`)
- **Хранение:** `~/.claude/history.jsonl` (события сессий)
- **Формат строки:** `{"sessionId": "uuid", "project": "/path", "display": "...", "timestamp": ms}`
- **ID:** UUID v4
- **JSONL-файлы сессий:** `~/.claude/projects/{encoded-path}/{sessionId}.jsonl`
- **Дополнительно:** `~/.claude/sessions/*.json` (живые сессии), `~/.claude/snapshots/*.md`
- **Инструкции:** `~/.claude/CLAUDE.md`

### Codex CLI (`src/agents/codex.ts`)
- **Хранение:** `~/.codex/history.jsonl` (кросс-платформенный: Windows APPDATA, XDG Linux)
- **Формат строки:** `{"session_id": "...", "ts": unix_seconds, "text": "..."}`
- **ID:** поле `session_id` (не `sessionId` — отличие от Claude!)
- **Временная метка:** в секундах (нужна нормализация `ts < 1e12 ? ts * 1000 : ts`)
- **Инструкции:** `AGENTS.md` в CWD проекта (не в home)

### Gemini CLI (`src/agents/gemini.ts`)
- **Хранение:** `~/.gemini/history/{project}/` — git-репозитории (не JSONL!)
- **ID сессии:** `gemini-{project_name}` (синтетический, один на проект)
- **Timestamp:** из `git log -1 --format=%ct` (секунды → миллисекунды)
- **Resume:** НЕ поддерживается (`resumeSupport: false`)
- **Инструкции:** `~/.gemini/GEMINI.md`

### Qwen Code (`src/agents/qwen.ts`)
- **Хранение:** `~/.qwen/projects/{project}/chats/{sessionId}.jsonl`
- **Формат:** JSONL с полями `sessionId`, `timestamp`, `cwd`
- **ID:** поле `sessionId` из первой записи файла
- **Инструкции:** `~/.qwen/QWEN.md`

### Companion (`src/agents/companion.ts`)
- **Хранение:** `~/.companion/recordings/*.jsonl`
- **Тип:** враппер — делегирует сессии реальным агентам с флагом `viaCompanion: true`
- **Формат:** заголовок `_header` в JSONL

### Общий паттерн

Все 5 агентов реализуют `AgentAdapter` interface:
```typescript
detect(): AgentInfo | null
loadSessions(options?): Promise<Session[]>
getResumeCommand(sessionId): string[] | null
isSessionAlive(sessionId): boolean
getInstructionsPath(): string | null
```

---

## JSONL Handling — текущее состояние

### Общий паттерн парсинга (Claude + Codex)

```typescript
const lines = content.split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const entry = JSON.parse(line);
    // процесс...
  } catch {
    continue; // молча пропускает невалидные строки
  }
}
```

### Что есть

- Пустые строки пропускаются ✓
- Невалидный JSON: `catch { continue }` — молча пропускается ✓
- Отсутствие обязательных полей: `if (!entry.session_id) continue` ✓

### Что НЕТ / не покрыто

- **BOM (DATA-05):** UTF-8 BOM `\uFEFF` в начале файла — `JSON.parse` упадёт на первой строке
- **Truncated lines (DATA-04):** Обрезанная последняя строка — `catch { continue }` спасёт, но нет теста
- **Null fields (DATA-06):** `null` в `timestamp` или `sessionId` — может привести к `NaN` при сравнении
- **10MB+ файлы (DATA-07):** Claude использует `readFileSync` + `split('\n')` для history.jsonl — вся строка в памяти. Companion использует `createReadStream` + `readline` (streaming). Нет защиты от OOM.
- **Пустые директории (DATA-02):** Обработка через `try/catch` в `readdirSync` — без тестов
- **Отсутствующие директории (DATA-03):** `existsSync` проверка — есть, без тестов

### Критический риск: Claude `parseHistory()`

Функция читает `history.jsonl` в буфер с ограничением 10000 строк:
```typescript
const buffer: string[] = [];
for await (const line of rl) {
  buffer.push(line);
  if (buffer.length > 10000) buffer.splice(0, 5000);
}
```
Это streaming (readline), но не защищает от BOM и null полей.

---

## Shared Utilities — CODE-02

### Что сейчас

Каждый агент дублирует логику:
- `JSON.parse` с try/catch в цикле — в claude.ts, codex.ts, companion.ts
- `existsSync` + `readdirSync` паттерны — во всех 5 адаптерах
- Чтения файлов: нет единой функции `safeReadJson`

### Что нужно (CODE-02)

Вынести shared utilities в отдельный модуль (например `src/core/fs-utils.ts`):
- `safeReadJson(path)` — readFileSync + JSON.parse с try/catch
- `parseJsonlFile(path)` — построчный парсер с обработкой BOM, truncated, null
- `normalizePath(path)` — нормализация путей

---

## Зависимости и инструменты

### Текущие devDependencies

```json
{
  "@types/node": "...",
  "typescript": "5.7.x"
}
```

### Зависимости (runtime)

Нет npm-зависимостей в `dependencies` — пустой объект.

### Что нужно установить для Phase 1

- **vitest** (если мигрировать с node:test) — или принять решение остаться на node:test
- **eslint** + **@typescript-eslint/recommended** — для CODE-02 и lint-скрипта
- **@typescript-eslint/parser**

### Альтернатива без vitest

Остаться на `node:test` + добавить `tests/` директорию с fixture-файлами. node:test нативно поддерживает `--test-reporter` и не требует конфига.

---

## Риски и соображения

1. **CONTEXT.md содержит неверную информацию о vitest** — требует принятия решения: мигрировать или остаться на node:test. Миграция на vitest добавляет зависимость, но даёт лучший DX.

2. **Тесты импортируют из `dist/`** — `npm test` требует `npm run build` сначала. При добавлении новых unit-тестов (особенно на fixture-файлах) нужно либо продолжать импортировать из `dist/`, либо использовать `tsx` для прямого импорта из `src/`.

3. **BOM в history.jsonl** — реальный риск на Windows. Codex и Claude читают файлы целиком через `readFileSync('utf8')` — BOM не стрипается автоматически.

4. **10MB+ файлы:** Claude `parseHistory()` использует streaming, но accumulates в памяти. 10MB JSONL с большим числом коротких строк может создать `buffer` из 100K+ элементов.

5. **noUncheckedIndexedAccess** откроет ошибки в местах доступа через индексы массивов — особенно в `sessions/loader.ts` и всех адаптерах. Стратегия из CONTEXT: исправить все сразу.

6. **ESLint** нужно настроить аккуратно — не добавлять чрезмерные правила, только `@typescript-eslint/recommended`.

7. **Тесты на реальных данных** (conditional) — должны скипаться в CI где агенты не установлены. Использовать `process.env.CI` или проверку `detect()`.

---

## Validation Architecture (как проверить завершение фазы)

### Критерий 1: `npm test` без ошибок конфигурации
- Запустить `npm test` — должны пройти все тесты без ошибок
- Проверить что новые fixture-тесты включены в test runner

### Критерий 2: TypeScript strict + noUncheckedIndexedAccess
- `tsconfig.json` содержит `"noUncheckedIndexedAccess": true`
- `npm run build` или `npx tsc --noEmit` завершается без ошибок
- Все найденные TS-ошибки залогированы как issues (не подавлены через `// @ts-ignore`)

### Критерий 3: Fixture-файлы
Структура `tests/fixtures/` с файлами:
```
tests/fixtures/
├── shared/
│   ├── truncated.jsonl        # обрезанная последняя строка
│   ├── bom.jsonl              # с UTF-8 BOM (\uFEFF)
│   ├── null-fields.jsonl      # null в sessionId/timestamp
│   └── empty.jsonl            # пустой файл
└── claude/
│   └── valid-session.jsonl    # анонимизированная реальная сессия
```
(10MB файл генерируется на лету через test helper, не коммитится)

### Критерий 4: Session identity тесты (SESS-15)
Для каждого агента проходящие тесты документируют:
- Формат JSONL-строки / файл хранения
- Извлечение session ID
- Путь хранения
- Conditional тест на реальных данных (скипается если агент не установлен)

### Критерий 5: `claude-sessions list` без краша при повреждённых данных
- Интеграционный тест: создать mock-директорию с truncated, BOM, null-fields JSONL
- `claude-sessions list` возвращает список (пустой или частичный), не падает

---

## RESEARCH COMPLETE
