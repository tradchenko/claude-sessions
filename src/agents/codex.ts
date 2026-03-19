/**
 * Codex CLI agent adapter.
 * Loads sessions from ~/.codex/history.jsonl and supports resume.
 */

import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { HOME, PLATFORM, formatDate, shortProjectName } from '../core/config.js';
import type { AgentAdapter, AgentInfo, AgentLoadOptions } from './types.js';
import type { Session } from '../sessions/loader.js';

/** Entry from Codex CLI history.jsonl */
interface CodexHistoryEntry {
   session_id: string;
   ts: number;
   text: string;
}

/** Accumulator for grouping entries by session */
interface CodexSessionAccumulator {
   id: string;
   messages: string[];
   firstTs: number;
   lastTs: number;
   count: number;
}

/**
 * Resolves Codex CLI home directory.
 * Checks standard path and platform-specific fallbacks.
 */
function resolveCodexDir(): string {
   // Standard path
   const standard = join(HOME, '.codex');
   if (existsSync(standard)) return standard;

   // Windows fallback via APPDATA
   if (PLATFORM === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
         const winPath = join(appData, 'codex');
         if (existsSync(winPath)) return winPath;
      }
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
         const winLocalPath = join(localAppData, 'codex');
         if (existsSync(winLocalPath)) return winLocalPath;
      }
   }

   // XDG fallback (Linux)
   const xdgConfig = process.env.XDG_CONFIG_HOME || join(HOME, '.config');
   const xdgPath = join(xdgConfig, 'codex');
   if (existsSync(xdgPath)) return xdgPath;

   // Default — standard path
   return standard;
}

/**
 * Finds the codex binary in PATH
 */
function findCodexCli(): string | null {
   // Fast: check common paths first
   const candidates = ['/usr/local/bin/codex', '/opt/homebrew/bin/codex', join(HOME, 'bin', 'codex'), join(HOME, '.local', 'bin', 'codex')];
   for (const c of candidates) {
      if (existsSync(c)) return c;
   }
   // Slow fallback: which/where
   try {
      const cmd = PLATFORM === 'win32' ? 'where codex' : 'which codex';
      return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0] ?? null;
   } catch {
      return null;
   }
}

/**
 * Parses history.jsonl and groups entries by session_id
 */
function parseHistory(historyPath: string): Map<string, CodexSessionAccumulator> {
   const sessions = new Map<string, CodexSessionAccumulator>();

   if (!existsSync(historyPath)) return sessions;

   let content: string;
   try {
      content = readFileSync(historyPath, 'utf8');
   } catch {
      return sessions;
   }

   const lines = content.split('\n');

   for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let entry: CodexHistoryEntry;
      try {
         entry = JSON.parse(trimmed) as CodexHistoryEntry;
      } catch {
         continue;
      }

      // Skip entries without required fields
      if (!entry.session_id || !entry.ts) continue;

      // Codex stores timestamp in seconds — normalize to milliseconds
      const tsMs = entry.ts < 1e12 ? entry.ts * 1000 : entry.ts;

      const existing = sessions.get(entry.session_id);
      if (existing) {
         if (entry.text) existing.messages.push(entry.text);
         if (tsMs < existing.firstTs) existing.firstTs = tsMs;
         if (tsMs > existing.lastTs) existing.lastTs = tsMs;
         existing.count++;
      } else {
         sessions.set(entry.session_id, {
            id: entry.session_id,
            messages: entry.text ? [entry.text] : [],
            firstTs: tsMs,
            lastTs: tsMs,
            count: 1,
         });
      }
   }

   return sessions;
}

/**
 * Converts accumulators to Session[] array
 */
function accumulatorsToSessions(accumulators: Map<string, CodexSessionAccumulator>, options?: AgentLoadOptions): Session[] {
   const result: Session[] = [];

   for (const acc of accumulators.values()) {
      // First message as summary
      const summary = acc.messages[0] ?? '(empty session)';
      const dateStr = formatDate(acc.lastTs);

      const session: Session = {
         id: acc.id,
         project: 'codex',
         projectPath: '',
         summary,
         dateStr,
         cnt: acc.count > 1 ? `${acc.count}` : '',
         lastTs: acc.lastTs,
         count: acc.count,
         searchText: `codex ${summary} ${acc.messages.join(' ')}`.toLowerCase(),
         agent: 'codex',
      };

      // Filter by search query
      if (options?.searchQuery) {
         const query = options.searchQuery.toLowerCase();
         if (!session.searchText.includes(query)) continue;
      }

      result.push(session);
   }

   // Sort by last activity (newest first)
   result.sort((a, b) => b.lastTs - a.lastTs);

   // Limit results
   if (options?.limit && options.limit > 0) {
      return result.slice(0, options.limit);
   }

   return result;
}

const CODEX_DIR = resolveCodexDir();
const CODEX_HISTORY = join(CODEX_DIR, 'history.jsonl');

/** Codex CLI adapter for claude-sessions */
export const codexAdapter: AgentAdapter = {
   id: 'codex',
   name: 'Codex CLI',
   icon: '\u25C6',

   /**
    * Checks if Codex CLI is installed on the system.
    * Looks for home directory and binary.
    */
   detect(): AgentInfo | null {
      const cliBin = findCodexCli();
      const dirExists = existsSync(CODEX_DIR);

      // Codex is considered installed if directory or binary exists
      if (!dirExists && !cliBin) return null;

      return {
         id: 'codex',
         name: 'Codex CLI',
         icon: '\u25C6',
         homeDir: CODEX_DIR,
         cliBin,
         instructionsFile: 'AGENTS.md',
         hooksSupport: false,
         resumeSupport: true,
      };
   },

   /**
    * Loads sessions from ~/.codex/history.jsonl.
    * Groups entries by session_id and builds Session[].
    */
   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      // Handle missing file
      if (!existsSync(CODEX_HISTORY)) return [];

      const accumulators = parseHistory(CODEX_HISTORY);
      return accumulatorsToSessions(accumulators, options);
   },

   /**
    * Builds command for Codex session resume.
    */
   getResumeCommand(sessionId: string): string[] | null {
      const cliBin = findCodexCli();
      if (!cliBin) return null;

      return [cliBin, '--resume', sessionId];
   },

   /**
    * Returns path to instructions file (AGENTS.md in project root).
    * Codex uses AGENTS.md instead of CLAUDE.md.
    */
   getInstructionsPath(): string | null {
      // AGENTS.md is expected in the project root, not in the home directory
      const cwd = process.cwd();
      const agentsMd = join(cwd, 'AGENTS.md');
      if (existsSync(agentsMd)) return agentsMd;
      return null;
   },
};
