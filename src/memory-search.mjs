import { readIndex } from './memory/index.mjs';
import { MEMORY_INDEX } from './config.mjs';
import { t } from './i18n.mjs';

export function searchMemories(index, query) {
   const q = query.toLowerCase();
   return Object.values(index.memories || {})
      .filter(m => {
         const searchText = [m.name, m.category, m.description, m.content]
            .filter(Boolean).join(' ').toLowerCase();
         return searchText.includes(q);
      })
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0));
}

export default async function memorySearch(query) {
   const index = readIndex(MEMORY_INDEX);
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
