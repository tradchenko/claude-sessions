/**
 * Удаление slash-команд и hooks
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { COMMANDS_DIR, SCRIPTS_DIR, SETTINGS_FILE, CLAUDE_DIR } from './config.mjs';

export default async function uninstall() {
   console.log('\n🗑  Удаление claude-sessions...\n');

   // Удаляем slash-команды
   const commands = ['sessions.md', 'session-summarize.md'];
   for (const cmd of commands) {
      const path = join(COMMANDS_DIR, cmd);
      if (existsSync(path)) {
         unlinkSync(path);
         console.log(`   ✅ Удалена команда: ${cmd}`);
      }
   }

   // Удаляем скрипты
   const scripts = ['save-summary.mjs', 'save-session-summary.mjs'];
   for (const script of scripts) {
      const path = join(SCRIPTS_DIR, script);
      if (existsSync(path)) {
         unlinkSync(path);
         console.log(`   ✅ Удалён скрипт: ${script}`);
      }
   }

   // Удаляем hook из settings.json
   if (existsSync(SETTINGS_FILE)) {
      try {
         const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
         if (settings.hooks?.Stop) {
            const before = settings.hooks.Stop.length;
            settings.hooks.Stop = settings.hooks.Stop.filter((entry) => !JSON.stringify(entry).includes('save-session-summary'));
            if (settings.hooks.Stop.length < before) {
               writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
               console.log('   ✅ Удалён Stop hook');
            }
         }
      } catch {}
   }

   // session-index.json НЕ удаляем — это данные пользователя
   console.log(`\n   ℹ️  session-index.json сохранён: ${join(CLAUDE_DIR, 'session-index.json')}`);
   console.log('\n✅ Удаление завершено.\n');
}
