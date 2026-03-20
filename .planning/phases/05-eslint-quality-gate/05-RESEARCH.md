# Phase 5: ESLint config и quality gate — Research

## Current State Analysis

**Файлы:**
- `src/`: 61 TypeScript файл
- `tests/`: 31 `.mjs` файл (не TypeScript), 0 `.ts`

**Существующий ESLint:**
- Файл `eslint.config.js` уже существует (flat config формат, ESLint 10)
- Использует `@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser` напрямую (старый API)
- НЕ использует новый объединённый пакет `typescript-eslint` (v8 unified API)
- Правила: только базовые (`no-unused-vars`, `no-explicit-any: warn`, `no-require-imports`)
- Игнорирует `tests/**` — это НАРУШЕНИЕ решения пользователя (линтить и tests/)

**Установленные пакеты:**
- `eslint@10.0.3` — установлен
- `@typescript-eslint/eslint-plugin@8.57.1` — установлен
- `@typescript-eslint/parser@8.57.1` — установлен
- `eslint-plugin-import` — НЕ установлен
- `eslint-import-resolver-typescript` — НЕ установлен
- `eslint-config-prettier` — НЕ установлен
- `typescript-eslint` (unified) — неизвестно (возможно не установлен отдельно)

**Текущие скрипты в package.json:**
- `lint: "eslint src/"` — уже есть, но только src/, без lint:fix и check
- `typecheck` — ОТСУТСТВУЕТ (нужен для `check` script)

## Violation Assessment

**`:any` типов**: 0 (нет нарушений)
**`as any` кастов**: 0 (нет нарушений)

**Не-`node:` импорты** (потенциальные нарушения при строгих правилах import):
- `from 'fs'` — 20 вхождений
- `from 'path'` — 19 вхождений
- `from 'os'` — 5 вхождений
- `from 'child_process'` — 8 вхождений
- Итого ~52 импорта без `node:` префикса

**`console.*` вызовы**: 178 — CLI-инструмент, `no-console` нельзя включать как `error`

**Тесты**: файлы `.mjs`, не `.ts` — ESLint с TypeScript parser их не обработает без специальной конфигурации. Нужно решить: линтить `.mjs` отдельным конфигом без TypeScript parser, или вынести из scope.

## Technical Approach

### Миграция конфига

Переименовать/заменить `eslint.config.js` → `eslint.config.mjs`:
1. Перейти на unified API: `import tseslint from 'typescript-eslint'`
2. Использовать `tseslint.config(...)` builder
3. Применить `tseslint.configs.strict` (расширяет recommended)
4. Добавить `eslint-plugin-import` для порядка импортов
5. Добавить `eslint-config-prettier` последним (отключает конфликтные правила)

### Структура eslint.config.mjs

```
tseslint.config(
  { ignores: ['dist/**', 'build/**', 'node_modules/**', '.planning/**', '.claude/**'] },
  // src/*.ts — full TypeScript strict rules
  { files: ['src/**/*.ts'], extends: [tseslint.configs.strict], plugins: {import: ...}, rules: {...} },
  // tests/*.mjs — только базовые правила без TypeScript parser
  { files: ['tests/**/*.mjs'], rules: {...} },
  // prettier last
  eslintConfigPrettier
)
```

### Правила `no-console`
CLI-инструмент — `console.*` это норма. Настроить `no-console: off` или `warn`.

### Импорты без `node:` prefix
`eslint-plugin-import` rule `import/no-nodejs-modules` или `node/prefer-global/...` — НЕ включать принудительно, либо настроить `import/extensions` мягко. Альтернатива: использовать `n` плагин (eslint-plugin-n) для enforce `node:` prefix.

### `.prettierrc`
Создать файл с `tabWidth=3, singleQuote=true, printWidth=180`.

## Dependencies

Нужно доустановить:
```
npm install -D \
  eslint-plugin-import@latest \
  eslint-import-resolver-typescript@latest \
  eslint-config-prettier@latest
```

Опционально (для `node:` prefix enforce):
```
npm install -D eslint-plugin-n
```

Уже установлены и готовы к использованию:
- `eslint@10.0.3`
- `@typescript-eslint/eslint-plugin@8.57.1`
- `@typescript-eslint/parser@8.57.1`

**Важно:** ESLint 10 + `@typescript-eslint` v8 — совместимы. Unified пакет `typescript-eslint` (без `@`) может понадобиться для builder API. Проверить наличие в node_modules.

## Validation Architecture

**npm scripts итоговые:**
```json
{
  "lint": "eslint src/ tests/",
  "lint:fix": "eslint src/ tests/ --fix",
  "typecheck": "tsc --noEmit",
  "check": "npm run lint && npm run typecheck"
}
```

**Процесс верификации:**
1. `npm run lint` — 0 errors после lint:fix
2. `npm run typecheck` — 0 errors (уже работает)
3. `npm run check` — оба проходят последовательно
4. `npm run build` — не сломан после изменений

## Key Findings

1. **`eslint.config.js` уже существует** — не нужно создавать с нуля, нужно мигрировать на unified API и расширить правила. Переименовать в `.mjs`.

2. **Тесты — `.mjs`, не `.ts`** — TypeScript parser не применим к tests/. Либо отдельный config-block без project-aware parser, либо исключить tests/ из TypeScript-специфичного lint (но линтить базовыми правилами).

3. **~52 non-`node:` импорта** — основной источник потенциальных нарушений при strict import rules. Решение: либо не включать `node:` prefix rule, либо исправить автоматически через lint:fix.

4. **178 `console.*`** — CLI-инструмент, отключить `no-console` или поставить `warn`.

5. **`eslint-plugin-import`, `eslint-config-prettier` не установлены** — требуют `npm install -D`.

6. **`typecheck` script отсутствует** — нужно добавить в package.json для работы `check` script.

7. **`eslint-config-prettier` должен быть последним** в конфиге — отключает конфликтные правила ESLint.

8. **ESLint 10 совместим с flat config** — `.mjs` расширение предпочтительно для ESM проекта.

## RESEARCH COMPLETE
