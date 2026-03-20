/**
 * Text output of session list (for /sessions in Claude Code)
 */

import { loadSessions } from '../sessions/loader.js';
import { readSessionCache, writeSessionCache } from '../sessions/cache.js';
import { ensureClaudeDir } from '../core/config.js';
import { t } from '../core/i18n.js';
import { getAdapter } from '../agents/registry.js';
import type { AgentId } from '../agents/types.js';

/** Short agent labels */
const AGENT_LABELS: Record<string, string> = {
   claude: 'CLD',
   codex: 'CDX',
   qwen: 'QWN',
   gemini: 'GEM',
};

export default async function list(args: string[] = []): Promise<void> {
   ensureClaudeDir();

   let limit = 20;
   let projectFilter: string | undefined;
   let searchQuery: string | undefined;

   for (let i = 0; i < args.length; i++) {
      if (args[i] === '--limit' && args[i + 1] !== undefined) {
         limit = parseInt(args[i + 1] ?? '', 10);
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

   // Use cache for instant response if available
   const cached = readSessionCache();
   const sessions = (cached && cached.length > 0 && !projectFilter && !searchQuery)
      ? cached.slice(0, limit)
      : await loadSessions({ projectFilter, searchQuery, limit });

   if (sessions.length === 0) {
      console.log(t('noSessionsFound'));
      return;
   }

   const title = searchQuery ? t('searchResults', searchQuery, sessions.length) : t('recentSessions', sessions.length);

   console.log(`\n📋 ${title}:\n`);
   console.log('─'.repeat(100));

   for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (!s) continue;
      const num = String(i + 1).padStart(2, ' ');
      const msgCount = s.count > 1 ? ` ${t('msgs', s.count)}` : '';

      const label = AGENT_LABELS[s.agent] || s.agent.slice(0, 3).toUpperCase();
      const via = s.viaCompanion ? ' [C]' : '';
      console.log(`${num}. ${label} [${s.dateStr}] 📁 ${s.project}${msgCount}${via}`);
      console.log(`    💬 ${s.summary.slice(0, 80)}`);
      const adapter = getAdapter(s.agent as AgentId);
      const resumeCmd = adapter?.getResumeCommand(s.id);
      if (resumeCmd) {
         console.log(`    ▶  ${resumeCmd.join(' ')}`);
      }
      console.log('─'.repeat(100));
   }

   console.log(`\n💡 ${t('commands')}`);
   console.log(`   claude-sessions                    — ${t('interactivePicker')}`);
   console.log(`   claude-sessions search <text>      — ${t('searchByContent')}`);
   console.log(`   claude-sessions list --project X   — ${t('filterByProject')}`);
   console.log(`   claude-sessions list --limit 50    — ${t('showMore')}`);
   console.log(`   claude-sessions summarize          — ${t('aiSummaries')}\n`);
}
