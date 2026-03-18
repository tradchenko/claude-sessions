import { readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, existsSync } from 'node:fs';

const EMPTY_INDEX = { version: 1, memories: {}, sessions: {} };
const MAX_MEMORIES = 500;
const PRUNE_TARGET = 400;

// Read index.json, return parsed object. On error return EMPTY_INDEX copy.
export function readIndex(indexPath) {
   try {
      const raw = readFileSync(indexPath, 'utf8');
      return JSON.parse(raw);
   } catch {
      return { ...EMPTY_INDEX, memories: {}, sessions: {} };
   }
}

// Atomic write: write to tmp file, then rename.
export function writeIndex(indexPath, data) {
   const tmpPath = `${indexPath}.tmp.${process.pid}`;
   writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
   renameSync(tmpPath, indexPath);
}

// Acquire file lock. Returns true on success, false if already locked by live process.
export function acquireLock(lockPath) {
   if (existsSync(lockPath)) {
      try {
         const pidStr = readFileSync(lockPath, 'utf8').trim();
         const pid = parseInt(pidStr, 10);
         if (!isNaN(pid)) {
            try {
               // Check if process is alive (signal 0 = no-op, just checks existence)
               process.kill(pid, 0);
               // Process is alive — lock is valid
               return false;
            } catch {
               // Process does not exist — stale lock, remove it
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
      // 'wx' flag = exclusive create, fails if file exists
      const fd = openSync(lockPath, 'wx');
      writeFileSync(lockPath, String(process.pid), 'utf8');
      closeSync(fd);
      return true;
   } catch {
      return false;
   }
}

// Remove lock file. Silently ignore errors.
export function releaseLock(lockPath) {
   try {
      unlinkSync(lockPath);
   } catch {
      // Ignore
   }
}

// If memories count > MAX_MEMORIES, prune lowest-hotness entries until count <= PRUNE_TARGET.
export function enforceMemoryLimit(index) {
   const keys = Object.keys(index.memories);
   if (keys.length <= MAX_MEMORIES) return index;

   // Sort by hotness ascending (lowest first)
   const sorted = keys.sort((a, b) => index.memories[a].hotness - index.memories[b].hotness);
   const toRemove = keys.length - PRUNE_TARGET;
   const pruned = { ...index, memories: { ...index.memories } };
   for (let i = 0; i < toRemove; i++) {
      delete pruned.memories[sorted[i]];
   }
   return pruned;
}
