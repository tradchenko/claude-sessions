#!/usr/bin/env node

/**
 * claude-sessions — CLI для управления сессиями Claude Code
 *
 * Использование:
 *   claude-sessions              — интерактивный TUI пикер
 *   claude-sessions list         — текстовый список
 *   claude-sessions search <текст> — поиск по содержимому
 *   claude-sessions summarize    — AI-резюме для сессий без описания
 *   claude-sessions delete <id>  — удалить сессию
 *   claude-sessions restore <id> — восстановить недоступную сессию
 *   claude-sessions install      — установить slash-команды и hooks
 *   claude-sessions uninstall    — удалить slash-команды и hooks
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'src');

const args = process.argv.slice(2);
const command = args[0];

// Если первый аргумент — число, это быстрый выбор
if (/^\d+$/.test(command)) {
   const { default: picker } = await import(resolve(srcDir, 'picker.mjs'));
   await picker(['--quick', command]);
   process.exit(0);
}

switch (command) {
   case 'list':
   case 'ls': {
      const { default: list } = await import(resolve(srcDir, 'list.mjs'));
      await list(args.slice(1));
      break;
   }

   case 'search':
   case 's': {
      const query = args.slice(1).join(' ');
      if (!query) {
         console.error('Использование: claude-sessions search <текст>');
         process.exit(1);
      }
      const { default: list } = await import(resolve(srcDir, 'list.mjs'));
      await list(['--search', query]);
      break;
   }

   case 'summarize':
   case 'sum': {
      const { default: summarize } = await import(resolve(srcDir, 'summarize.mjs'));
      await summarize(args.slice(1));
      break;
   }

   case 'delete':
   case 'del':
   case 'rm': {
      const id = args[1];
      if (!id) {
         console.error('Использование: claude-sessions delete <session-id>');
         process.exit(1);
      }
      const { default: deleteSession } = await import(resolve(srcDir, 'delete.mjs'));
      await deleteSession(id);
      break;
   }

   case 'restore': {
      const id = args[1];
      if (!id) {
         console.error('Использование: claude-sessions restore <session-id>');
         process.exit(1);
      }
      const { default: restore } = await import(resolve(srcDir, 'restore.mjs'));
      await restore(id);
      break;
   }

   case 'install': {
      const { default: install } = await import(resolve(srcDir, 'install.mjs'));
      await install(args.slice(1));
      break;
   }

   case 'uninstall': {
      const { default: uninstall } = await import(resolve(srcDir, 'uninstall.mjs'));
      await uninstall();
      break;
   }

   case 'help':
   case '--help':
   case '-h': {
      console.log(`
claude-sessions — Менеджер сессий Claude Code

Команды:
  (без аргументов)     Интерактивный TUI пикер
  <номер>              Быстрый запуск сессии по номеру
  list [опции]         Текстовый список сессий
  search <текст>       Поиск по содержимому сессий
  summarize            AI-генерация резюме
  delete <id>          Удалить сессию
  restore <id>         Восстановить сессию из JSONL
  install              Установить slash-команды и hooks
  uninstall            Удалить slash-команды и hooks

Опции для list:
  --project <имя>      Фильтр по проекту
  --search <текст>     Поиск по содержимому
  --limit <N>          Количество (по умолчанию 20)
  --all                Показать все

TUI пикер (клавиши):
  ↑↓          Навигация (с переходом в начало/конец)
  Ввод текста Мгновенный поиск
  Enter       Открыть сессию
  Ctrl-D      Удалить сессию
  Ctrl-A      AI-резюме
  Ctrl-R      Обновить список
  Esc         Выход

Алиасы: cs = claude-sessions
`);
      break;
   }

   default: {
      // По умолчанию — интерактивный пикер
      const { default: picker } = await import(resolve(srcDir, 'picker.mjs'));
      const pickerArgs = command ? ['--' + command, ...args.slice(1)] : args;
      await picker(pickerArgs.filter(Boolean));
      break;
   }
}
