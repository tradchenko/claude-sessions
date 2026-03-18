import { readIndex } from './memory/index.mjs';
import { MEMORY_INDEX } from './config.mjs';
import { t } from './i18n.mjs';

export function formatMemoryStatus(index) {
   const memories = Object.values(index.memories || {});
   const sessions = Object.keys(index.sessions || {});

   const byCategory = {};
   for (const m of memories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
   }

   const lines = [
      t('memoryStatus'),
      `─────────────`,
      t('memoryTotal', memories.length),
      t('memorySessions', sessions.length),
      ``,
      `By category:`,
   ];
   for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${cat}: ${count}`);
   }

   if (memories.length > 0) {
      lines.push('', 'Top 10 by hotness:');
      const top = memories.sort((a, b) => (b.hotness || 0) - (a.hotness || 0)).slice(0, 10);
      for (const m of top) {
         lines.push(`  ${(m.hotness || 0).toFixed(2)} ${m.category}/${m.name} — ${(m.description || '').slice(0, 50)}`);
      }
   }

   const pendingL1 = Object.values(index.sessions || {}).filter(s => s.l0 && !s.l1_ready).length;
   if (pendingL1 > 0) {
      lines.push('', t('memoryPendingL1', pendingL1));
   }

   return lines.join('\n');
}

export default async function memoryStatus() {
   const index = readIndex(MEMORY_INDEX);
   console.log(formatMemoryStatus(index));
}
