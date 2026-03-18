/**
 * Loading and processing session data
 */

import { readFileSync, writeFileSync, existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { HISTORY_FILE, SESSION_INDEX, MEMORY_INDEX, formatDate, shortProjectName } from './config.mjs';
import { t } from './i18n.mjs';

/**
 * Loads and groups sessions from history.jsonl
 */
export async function loadSessions({ projectFilter, searchQuery, limit = 100 } = {}) {
   if (!existsSync(HISTORY_FILE)) return [];

   const rl = createInterface({
      input: createReadStream(HISTORY_FILE, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   const buffer = [];
   for await (const line of rl) {
      buffer.push(line);
      if (buffer.length > 10000) buffer.splice(0, 5000);
   }

   const sessionsMap = new Map();
   for (const line of buffer.slice(-5000)) {
      if (!line.trim()) continue;
      try {
         const e = JSON.parse(line);
         if (!e.sessionId) continue;
         if (!sessionsMap.has(e.sessionId)) {
            sessionsMap.set(e.sessionId, {
               id: e.sessionId,
               project: e.project || '',
               msg: e.display || '',
               messages: [e.display || ''],
               ts: e.timestamp,
               lastTs: e.timestamp,
               count: 1,
            });
         } else {
            const s = sessionsMap.get(e.sessionId);
            s.lastTs = Math.max(s.lastTs, e.timestamp);
            s.count++;
            if (e.display) s.messages.push(e.display);
            if (e.timestamp < s.ts) {
               s.ts = e.timestamp;
               s.msg = e.display || s.msg;
            }
         }
      } catch {}
   }

   // Load AI summaries
   let index = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
      } catch {}
   }

   let sorted = Array.from(sessionsMap.values()).sort((a, b) => b.lastTs - a.lastTs);

   // Filters
   if (projectFilter) {
      const pf = projectFilter.toLowerCase();
      sorted = sorted.filter((s) => shortProjectName(s.project).toLowerCase().includes(pf));
   }
   if (searchQuery) {
      const sq = searchQuery.toLowerCase();
      sorted = sorted.filter((s) => s.messages.some((m) => m.toLowerCase().includes(sq)));
   }

   return sorted.slice(0, limit).map((s) => {
      const project = shortProjectName(s.project);
      const summary = (index[s.id]?.summary || s.msg || t('noDescription')).replace(/\n/g, ' ').trim().slice(0, 65);
      const dateStr = formatDate(s.lastTs);
      const cnt = s.count > 1 ? ` (${s.count})` : '';

      return {
         id: s.id,
         project,
         projectPath: s.project,
         summary,
         dateStr,
         cnt,
         lastTs: s.lastTs,
         count: s.count,
         searchText: `${dateStr} ${project} ${summary} ${s.messages.join(' ')}`.toLowerCase(),
      };
   });
}

/**
 * Loads/saves summary index
 */
export function readIndex() {
   // Try new unified index first
   try {
      const idx = JSON.parse(readFileSync(MEMORY_INDEX, 'utf8'));
      return idx.sessions || {};
   } catch {
      // Fallback to old session-index.json
      try { return JSON.parse(readFileSync(SESSION_INDEX, 'utf8')); }
      catch { return {}; }
   }
}

/**
 * Returns list of session IDs that need L1 extraction
 */
export function checkPendingExtractions(index) {
   const MAX_ATTEMPTS = 3;
   return Object.entries(index.sessions || {})
      .filter(([id, s]) => {
         if (!s.l0 || s.l1_ready) return false;
         if (s.extraction_failed && (s.extraction_attempts || 0) >= MAX_ATTEMPTS) return false;
         return true;
      })
      .map(([id]) => id);
}

export function writeIndex(index) {
   // Limit to 200 entries
   const entries = Object.entries(index);
   if (entries.length > 200) {
      entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
      index = Object.fromEntries(entries.slice(0, 200));
   }
   // Write to legacy SESSION_INDEX for backwards compatibility
   writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
   // Also update MEMORY_INDEX sessions section if it exists
   if (existsSync(MEMORY_INDEX)) {
      try {
         const unified = JSON.parse(readFileSync(MEMORY_INDEX, 'utf8'));
         unified.sessions = { ...unified.sessions, ...index };
         writeFileSync(MEMORY_INDEX, JSON.stringify(unified, null, 2));
      } catch {}
   }
}
