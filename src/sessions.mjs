/**
 * Загрузка и обработка данных сессий
 */

import { readFileSync, existsSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { HISTORY_FILE, SESSION_INDEX, formatDate, shortProjectName } from './config.mjs';

/**
 * Загружает и группирует сессии из history.jsonl
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

   // Загружаем AI-резюме
   let index = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
      } catch {}
   }

   let sorted = Array.from(sessionsMap.values()).sort((a, b) => b.lastTs - a.lastTs);

   // Фильтры
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
      const summary = (index[s.id]?.summary || s.msg || '(нет описания)').replace(/\n/g, ' ').trim().slice(0, 65);
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
 * Загружает/сохраняет индекс резюме
 */
export function readIndex() {
   if (!existsSync(SESSION_INDEX)) return {};
   try {
      return JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
   } catch {
      return {};
   }
}

export function writeIndex(index) {
   const { writeFileSync } = await_import_fs();
   // Ограничиваем до 200 записей
   const entries = Object.entries(index);
   if (entries.length > 200) {
      entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
      index = Object.fromEntries(entries.slice(0, 200));
   }
   writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
}

function await_import_fs() {
   return require('fs');
}
