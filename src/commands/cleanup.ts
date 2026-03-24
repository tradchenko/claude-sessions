/**
 * Cleanup orphaned sessions.
 * Removes records from history.jsonl, session-index.json,
 * and agent-specific storage for sessions with no JSONL or snapshot.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createInterface } from 'readline';
import { loadSessions } from '../sessions/loader.js';
import { CLAUDE_DIR, MEMORY_DIR } from '../core/config.js';
import type { Session } from '../sessions/loader.js';
import { t } from '../core/i18n/index.js';

/** Find all orphaned sessions (no JSONL and no snapshot) */
async function findOrphanedSessions(): Promise<Session[]> {
   const all = await loadSessions({ limit: 1000 });
   return all.filter((s) => !s.hasJsonl && !s.hasSnapshot);
}

/** Remove session records from history.jsonl and session-index.json */
function removeSessionRecords(sessionIds: Set<string>): { historyRemoved: number; indexRemoved: number } {
   let historyRemoved = 0;
   let indexRemoved = 0;

   // Clean history.jsonl
   const histPath = join(CLAUDE_DIR, 'history.jsonl');
   if (existsSync(histPath)) {
      const lines = readFileSync(histPath, 'utf8').split('\n');
      const filtered = lines.filter((line) => {
         if (!line.trim()) return true;
         try {
            const parsed = JSON.parse(line) as { sessionId?: string };
            if (parsed.sessionId && sessionIds.has(parsed.sessionId)) {
               historyRemoved++;
               return false;
            }
            return true;
         } catch {
            return true;
         }
      });
      writeFileSync(histPath, filtered.join('\n'));
   }

   // Clean session-index.json
   const idxPath = join(CLAUDE_DIR, 'session-index.json');
   if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, 'utf8')) as Record<string, unknown>;
      for (const id of sessionIds) {
         if (id in idx) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete idx[id];
            indexRemoved++;
         }
      }
      writeFileSync(idxPath, JSON.stringify(idx, null, 2));
   }

   return { historyRemoved, indexRemoved };
}

/** Remove Companion recordings for given sessions */
function removeCompanionRecordings(sessionIds: Set<string>): number {
   const recordingsDir = join(homedir(), '.companion', 'recordings');
   if (!existsSync(recordingsDir)) return 0;

   let removed = 0;
   try {
      const files = readdirSync(recordingsDir);
      for (const file of files) {
         // Format: {sessionId}_{agent}_{timestamp}_{hash}.jsonl
         const sessionId = file.length >= 36 ? file.slice(0, 36) : '';
         if (sessionId && sessionIds.has(sessionId)) {
            unlinkSync(join(recordingsDir, file));
            removed++;
         }
      }
   } catch {
      // Skip access errors
   }
   return removed;
}

/** Remove Qwen chat files for given sessions */
function removeQwenSessions(sessionIds: Set<string>): number {
   const projectsDir = join(homedir(), '.qwen', 'projects');
   if (!existsSync(projectsDir)) return 0;

   let removed = 0;
   try {
      const projects = readdirSync(projectsDir);
      for (const proj of projects) {
         const chatsDir = join(projectsDir, proj, 'chats');
         if (!existsSync(chatsDir)) continue;
         const files = readdirSync(chatsDir);
         for (const file of files) {
            // Format: {sessionId}.jsonl
            const sessionId = file.replace('.jsonl', '');
            if (sessionIds.has(sessionId)) {
               unlinkSync(join(chatsDir, file));
               removed++;
            }
         }
      }
   } catch {
      // Skip access errors
   }
   return removed;
}

/** Remove Gemini history projects for given sessions */
function removeGeminiSessions(sessionIds: Set<string>): number {
   const historyDir = join(homedir(), '.gemini', 'history');
   if (!existsSync(historyDir)) return 0;

   let removed = 0;
   for (const id of sessionIds) {
      // sessionId = "gemini-{projectName}"
      if (!id.startsWith('gemini-')) continue;
      const projectName = id.slice(7);
      const projectDir = join(historyDir, projectName);
      if (existsSync(projectDir)) {
         rmSync(projectDir, { recursive: true, force: true });
         removed++;
      }
   }
   return removed;
}

/** Remove Codex sessions from history.jsonl and sessions/ */
function removeCodexSessions(sessionIds: Set<string>): number {
   const codexDir = join(homedir(), '.codex');
   if (!existsSync(codexDir)) return 0;

   let removed = 0;

   // Clean ~/.codex/history.jsonl
   const histPath = join(codexDir, 'history.jsonl');
   if (existsSync(histPath)) {
      const lines = readFileSync(histPath, 'utf8').split('\n');
      const filtered = lines.filter((line) => {
         if (!line.trim()) return true;
         try {
            const parsed = JSON.parse(line) as { session_id?: string };
            if (parsed.session_id && sessionIds.has(parsed.session_id)) {
               removed++;
               return false;
            }
            return true;
         } catch {
            return true;
         }
      });
      if (removed > 0) writeFileSync(histPath, filtered.join('\n'));
   }

   // Remove session files from ~/.codex/sessions/
   const sessionsDir = join(codexDir, 'sessions');
   if (existsSync(sessionsDir)) {
      try {
         // Codex stores sessions in YYYY/MM/DD/{sessionId}.json
         const walkAndDelete = (dir: string): void => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
               const fullPath = join(dir, entry.name);
               if (entry.isDirectory()) {
                  walkAndDelete(fullPath);
               } else {
                  const sessionId = entry.name.replace('.json', '');
                  if (sessionIds.has(sessionId)) {
                     unlinkSync(fullPath);
                     removed++;
                  }
               }
            }
         };
         walkAndDelete(sessionsDir);
      } catch {
         // Skip access errors
      }
   }

   return removed;
}

/** Prompt user for confirmation */
function askConfirmation(question: string): Promise<boolean> {
   const rl = createInterface({ input: process.stdin, output: process.stdout });
   return new Promise((resolve) => {
      rl.question(question, (answer) => {
         rl.close();
         resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
   });
}

/** Delete sessions and related data, print summary */
function executeCleanup(sessions: Session[], label: string): void {
   const ids = new Set(sessions.map((s) => s.id));
   const { historyRemoved, indexRemoved } = removeSessionRecords(ids);
   const companionRemoved = removeCompanionRecordings(ids);
   const qwenRemoved = removeQwenSessions(ids);
   const geminiRemoved = removeGeminiSessions(ids);
   const codexRemoved = removeCodexSessions(ids);
   console.log(`\n✅ ${label}`);
   console.log(`   ${t('historyRemoved', historyRemoved)}`);
   console.log(`   ${t('indexRemoved', indexRemoved)}`);
   if (companionRemoved > 0) console.log(`   ${t('companionRemoved', companionRemoved)}`);
   if (qwenRemoved > 0) console.log(`   ${t('qwenRemoved', qwenRemoved)}`);
   if (geminiRemoved > 0) console.log(`   ${t('geminiRemoved', geminiRemoved)}`);
   if (codexRemoved > 0) console.log(`   ${t('codexRemoved', codexRemoved)}`);

   // Reset session cache
   const cacheFile = join(MEMORY_DIR, 'sessions-cache.json');
   if (existsSync(cacheFile)) {
      unlinkSync(cacheFile);
   }
}

/** Display session list (max 20) */
function displaySessions(sessions: Session[]): void {
   for (const s of sessions.slice(0, 20)) {
      const msgs = s.count ? ` (${s.count} msgs)` : '';
      console.log(`  [${s.dateStr}] ${s.project}  ${s.summary.slice(0, 50)}  (${s.agent})${msgs}`);
   }
   if (sessions.length > 20) {
      console.log(`  ${t('andMore', sessions.length - 20)}`);
   }
   console.log();
}

export default async function cleanup(args: string[]): Promise<void> {
   const dryRun = args.includes('--dry-run');
   const force = args.includes('--force');

   // --min-messages N — delete sessions with fewer than N messages
   const minMsgIdx = args.indexOf('--min-messages');
   const minMessages = minMsgIdx !== -1 ? parseInt(args[minMsgIdx + 1] ?? '0', 10) : 0;

   if (minMessages > 0) {
      console.log(t('searchingMinMessages', minMessages));
      const all = await loadSessions({ limit: 1000 });
      // Skip adapters with inaccurate count (Companion and Gemini hardcode count=1)
      const small = all.filter((s) => {
         if (s.viaCompanion && s.count <= 1) return false;
         if (s.agent === 'gemini' && s.count <= 1) return false;
         return s.count > 0 && s.count < minMessages;
      });

      if (small.length === 0) {
         console.log(`✅ ${t('allSessionsAboveMin', minMessages)}`);
         return;
      }

      console.log(`${t('foundMinMessages', small.length, minMessages)}\n`);
      displaySessions(small);

      if (dryRun) {
         console.log(`🔍 ${t('dryRunWouldDelete', small.length)}`);
         return;
      }

      if (!force) {
         const confirmed = await askConfirmation(t('confirmDeleteOrphaned', small.length));
         if (!confirmed) {
            console.log(t('cancelled'));
            return;
         }
      }

      executeCleanup(small, t('deletedMinMessages', small.length, minMessages));
      return;
   }

   // Standard orphaned session cleanup
   console.log(t('searchingOrphaned'));
   const orphaned = await findOrphanedSessions();

   if (orphaned.length === 0) {
      console.log(`✅ ${t('noOrphanedFound')}`);
      return;
   }

   console.log(t('foundOrphaned', orphaned.length));
   displaySessions(orphaned);

   if (dryRun) {
      console.log(`🔍 ${t('dryRunWouldDelete', orphaned.length)}`);
      return;
   }

   if (!force) {
      const confirmed = await askConfirmation(t('confirmDeleteOrphaned', orphaned.length));
      if (!confirmed) {
         console.log(t('cancelled'));
         return;
      }
   }

   executeCleanup(orphaned, t('cleanupComplete'));
}
