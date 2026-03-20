# Stack Recommendations: Node.js TypeScript CLI — Audit & Stabilization (2025)

Контекст: brownfield CLI-утилита, ~42 TS-файла, zero runtime deps, Node.js ≥18, ESM, 5 агент-адаптеров, filesystem-heavy, postinstall migrations.

---

## Testing Framework

### Node.js native test runner (node:test) — РЕКОМЕНДУЕТСЯ

**Версия**: встроен в Node.js ≥18.x, зрелый в ≥20.x, полнофункциональный в ≥22.x.

**Почему**: Проект имеет zero runtime dependencies — это жёсткое ограничение. `node:test` полностью встроен, не добавляет ни одного пакета в node_modules, поддерживает `--experimental-vm-modules` для ESM (Node.js ≥20), имеет async/await, subtests, `beforeEach`/`afterEach`, встроенный `assert`.

**Что НЕ использовать и почему**:
- **Jest** — требует трансформации ESM через Babel/ts-jest, добавляет >150 пакетов в devDependencies, конфигурация с ESM-проектами нетривиальна в 2025.
- **Vitest** — отличный выбор для Vite-проектов, но тянет Vite как зависимость (~200 MB), избыточно для CLI без bundler.
- **Mocha** — устарел как основной выбор; нет встроенного assertion, нужны chai/sinon.

**Структура запуска**:
```json
"test": "node --import tsx/esm --test src/**/*.test.ts",
"test:coverage": "node --import tsx/esm --experimental-test-coverage --test src/**/*.test.ts"
```

**Mocking для filesystem-heavy CLI**:

Стратегия 1 — **Dependency Injection** (предпочтительно): Все функции принимают `fs`-объект как параметр (или `{ readFile, writeFile, exists }`). В тестах передаётся mock-объект. Без патчинга глобального модуля — безопаснее, предсказуемее, работает в ESM без проблем.

Стратегия 2 — **`node:test` mock.module()**: Начиная с Node.js ≥22.3.0, `mock.module('node:fs/promises', ...)` стабильно работает. Для Node.js 18–20 используй `--experimental-mock-modules`.

Стратегия 3 — **tmpdir isolation**: Для интеграционных тестов — `fs.mkdtemp(os.tmpdir())`, реальные файлы во временных директориях. Teardown через `afterEach`. Медленнее, но точнее для postinstall/migration тестов.

**Что НЕ использовать**:
- `mock-fs` — не поддерживает ESM нативно, заброшен (последний релиз 2022).
- `memfs` — добавляет зависимость; использовать только если DI невозможен по архитектурным причинам.

### Coverage

**Инструмент**: встроенный `--experimental-test-coverage` (Node.js ≥20) + `c8` как fallback.

```
c8@10.x — обёртка над V8 coverage, работает с ESM, без трансформаций
```

**Конфигурация c8** (`.c8rc.json`):
```json
{
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/types/**"],
  "reporter": ["text", "lcov"],
  "check-coverage": true,
  "lines": 80,
  "functions": 80
}
```

**Почему c8, не nyc**: nyc использует Istanbul инструментацию (не V8-native), хуже работает с ESM, устаревает. c8 использует V8 встроенный coverage — точнее, быстрее, нет трансформации.

---

## Migration & Upgrade Tooling

### Patterns для npm postinstall migrations

**Подход**: versioned migration runner в `scripts/postinstall.ts`.

Алгоритм:
1. Прочитать `.version` из `~/.claude-sessions/state.json` (или аналога).
2. Запустить цепочку migration-функций: `migrate_v1_to_v2`, `migrate_v2_to_v3`, ...
3. Каждая миграция — идемпотентна: проверяет `if (alreadyMigrated()) return`.
4. Записать новую версию только после успешного завершения всех шагов.

**Versioned schema migrations для config-файлов**:

```typescript
// Паттерн: каждая миграция — чистая функция
interface Migration {
  from: number;  // schema version
  to: number;
  migrate: (config: unknown) => unknown;
  rollback?: (config: unknown) => unknown;
}
```

Хранить `schemaVersion: number` в каждом конфиг-файле. При загрузке — прогонять через цепочку миграций до текущей версии.

**Почему НЕ использовать db-migrate, umzug**: это инструменты для SQL/NoSQL баз. Для JSON/JSONL конфигов — overhead без пользы.

### Safe rollback strategies

1. **Backup-before-migrate**: перед изменением файла — `cp file file.bak.{timestamp}`. Максимум 3 бэкапа на файл (rotate).
2. **Atomic write**: запись через temp-файл + `fs.rename()` — атомарна на одном томе. Защита от partial writes при крэше.
3. **Migration log**: записывать в `~/.claude-sessions/migration.log` что было сделано — упрощает диагностику.
4. **Dry-run mode**: `postinstall --dry-run` для проверки без изменений.

---

## Code Quality

### Static analysis для TypeScript

**TypeScript compiler**: `typescript@5.5.x` — текущий стабильный LTS-совместимый.

Строгий `tsconfig.json`:
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true
}
```

`noUncheckedIndexedAccess` — критически важен для JSONL-парсинга: `arr[0]` возвращает `T | undefined`, а не `T`. Предотвращает классический баг "undefined is not an object" при пустых сессиях.

**ESLint**: `eslint@9.x` с flat config (`eslint.config.mjs`).

Плагины:
- `@typescript-eslint/eslint-plugin@8.x` — TypeScript-специфичные правила.
- `eslint-plugin-unicorn@55.x` — edge case detection: запрет `process.exit()` без аргументов, предпочтение `Array.from()` над spread, запрет `new Array(n)`.

**Что НЕ использовать**:
- `tslint` — deprecated с 2020.
- `prettier` как ESLint plugin — конфликты; использовать отдельно (tabWidth=3, singleQuote=true — уже задано в глобальных правилах).

### Linting для edge case detection

Ключевые правила для этого проекта:

```javascript
// eslint.config.mjs — критичные для CLI с FS-операциями
rules: {
  '@typescript-eslint/no-floating-promises': 'error',      // необработанные async
  '@typescript-eslint/no-explicit-any': 'error',           // нет any в JSONL-парсерах
  '@typescript-eslint/prefer-nullish-coalescing': 'error', // ?? вместо ||
  'unicorn/no-process-exit': 'error',                      // использовать process.exitCode
  'unicorn/prefer-top-level-await': 'error',               // ESM top-level await
  'no-restricted-syntax': ['error', {                      // запрет sync FS в async-контексте
    selector: "CallExpression[callee.property.name=/Sync$/]",
    message: "Use async FS methods"
  }]
}
```

### Type-safety patterns для JSONL-парсинга

**Проблема**: `JSON.parse()` возвращает `any`. При повреждённых JSONL строках — runtime crashes.

**Решение 1 — Zod для runtime validation**: `zod@3.x` — единственная допустимая devDependency для тестов/валидации (не runtime dep если использовать только в тестах). Но проект имеет zero deps constraint.

**Решение 2 — Самописный type guard (zero deps)**:
```typescript
// Паттерн для JSONL без внешних зависимостей
function parseJsonlLine<T>(
  line: string,
  guard: (x: unknown) => x is T
): T | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;  // повреждённая строка — null, не crash
  }
}
```

Комбинировать с `noUncheckedIndexedAccess` — компилятор форсирует проверку каждого поля.

**Решение 3 — branded types для путей**:
```typescript
type AbsolutePath = string & { readonly _brand: 'AbsolutePath' };
function toAbsolutePath(p: string): AbsolutePath {
  if (!path.isAbsolute(p)) throw new Error(`Not absolute: ${p}`);
  return p as AbsolutePath;
}
```

Предотвращает передачу относительных путей туда, где ожидаются абсолютные — именно та проблема, которая возникает при работе с `~/.claude/`, `~/.codex/`, etc.

---

## Key Recommendations

| Инструмент | Версия | Назначение | Тип |
|------------|--------|------------|-----|
| `node:test` | Node.js ≥20 built-in | Unit/integration тесты | built-in |
| `tsx` | `4.x` | TypeScript execution без компиляции (тесты, postinstall) | devDep |
| `c8` | `10.x` | V8-native coverage для ESM | devDep |
| `typescript` | `5.5.x` | Компилятор, строгий режим | devDep |
| `eslint` | `9.x` | Линтер с flat config | devDep |
| `@typescript-eslint/eslint-plugin` | `8.x` | TS-специфичные правила | devDep |
| `eslint-plugin-unicorn` | `55.x` | Edge case detection | devDep |

**tsx vs ts-node**: `tsx@4.x` использует esbuild под капотом, работает с ESM нативно без `experimentalSpecifierResolution`, запускается быстрее. `ts-node` требует дополнительной конфигурации для ESM и медленнее. В 2025 — tsx предпочтителен.

**Что НЕ добавлять**:
- `jest` / `vitest` — нарушают zero-deps философию для devDependencies, избыточны.
- `mock-fs` — не поддерживает ESM.
- `nyc` — заменён c8.
- `zod` в runtime — нарушает zero runtime deps. Только в тестах как devDep если нужно.
- `ts-jest` — легаси, плохая совместимость с ESM.

**Порядок внедрения** (рекомендуемый для этого проекта):
1. Настроить TypeScript строгий режим + ESLint (находит баги без тестов).
2. Добавить branded types для путей + type guards для JSONL-парсинга.
3. Написать unit-тесты через `node:test` + DI-паттерн для FS.
4. Написать интеграционные тесты с tmpdir isolation.
5. Реализовать migration runner с backup + atomic write.

---

*Дата: 2026-03-20 | Проект: claude-sessions audit & stabilization*
