/**
 * Текстовый вывод списка сессий (для /sessions в Claude Code)
 */

import { loadSessions } from './sessions.mjs';
import { ensureClaudeDir } from './config.mjs';

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
      console.log('Сессий не найдено.');
      return;
   }

   const title = searchQuery ? `Результаты поиска "${searchQuery}" (${sessions.length})` : `Последние сессии Claude Code (${sessions.length})`;

   console.log(`\n📋 ${title}:\n`);
   console.log('─'.repeat(100));

   for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const num = String(i + 1).padStart(2, ' ');
      const msgCount = s.count > 1 ? ` (${s.count} сообщ.)` : '';

      console.log(`${num}. [${s.dateStr}] 📁 ${s.project}${msgCount}`);
      console.log(`    💬 ${s.summary}`);
      console.log(`    ▶  claude --resume ${s.id}`);
      console.log('─'.repeat(100));
   }

   console.log('\n💡 Команды:');
   console.log('   claude-sessions                    — интерактивный пикер');
   console.log('   claude-sessions search <текст>     — поиск по содержимому');
   console.log('   claude-sessions list --project X   — фильтр по проекту');
   console.log('   claude-sessions list --limit 50    — показать больше');
   console.log('   claude-sessions summarize          — AI-резюме\n');
}
