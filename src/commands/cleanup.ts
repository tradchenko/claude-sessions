/**
 * Очистка недоступных (orphaned) сессий.
 * Удаляет из history.jsonl и session-index.json записи сессий,
 * у которых нет ни JSONL-файла, ни snapshot.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { loadSessions } from '../sessions/loader.js';
import { CLAUDE_DIR } from '../core/config.js';
import type { Session } from '../sessions/loader.js';
import { t } from '../core/i18n.js';

/** Найти все недоступные сессии (нет JSONL и нет snapshot) */
async function findOrphanedSessions(): Promise<Session[]> {
   const all = await loadSessions({ limit: 1000 });
   return all.filter((s) => s.hasJsonl === false && !s.hasSnapshot);
}

/** Удалить записи сессий из history.jsonl и session-index.json */
function removeSessionRecords(sessionIds: Set<string>): { historyRemoved: number; indexRemoved: number } {
   let historyRemoved = 0;
   let indexRemoved = 0;

   // Очистка history.jsonl
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

   // Очистка session-index.json
   const idxPath = join(CLAUDE_DIR, 'session-index.json');
   if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, 'utf8')) as Record<string, unknown>;
      for (const id of sessionIds) {
         if (id in idx) {
            delete idx[id];
            indexRemoved++;
         }
      }
      writeFileSync(idxPath, JSON.stringify(idx, null, 2));
   }

   return { historyRemoved, indexRemoved };
}

/** Запросить подтверждение у пользователя */
function askConfirmation(question: string): Promise<boolean> {
   const rl = createInterface({ input: process.stdin, output: process.stdout });
   return new Promise((resolve) => {
      rl.question(question, (answer) => {
         rl.close();
         resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
   });
}

export default async function cleanup(args: string[]): Promise<void> {
   const dryRun = args.includes('--dry-run');
   const force = args.includes('--force');

   console.log(t('searchingOrphaned'));
   const orphaned = await findOrphanedSessions();

   if (orphaned.length === 0) {
      console.log(`✅ ${t('noOrphanedFound')}`);
      return;
   }

   // Показать найденные сессии
   console.log(t('foundOrphaned', orphaned.length));
   for (const s of orphaned.slice(0, 20)) {
      console.log(`  [${s.dateStr}] ${s.project}  ${s.summary.slice(0, 50)}  (${s.agent})`);
   }
   if (orphaned.length > 20) {
      console.log(`  ${t('andMore', orphaned.length - 20)}`);
   }
   console.log();

   if (dryRun) {
      console.log(`🔍 ${t('dryRunWouldDelete', orphaned.length)}`);
      return;
   }

   // Подтверждение
   if (!force) {
      const confirmed = await askConfirmation(t('confirmDeleteOrphaned', orphaned.length));
      if (!confirmed) {
         console.log(t('cancelled'));
         return;
      }
   }

   // Удаление
   const ids = new Set(orphaned.map((s) => s.id));
   const { historyRemoved, indexRemoved } = removeSessionRecords(ids);
   console.log(`\n✅ ${t('cleanupComplete')}`);
   console.log(`   ${t('historyRemoved', historyRemoved)}`);
   console.log(`   ${t('indexRemoved', indexRemoved)}`);
}
