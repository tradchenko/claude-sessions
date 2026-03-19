/**
 * Search through session memory
 */

import { readIndex } from '../memory/index.js';
import { MEMORY_INDEX } from '../core/config.js';
import { t } from '../core/i18n.js';

/** Memory entry structure */
interface MemoryEntry {
   name: string;
   category: string;
   description?: string;
   content?: string;
   hotness?: number;
}

/** Memory index structure */
interface MemoryIndex {
   memories?: Record<string, MemoryEntry>;
}

export function searchMemories(index: MemoryIndex, query: string): MemoryEntry[] {
   const q = query.toLowerCase();
   return Object.values(index.memories || {})
      .filter((m) => {
         const searchText = [m.name, m.category, m.description, m.content].filter(Boolean).join(' ').toLowerCase();
         return searchText.includes(q);
      })
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0));
}

export default async function memorySearch(query: string): Promise<void> {
   const index = readIndex(MEMORY_INDEX) as MemoryIndex;
   const results = searchMemories(index, query);
   if (results.length === 0) {
      console.log(t('memoryNoResults', query));
      return;
   }
   console.log(t('memoryFound', results.length) + '\n');
   for (const m of results) {
      console.log(`  ${(m.hotness || 0).toFixed(2)} ${m.category}/${m.name}`);
      console.log(`  ${m.description || m.content?.slice(0, 80) || ''}\n`);
   }
}
