/**
 * Delete session with validation and safe JSON parsing.
 * Removes from all adapters: Claude, Companion, Qwen, Gemini, Codex.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { HISTORY_FILE, SESSION_INDEX, MEMORY_DIR, findSessionJsonl } from '../core/config.js';
import { t } from '../core/i18n/index.js';

/**
 * Validates sessionId format (UUID or hex string)
 */
function isValidSessionId(id: string): boolean {
   return /^[a-f0-9-]+$/i.test(id) && id.length >= 8;
}

export default async function deleteSession(sessionId: string): Promise<void> {
   if (!isValidSessionId(sessionId)) {
      console.error(`\n${t('invalidId', sessionId)}`);
      console.error(`${t('expectedUUID')}\n`);
      process.exit(1);
   }

   console.log(`\n${t('deleting', sessionId)}`);
   const home = homedir();

   // Claude: history.jsonl
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

   // Claude: session-index.json
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as Record<string, unknown>;
         // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
         delete index[sessionId];
         writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
         console.log(`   ✅ ${t('indexCleaned')}`);
      } catch {
         // Ignore parse errors
      }
   }

   // Claude: JSONL session file
   const found = findSessionJsonl(sessionId);
   if (found) {
      unlinkSync(found.path);
      console.log(`   ✅ ${t('removed', found.path)}`);
   }

   // Companion: recordings
   const recordingsDir = join(home, '.companion', 'recordings');
   if (existsSync(recordingsDir)) {
      try {
         for (const file of readdirSync(recordingsDir)) {
            if (file.length >= 36 && file.slice(0, 36) === sessionId) {
               unlinkSync(join(recordingsDir, file));
               console.log(`   ✅ Companion recording: ${file}`);
            }
         }
      } catch { /* skip */ }
   }

   // Qwen: chat files
   const qwenProjectsDir = join(home, '.qwen', 'projects');
   if (existsSync(qwenProjectsDir)) {
      try {
         for (const proj of readdirSync(qwenProjectsDir)) {
            const chatFile = join(qwenProjectsDir, proj, 'chats', `${sessionId}.jsonl`);
            if (existsSync(chatFile)) {
               unlinkSync(chatFile);
               console.log(`   ✅ Qwen chat: ${chatFile}`);
            }
         }
      } catch { /* skip */ }
   }

   // Gemini: history project (sessionId = "gemini-{projectName}")
   if (sessionId.startsWith('gemini-')) {
      const projectDir = join(home, '.gemini', 'history', sessionId.slice(7));
      if (existsSync(projectDir)) {
         rmSync(projectDir, { recursive: true, force: true });
         console.log(`   ✅ Gemini project: ${projectDir}`);
      }
   }

   // Codex: history.jsonl + session files
   const codexDir = join(home, '.codex');
   const codexHist = join(codexDir, 'history.jsonl');
   if (existsSync(codexHist)) {
      const content = readFileSync(codexHist, 'utf8');
      const lines = content.split('\n');
      const filtered = lines.filter((line) => {
         if (!line.trim()) return true;
         try {
            return (JSON.parse(line) as { session_id?: string }).session_id !== sessionId;
         } catch {
            return true;
         }
      });
      if (filtered.length < lines.length) {
         writeFileSync(codexHist, filtered.join('\n'));
         console.log(`   ✅ Codex history cleaned`);
      }
   }

   // Reset session cache
   const cacheFile = join(MEMORY_DIR, 'sessions-cache.json');
   if (existsSync(cacheFile)) {
      unlinkSync(cacheFile);
   }

   console.log(`\n✅ ${t('sessionDeletedFull', sessionId)}\n`);
}
