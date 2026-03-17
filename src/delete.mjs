/**
 * Удаление сессии
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';
import { HISTORY_FILE, SESSION_INDEX, PROJECTS_DIR } from './config.mjs';

export default async function deleteSession(sessionId) {
   console.log(`\n🗑  Удаление сессии ${sessionId}...`);

   // Удаляем из history.jsonl
   if (existsSync(HISTORY_FILE)) {
      const content = readFileSync(HISTORY_FILE, 'utf8');
      const filtered = content
         .split('\n')
         .filter((line) => !line.includes(`"sessionId":"${sessionId}"`))
         .join('\n');
      writeFileSync(HISTORY_FILE, filtered);
      console.log('   ✅ history.jsonl очищен');
   }

   // Удаляем из session-index.json
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         delete index[sessionId];
         writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
         console.log('   ✅ session-index.json очищен');
      } catch {}
   }

   // Удаляем JSONL файл сессии
   if (existsSync(PROJECTS_DIR)) {
      for (const dir of readdirSync(PROJECTS_DIR)) {
         const sessionFile = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
         if (existsSync(sessionFile)) {
            unlinkSync(sessionFile);
            console.log(`   ✅ Удалён ${sessionFile}`);
         }
      }
   }

   console.log(`\n✅ Сессия ${sessionId} удалена\n`);
}
