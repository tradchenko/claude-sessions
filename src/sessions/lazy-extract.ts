/**
 * Lazy discovery of sessions from agents without hooks (Codex, Qwen, Gemini).
 * Scans for new sessions not yet tracked in the memory index and adds stub entries.
 */

import { MEMORY_INDEX } from '../core/config.js';
import { readIndex, writeIndex } from '../memory/index.js';
import { getActiveAdapters } from '../agents/registry.js';
import type { SessionMeta } from '../memory/types.js';

/**
 * Discovers new sessions from non-Claude agents and adds stub entries to the memory index.
 * Returns the count of newly discovered sessions.
 */
export async function lazyDiscoverSessions(): Promise<number> {
   const index = readIndex(MEMORY_INDEX);
   const adapters = getActiveAdapters();

   // Only process agents without hooks support (non-Claude)
   const hooklessAdapters = adapters.filter((a) => {
      const info = a.detect();
      return info && !info.hooksSupport;
   });

   if (hooklessAdapters.length === 0) return 0;

   let discovered = 0;

   for (const adapter of hooklessAdapters) {
      const sessions = await adapter.loadSessions();

      for (const session of sessions) {
         // Skip sessions already tracked in the index
         if (index.sessions[session.id]) continue;

         // Add a stub entry with basic metadata
         const stub: SessionMeta = {
            summary: session.summary || '',
            project: session.project || '',
            lastActive: session.lastTs || Date.now(),
         };

         index.sessions[session.id] = stub;
         discovered++;
      }
   }

   if (discovered > 0) {
      writeIndex(MEMORY_INDEX, index);
   }

   return discovered;
}
