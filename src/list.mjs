/**
 * Text output of session list (for /sessions in Claude Code)
 */

import { loadSessions } from './sessions.mjs';
import { ensureClaudeDir } from './config.mjs';
import { t } from './i18n.mjs';

export default async function list(args = []) {
   ensureClaudeDir();

   let limit = 20;
   let projectFilter = null;
   let searchQuery = null;

   for (let i = 0; i < args.length; i++) {
      if (args[i] === '--limit' && args[i + 1]) {
         limit = parseInt(args[i + 1], 10);
         i++;
      } else if (args[i] === '--project' && args[i + 1]) {
         projectFilter = args[i + 1];
         i++;
      } else if (args[i] === '--search' && args[i + 1]) {
         searchQuery = args[i + 1];
         i++;
      } else if (args[i] === '--all') {
         limit = 9999;
      }
   }

   const sessions = await loadSessions({ projectFilter, searchQuery, limit });

   if (sessions.length === 0) {
      console.log(t('noSessionsFound'));
      return;
   }

   const title = searchQuery ? t('searchResults', searchQuery, sessions.length) : t('recentSessions', sessions.length);

   console.log(`\n📋 ${title}:\n`);
   console.log('─'.repeat(100));

   for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const num = String(i + 1).padStart(2, ' ');
      const msgCount = s.count > 1 ? ` ${t('msgs', s.count)}` : '';

      console.log(`${num}. [${s.dateStr}] 📁 ${s.project}${msgCount}`);
      console.log(`    💬 ${s.summary}`);
      console.log(`    ▶  claude --resume ${s.id}`);
      console.log('─'.repeat(100));
   }

   console.log(`\n💡 ${t('commands')}`);
   console.log(`   claude-sessions                    — ${t('interactivePicker')}`);
   console.log(`   claude-sessions search <text>      — ${t('searchByContent')}`);
   console.log(`   claude-sessions list --project X   — ${t('filterByProject')}`);
   console.log(`   claude-sessions list --limit 50    — ${t('showMore')}`);
   console.log(`   claude-sessions summarize          — ${t('aiSummaries')}\n`);
}
