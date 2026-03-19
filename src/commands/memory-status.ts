/**
 * Display session memory status
 */

import { readIndex } from '../memory/index.js';
import { MEMORY_INDEX } from '../core/config.js';
import { t } from '../core/i18n.js';

/** Memory entry structure */
interface MemoryEntry {
   category: string;
   name: string;
   description?: string;
   content?: string;
   hotness?: number;
}

/** Session structure in index */
interface SessionEntry {
   l0?: boolean;
   l1_ready?: boolean;
}

/** Memory index structure */
interface MemoryIndex {
   memories?: Record<string, MemoryEntry>;
   sessions?: Record<string, SessionEntry>;
}

export function formatMemoryStatus(index: MemoryIndex): string {
   const memories = Object.values(index.memories || {});
   const sessions = Object.keys(index.sessions || {});

   const byCategory: Record<string, number> = {};
   for (const m of memories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
   }

   const lines: string[] = [
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

   const pendingL1 = Object.values(index.sessions || {}).filter((s) => s.l0 && !s.l1_ready).length;
   if (pendingL1 > 0) {
      lines.push('', t('memoryPendingL1', pendingL1));
   }

   return lines.join('\n');
}

export default async function memoryStatus(): Promise<void> {
   const index = readIndex(MEMORY_INDEX) as MemoryIndex;
   console.log(formatMemoryStatus(index));
}
