import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readIndex, writeIndex } from './index.mjs';
import { extractL0FromJSONL } from './extract-l0.mjs';

export function migrateSessionIndex(oldIndexPath, newIndexPath, projectsDir) {
   // If new index already exists, merge newer entries from old
   if (existsSync(newIndexPath)) {
      const existing = readIndex(newIndexPath);
      if (!existsSync(oldIndexPath)) return existing;
      try {
         const oldData = JSON.parse(readFileSync(oldIndexPath, 'utf8'));
         let merged = false;
         for (const [id, entry] of Object.entries(oldData)) {
            if (!existing.sessions[id]) {
               existing.sessions[id] = {
                  summary: entry.summary || '',
                  project: entry.project || '',
                  lastActive: entry.lastActive || Date.now(),
               };
               merged = true;
            }
         }
         if (merged) writeIndex(newIndexPath, existing);
      } catch {}
      return existing;
   }

   // Fresh migration
   if (!existsSync(oldIndexPath)) return readIndex(newIndexPath);
   try {
      const oldData = JSON.parse(readFileSync(oldIndexPath, 'utf8'));
      const newIndex = { version: 1, memories: {}, sessions: {} };
      for (const [id, entry] of Object.entries(oldData)) {
         newIndex.sessions[id] = {
            summary: entry.summary || '',
            project: entry.project || '',
            lastActive: entry.lastActive || 0,
         };
      }
      writeIndex(newIndexPath, newIndex);
      return newIndex;
   } catch {
      return readIndex(newIndexPath);
   }
}

export function generateL0ForExistingSessions(index, projectsDir) {
   let count = 0;
   for (const [sessionId, session] of Object.entries(index.sessions)) {
      if (session.l0) continue;
      try {
         const dirs = readdirSync(projectsDir);
         for (const dir of dirs) {
            const jsonlPath = join(projectsDir, dir, sessionId + '.jsonl');
            if (existsSync(jsonlPath)) {
               const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).slice(-50);
               session.l0 = extractL0FromJSONL(lines, session.project);
               session.l1_ready = false;
               count++;
               break;
            }
         }
      } catch {}
   }
   return count;
}
