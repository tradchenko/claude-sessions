/**
 * Session deletion with validation and safe JSON parsing
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { HISTORY_FILE, SESSION_INDEX, PROJECTS_DIR } from './config.mjs';
import { t } from './i18n.mjs';

/**
 * Validates sessionId format (UUID or hex string)
 */
function isValidSessionId(id) {
   return /^[a-f0-9-]+$/i.test(id) && id.length >= 8;
}

export default async function deleteSession(sessionId) {
   if (!isValidSessionId(sessionId)) {
      console.error(`\n${t('invalidId', sessionId)}`);
      console.error(`${t('expectedUUID')}\n`);
      process.exit(1);
   }

   console.log(`\n${t('deleting', sessionId)}`);

   // Remove from history.jsonl (JSON parsing for safety)
   if (existsSync(HISTORY_FILE)) {
      const content = readFileSync(HISTORY_FILE, 'utf8');
      const filtered = content
         .split('\n')
         .filter((line) => {
            if (!line.trim()) return true;
            try {
               return JSON.parse(line).sessionId !== sessionId;
            } catch {
               return true;
            }
         })
         .join('\n');
      writeFileSync(HISTORY_FILE, filtered);
      console.log(`   ✅ ${t('historyCleaned')}`);
   }

   // Remove from session-index.json
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         delete index[sessionId];
         writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
         console.log(`   ✅ ${t('indexCleaned')}`);
      } catch {}
   }

   // Remove session JSONL file
   if (existsSync(PROJECTS_DIR)) {
      for (const dir of readdirSync(PROJECTS_DIR)) {
         const sessionFile = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
         if (existsSync(sessionFile)) {
            unlinkSync(sessionFile);
            console.log(`   ✅ ${t('removed', sessionFile)}`);
         }
      }
   }

   console.log(`\n✅ ${t('sessionDeletedFull', sessionId)}\n`);
}
