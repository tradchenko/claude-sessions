---
plan: "03-01"
status: completed
completed: "2026-03-20"
commits:
  - "2bb2ea2 — feat: создать src/core/i18n/ (6 файлов)"
  - "72807f2 — refactor: мигрировать импорты, удалить монолит"
tests: "213/213 pass"
build: "tsc — OK"
---

# Summary: Plan 03-01 — i18n рефакторинг

## Что сделано

- Создана директория `src/core/i18n/` с 6 файлами вместо монолита в 2282 строки
- `index.ts` — основной движок: типы, translations (11 языков), detectLanguage, t(), getLocale()
- `common.ts` — общие строки + маппинг всех ключей по доменам (документация)
- `sessions.ts` — строки подсистемы сессий (picker, list, restore, delete, cleanup)
- `agents.ts` — строки адаптеров агентов (AdapterError, resume)
- `cli.ts` — строки CLI команд (install, uninstall, usage)
- `memory.ts` — строки подсистемы памяти (enable-memory, memory-search)
- Обновлены импорты в 17 файлах: `*/i18n.js` → `*/i18n/index.js`
- Старый монолит `src/core/i18n.ts` удалён

## Решения

- Доменные модули — stub с re-export из index.ts: чистая архитектура без дублирования типов
- TranslationDict остался единым типом — t<K> требует доступа ко всем ключам
- Маппинг доменов задокументирован в common.ts как справочник

## Верификация

- [x] Директория `src/core/i18n/` содержит 6 файлов
- [x] Старый `src/core/i18n.ts` удалён
- [x] `npm run build` — без ошибок
- [x] `npm test` — 213/213 pass
- [x] Нигде в проекте нет импорта из удалённого монолита
