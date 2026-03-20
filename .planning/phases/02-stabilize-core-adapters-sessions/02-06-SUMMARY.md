---
plan: 02-06
title: "TUI picker: SIGWINCH и стабильность навигации"
status: completed
completed_at: "2026-03-20"
tests_before: 88
tests_after: 94
---

# Summary: Plan 02-06

## Что сделано

### 02-06-01: SIGWINCH с debounce
- Добавлен `handleResize()` с debounce 100ms — предотвращает артефакты при быстром resize
- `process.on("SIGWINCH", handleResize)` — обработка ресайза терминала
- `process.stdout.on("resize", handleResize)` — совместимость с терминалами без SIGWINCH
- В `cleanup()`: `process.removeListener("SIGWINCH", handleResize)` + отмена таймера — нет memory leak
- После resize: пересчёт rows/cols/visibleCount, коррекция scrollOffset, полная перерисовка (`ESC[2J`)

### 02-06-02: Обработка ошибок resume
- `getResumeCommand()` обёрнут в try/catch
- `AdapterError` → показать `⚠ {error.message}` в status bar, picker продолжает работать
- Через 3 секунды statusText сбрасывается
- При этом picker восстанавливается (ALT_SCREEN_ON, SIGWINCH listener переподключается)
- Критическая ошибка (не AdapterError) → выход с сообщением в stderr

### 02-06-03: Граничные случаи навигации
- `moveUp/moveDown/pageUp/pageDown`: early return при `filtered.length === 0` — нет crash
- `Enter` на пустом списке: `getSelected()` возвращает `null`, обработчик делает `return`
- `render()`: при 0 сессий показывает `noSessionsFound` вместо пустого списка
- `scrollOffset` корректируется после resize: `maxScroll = max(0, filtered.length - visibleCount)`
- `w = Math.max(40, this.cols)` — минимальная ширина 40, нет обрезки при узком терминале
- `maxSummary = Math.max(10, ...)` — минимальная длина summary 10 символов

## Файлы изменены
- `src/commands/picker.ts` — +122 строки, -48 строк

## Must haves
- [x] Ресайз терминала → полная перерисовка без артефактов
- [x] SIGWINCH listener снимается при выходе (нет memory leak)
- [x] Ошибка resume → сообщение в status bar, picker продолжает работать
- [x] 0 сессий в списке → корректное отображение, не crash
- [x] Навигация работает после resize

## Тесты
94 pass (было 88 — +6 от параллельного плана 02-03)
