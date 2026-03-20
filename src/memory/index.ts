// Memory index operations: read, write, locking, limits
import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { MemoryIndex } from './types.js';

const EMPTY_INDEX: MemoryIndex = { version: 1, memories: {}, sessions: {} };
const MAX_MEMORIES = 500;
const PRUNE_TARGET = 400;
// Стale tmp файлы старше 5 минут подлежат удалению
const STALE_TMP_AGE_MS = 5 * 60 * 1000;

/** Best-effort cleanup: удаляет *.tmp.* файлы старше STALE_TMP_AGE_MS рядом с indexPath */
function cleanupStaleTmpFiles(indexPath: string): void {
   try {
      const dir = dirname(indexPath);
      const indexBase = basename(indexPath);
      const now = Date.now();
      const entries = readdirSync(dir);
      for (const entry of entries) {
         // Паттерн: <indexBase>.tmp.<pid>
         if (!entry.startsWith(`${indexBase}.tmp.`)) continue;
         const fullPath = `${dir}/${entry}`;
         try {
            const st = statSync(fullPath);
            if (now - st.mtimeMs >= STALE_TMP_AGE_MS) {
               unlinkSync(fullPath);
            }
         } catch {
            // Игнорируем ошибки удаления — best-effort
         }
      }
   } catch {
      // Игнорируем — cleanup не должен ломать чтение
   }
}

// Read index.json, return empty index on error
export function readIndex(indexPath: string): MemoryIndex {
   // Очищаем stale tmp файлы перед чтением (best-effort)
   cleanupStaleTmpFiles(indexPath);
   try {
      const raw = readFileSync(indexPath, 'utf8');
      return JSON.parse(raw) as MemoryIndex;
   } catch {
      return { ...EMPTY_INDEX, memories: {}, sessions: {} };
   }
}

// Atomic write: temp file + rename
export function writeIndex(indexPath: string, data: MemoryIndex): void {
   const tmpPath = `${indexPath}.tmp.${process.pid}`;
   writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
   renameSync(tmpPath, indexPath);
}

// Acquire file lock. Returns true on success, false if lock is held by a live process.
export function acquireLock(lockPath: string): boolean {
   if (existsSync(lockPath)) {
      try {
         const pidStr = readFileSync(lockPath, 'utf8').trim();
         const pid = parseInt(pidStr, 10);
         if (!isNaN(pid)) {
            try {
               // Check if process is alive (signal 0 = check without action)
               process.kill(pid, 0);
               // Process is alive — lock is valid
               return false;
            } catch {
               // Process is dead — stale lock, remove
               unlinkSync(lockPath);
            }
         } else {
            unlinkSync(lockPath);
         }
      } catch {
         return false;
      }
   }

   try {
      // Flag 'wx' = exclusive create, fails if file exists
      const fd = openSync(lockPath, 'wx');
      writeFileSync(lockPath, String(process.pid), 'utf8');
      closeSync(fd);
      return true;
   } catch {
      return false;
   }
}

// Release lock. Errors are ignored.
export function releaseLock(lockPath: string): void {
   try {
      unlinkSync(lockPath);
   } catch {
      // Ignore
   }
}

// If memories exceed MAX_MEMORIES, remove least hot ones down to PRUNE_TARGET.
export function enforceMemoryLimit(index: MemoryIndex): MemoryIndex {
   const keys = Object.keys(index.memories);
   if (keys.length <= MAX_MEMORIES) return index;

   // Sort by ascending hotness (least hot first)
   const sorted = keys.sort((a, b) => (index.memories[a]?.hotness ?? 0) - (index.memories[b]?.hotness ?? 0));
   const toRemove = keys.length - PRUNE_TARGET;
   const pruned: MemoryIndex = { ...index, memories: { ...index.memories } };
   for (let i = 0; i < toRemove; i++) {
      const key = sorted[i];
      if (key) delete pruned.memories[key];
   }
   return pruned;
}
