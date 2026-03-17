/**
 * Remove slash commands and hooks
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { COMMANDS_DIR, SCRIPTS_DIR, SETTINGS_FILE, CLAUDE_DIR } from './config.mjs';
import { t } from './i18n.mjs';

export default async function uninstall() {
   console.log(`\n🗑  ${t('removing')}\n`);

   // Remove slash commands
   const commands = ['sessions.md', 'session-summarize.md'];
   for (const cmd of commands) {
      const path = join(COMMANDS_DIR, cmd);
      if (existsSync(path)) {
         unlinkSync(path);
         console.log(`   ✅ ${t('removedCommand', cmd)}`);
      }
   }

   // Remove scripts
   const scripts = ['save-summary.mjs', 'save-session-summary.mjs'];
   for (const script of scripts) {
      const path = join(SCRIPTS_DIR, script);
      if (existsSync(path)) {
         unlinkSync(path);
         console.log(`   ✅ ${t('removedScript', script)}`);
      }
   }

   // Remove hook from settings.json
   if (existsSync(SETTINGS_FILE)) {
      try {
         const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
         if (settings.hooks?.Stop) {
            const before = settings.hooks.Stop.length;
            settings.hooks.Stop = settings.hooks.Stop.filter((entry) => !JSON.stringify(entry).includes('save-session-summary'));
            if (settings.hooks.Stop.length < before) {
               writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
               console.log(`   ✅ ${t('removedHook')}`);
            }
         }
      } catch {}
   }

   // session-index.json is NOT removed — it's user data
   console.log(`\n   ℹ️  ${t('indexPreserved', join(CLAUDE_DIR, 'session-index.json'))}`);
   console.log(`\n✅ ${t('removalComplete')}\n`);
}
