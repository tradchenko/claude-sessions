/**
 * Claude Code adapter for the agent system.
 * Implements AgentAdapter — session loading, CLI detection, resume.
 */

import { readFileSync, existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';

import type { AgentAdapter, AgentInfo, AgentLoadOptions } from './types.js';
import type { Session } from '../sessions/loader.js';
import {
   HOME,
   CLAUDE_DIR,
   HISTORY_FILE,
   SESSIONS_DIR,
   SESSION_INDEX,
   MEMORY_INDEX,
   findClaudeCli,
   formatDate,
   shortProjectName,
} from '../core/config.js';
import { t } from '../core/i18n.js';

/** Event entry from history.jsonl */
interface HistoryEvent {
   sessionId?: string;
   project?: string;
   display?: string;
   timestamp: number;
}

/** Session data accumulator during parsing */
interface SessionAccumulator {
   id: string;
   project: string;
   msg: string;
   messages: string[];
   ts: number;
   lastTs: number;
   count: number;
}

/** Summary index entry */
interface SessionIndexEntry {
   summary?: string;
   lastActive?: number;
   [key: string]: unknown;
}

/** Session summary index */
type SessionIndex = Record<string, SessionIndexEntry>;

/** Unified memory index */
interface MemoryIndex {
   sessions?: SessionIndex;
   [key: string]: unknown;
}

/** Path to the CLAUDE.md instructions file */
const INSTRUCTIONS_FILENAME = 'CLAUDE.md';

/**
 * Loads session summary index (unified → legacy fallback)
 */
function loadSessionIndex(): SessionIndex {
   try {
      const idx = JSON.parse(readFileSync(MEMORY_INDEX, 'utf8')) as MemoryIndex;
      return idx.sessions || {};
   } catch {
      try {
         return JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as SessionIndex;
      } catch {
         return {};
      }
   }
}

/**
 * Parses history.jsonl and groups events by sessions
 */
async function parseHistory(): Promise<Map<string, SessionAccumulator>> {
   if (!existsSync(HISTORY_FILE)) return new Map();

   const rl = createInterface({
      input: createReadStream(HISTORY_FILE, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   // Buffer with limit to save memory
   const buffer: string[] = [];
   for await (const line of rl) {
      buffer.push(line);
      if (buffer.length > 10000) buffer.splice(0, 5000);
   }

   const sessionsMap = new Map<string, SessionAccumulator>();
   for (const line of buffer.slice(-5000)) {
      if (!line.trim()) continue;
      try {
         const e = JSON.parse(line) as HistoryEvent;
         if (!e.sessionId) continue;

         const existing = sessionsMap.get(e.sessionId);
         if (!existing) {
            sessionsMap.set(e.sessionId, {
               id: e.sessionId,
               project: e.project || '',
               msg: e.display || '',
               messages: [e.display || ''],
               ts: e.timestamp,
               lastTs: e.timestamp,
               count: 1,
            });
            continue;
         }

         existing.lastTs = Math.max(existing.lastTs, e.timestamp);
         existing.count++;
         if (e.display) existing.messages.push(e.display);
         if (e.timestamp < existing.ts) {
            existing.ts = e.timestamp;
            existing.msg = e.display || existing.msg;
         }
      } catch {
         // Skip invalid lines
      }
   }

   return sessionsMap;
}

/**
 * Claude Code adapter
 */
export const claudeAdapter: AgentAdapter = {
   id: 'claude',
   name: 'Claude Code',
   icon: '●',

   /**
    * Detects installed Claude Code
    */
   detect(): AgentInfo | null {
      if (!existsSync(CLAUDE_DIR)) return null;

      const cliBin = findClaudeCli();
      return {
         id: 'claude',
         name: 'Claude Code',
         icon: '●',
         homeDir: CLAUDE_DIR,
         cliBin,
         instructionsFile: INSTRUCTIONS_FILENAME,
         hooksSupport: true,
         resumeSupport: true,
      };
   },

   /**
    * Loads Claude Code sessions from history.jsonl
    */
   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      const { projectFilter, searchQuery, limit = 100 } = options || {};

      const sessionsMap = await parseHistory();
      const index = loadSessionIndex();

      let sorted = Array.from(sessionsMap.values()).sort((a, b) => b.lastTs - a.lastTs);

      // Filter by project
      if (projectFilter) {
         const pf = projectFilter.toLowerCase();
         sorted = sorted.filter((s) => shortProjectName(s.project).toLowerCase().includes(pf));
      }

      // Filter by content
      if (searchQuery) {
         const sq = searchQuery.toLowerCase();
         sorted = sorted.filter((s) => s.messages.some((m) => m.toLowerCase().includes(sq)));
      }

      return sorted.slice(0, limit).map((s): Session => {
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
            agent: 'claude',
         };
      });
   },

   /**
    * Command to restore a session: claude --resume <sessionId>
    */
   getResumeCommand(sessionId: string): string[] | null {
      const cliBin = findClaudeCli();
      if (!cliBin) return null;
      return [cliBin, '--resume', sessionId];
   },

   /**
    * Path to CLAUDE.md for memory injection
    * Returns global ~/.claude/CLAUDE.md
    */
   getInstructionsPath(): string | null {
      const globalPath = join(HOME, '.claude', INSTRUCTIONS_FILENAME);
      if (existsSync(globalPath)) return globalPath;
      return null;
   },
};
