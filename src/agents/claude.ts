/**
 * Claude Code adapter for the agent system.
 * Implements AgentAdapter — session loading, CLI detection, resume.
 */

import { existsSync, statSync, createReadStream, readdirSync } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';

import type { AgentInfo, AgentLoadOptions, FsDeps } from './types.js';
import type { Session } from '../sessions/loader.js';
import {
   HOME,
   CLAUDE_DIR,
   HISTORY_FILE,
   SESSIONS_DIR,
   PROJECTS_DIR,
   SESSION_INDEX,
   MEMORY_INDEX,
   SNAPSHOTS_DIR,
   findClaudeCli,
   formatDate,
   shortProjectName,
} from '../core/config.js';
import { t } from '../core/i18n/index.js';
import { safeReadJson } from '../utils/index.js';
import { BaseAgentAdapter } from './base-adapter.js';
import { AdapterError } from '../core/errors.js';

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
 * Собирает Set всех sessionId, для которых есть JSONL-файлы.
 * Обходит projects/ (2 уровня) и sessions/ один раз — O(dirs), без проверки каждой сессии.
 */
function collectJsonlIds(): Set<string> {
   const ids = new Set<string>();
   const addJsonlFiles = (dirPath: string): void => {
      try {
         for (const f of readdirSync(dirPath)) {
            if (f.endsWith('.jsonl')) ids.add(f.slice(0, -6));
         }
      } catch { /* директория недоступна */ }
   };

   // projects/{dir}/*.jsonl и projects/{dir}/{sub}/*.jsonl
   if (existsSync(PROJECTS_DIR)) {
      try {
         for (const dir of readdirSync(PROJECTS_DIR)) {
            const dirPath = join(PROJECTS_DIR, dir);
            try {
               if (!statSync(dirPath).isDirectory()) continue;
            } catch { continue; }
            addJsonlFiles(dirPath);
            // Уровень 2
            try {
               for (const sub of readdirSync(dirPath)) {
                  const subPath = join(dirPath, sub);
                  try {
                     if (!statSync(subPath).isDirectory()) continue;
                  } catch { continue; }
                  addJsonlFiles(subPath);
               }
            } catch { /* */ }
         }
      } catch { /* */ }
   }

   // Fallback: sessions/*.jsonl
   if (existsSync(SESSIONS_DIR)) addJsonlFiles(SESSIONS_DIR);

   return ids;
}

/**
 * Собирает Set всех sessionId, для которых есть snapshot.
 */
function collectSnapshotIds(): Set<string> {
   const ids = new Set<string>();
   if (!existsSync(SNAPSHOTS_DIR)) return ids;
   try {
      for (const f of readdirSync(SNAPSHOTS_DIR)) {
         if (f.endsWith('.md')) ids.add(f.slice(0, -3));
      }
   } catch { /* */ }
   return ids;
}

/**
 * Загружает индекс сессий (unified → legacy fallback).
 * Использует safeReadJson из shared utils.
 */
function loadSessionIndex(): SessionIndex {
   const unified = safeReadJson<MemoryIndex>(MEMORY_INDEX);
   if (unified.ok) return unified.data.sessions ?? {};
   const legacy = safeReadJson<SessionIndex>(SESSION_INDEX);
   return legacy.ok ? legacy.data : {};
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
 * Адаптер Claude Code — класс с DI файловой системы
 */
export class ClaudeAdapter extends BaseAgentAdapter {
   readonly id = 'claude' as const;
   readonly name = 'Claude Code';
   readonly icon = '●';

   constructor(fsDeps?: FsDeps) {
      super(fsDeps);
   }

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
   }

   /**
    * Loads Claude Code sessions from history.jsonl
    */
   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      const { projectFilter, searchQuery, limit = 100 } = options || {};

      const sessionsMap = await parseHistory();
      const index = loadSessionIndex();

      // Собираем Set-ы JSONL и snapshot один раз для всех сессий
      const jsonlIds = collectJsonlIds();
      const snapshotIds = collectSnapshotIds();

      let sorted = Array.from(sessionsMap.values())
         // Скрыть restore-wrapper сессии (созданные через restore.ts)
         .filter((s) => !s.msg.includes('.restore-context.md'))
         .sort((a, b) => b.lastTs - a.lastTs);

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
            hasJsonl: jsonlIds.has(s.id),
            hasSnapshot: snapshotIds.has(s.id),
         };
      });
   }

   /**
    * Формирует команду для возобновления сессии: claude --resume <sessionId>.
    * Бросает AdapterError если binary не найден или sessionId пустой.
    */
   getResumeCommand(sessionId: string): string[] | null {
      if (!sessionId) {
         throw new AdapterError({
            code: 'SESSION_NOT_FOUND',
            message: `Session "${sessionId}" not found for agent "claude"`,
            agentName: 'claude',
            suggestion: 'Убедитесь что сессия существует: cs list --agent claude',
         });
      }
      const cliBin = findClaudeCli();
      if (!cliBin) {
         throw new AdapterError({
            code: 'AGENT_NOT_INSTALLED',
            message: 'Agent "claude" is not installed',
            agentName: 'claude',
            suggestion: 'Установите claude и убедитесь что бинарник доступен в PATH',
         });
      }
      return [cliBin, '--resume', sessionId];
   }

   isSessionAlive(sessionId: string): boolean {
      const sessionsDir = join(HOME, '.claude', 'sessions');
      if (!existsSync(sessionsDir)) return false;
      try {
         for (const f of readdirSync(sessionsDir)) {
            if (!f.endsWith('.json')) continue;
            const result = safeReadJson<{ sessionId?: string }>(join(sessionsDir, f));
            if (result.ok && result.data.sessionId === sessionId) return true;
         }
      } catch { /* */ }
      return false;
   }

   /**
    * Path to CLAUDE.md for memory injection
    * Returns global ~/.claude/CLAUDE.md
    */
   getInstructionsPath(): string | null {
      const globalPath = join(HOME, '.claude', INSTRUCTIONS_FILENAME);
      if (existsSync(globalPath)) return globalPath;
      return null;
   }
}

/** Singleton для обратной совместимости */
export const claudeAdapter = new ClaudeAdapter();
