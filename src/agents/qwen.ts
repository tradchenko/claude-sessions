/**
 * Qwen Code agent adapter
 * Scans ~/.qwen/projects/{project}/chats/*.jsonl to load sessions
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { HOME, PLATFORM, formatDate, shortProjectName } from '../core/config.js';
import type { AgentAdapter, AgentInfo, AgentLoadOptions } from './types.js';
import type { Session } from '../sessions/loader.js';
import { readSessionIndex } from '../sessions/loader.js';

/** Qwen Code home directory */
const QWEN_HOME = join(HOME, '.qwen');

/** Projects directory */
const QWEN_PROJECTS = join(QWEN_HOME, 'projects');

/** Line from a Qwen session JSONL file */
interface QwenJsonlEntry {
   uuid: string;
   parentUuid?: string;
   sessionId: string;
   timestamp: number;
   type: 'user' | 'assistant' | 'system' | 'tool_result';
   cwd?: string;
   version?: string;
   gitBranch?: string;
   message?: {
      role: string;
      parts: Array<{ text?: string; thought?: string; functionCall?: unknown }>;
   };
}

/**
 * Finds the qwen binary in the system
 */
function findQwenCli(): string | null {
   const candidates = ['/usr/local/bin/qwen', '/opt/homebrew/bin/qwen', join(HOME, 'bin', 'qwen'), join(HOME, '.local', 'bin', 'qwen')];
   for (const c of candidates) {
      if (existsSync(c)) return c;
   }
   try {
      const cmd = PLATFORM === 'win32' ? 'where qwen' : 'which qwen';
      return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0] ?? null;
   } catch {
      return null;
   }
}

/**
 * Converts project directory name back to a path.
 * Format: -Users-user-project → /Users/user/project
 */
function projectDirToPath(dirName: string): string {
   // Replace leading dash with slash and all other dashes with slashes
   if (dirName.startsWith('-')) {
      return dirName.replace(/-/g, '/');
   }
   return dirName;
}

/**
 * Reads and parses the first N lines from a JSONL file
 */
function readFirstLines(filePath: string, maxLines: number): QwenJsonlEntry[] {
   try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const entries: QwenJsonlEntry[] = [];

      for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
         const line = lines[i]?.trim();
         if (!line) continue;
         try {
            entries.push(JSON.parse(line) as QwenJsonlEntry);
         } catch {
            // Skip invalid lines
         }
      }
      return entries;
   } catch {
      return [];
   }
}

/**
 * Extracts text from the first user message
 */
function extractFirstUserMessage(entries: QwenJsonlEntry[]): string {
   for (const entry of entries) {
      if (entry.type !== 'user') continue;
      if (!entry.message?.parts) continue;

      for (const part of entry.message.parts) {
         if (part.text) return part.text.replace(/\n/g, ' ').trim().slice(0, 65);
      }
   }
   return '';
}

export const qwenAdapter: AgentAdapter = {
   id: 'qwen',
   name: 'Qwen Code',
   icon: '◇',

   detect(): AgentInfo | null {
      if (!existsSync(QWEN_HOME)) return null;

      return {
         id: 'qwen',
         name: 'Qwen Code',
         icon: '◇',
         homeDir: QWEN_HOME,
         cliBin: findQwenCli(),
         instructionsFile: 'QWEN.md',
         hooksSupport: false,
         resumeSupport: true,
      };
   },

   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      if (!existsSync(QWEN_PROJECTS)) return [];

      const limit = options?.limit ?? 100;
      const projectFilter = options?.projectFilter?.toLowerCase();
      const searchQuery = options?.searchQuery?.toLowerCase();
      const sessions: Session[] = [];
      // Читаем AI-generated summary из session-index
      const sessionIndex = readSessionIndex();

      // Scan project directories
      let projectDirs: string[];
      try {
         projectDirs = readdirSync(QWEN_PROJECTS, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
      } catch {
         return [];
      }

      for (const projDir of projectDirs) {
         const projectPath = projectDirToPath(projDir);
         const project = shortProjectName(projectPath);

         // Filter by project
         if (projectFilter && !project.toLowerCase().includes(projectFilter)) continue;

         const chatsDir = join(QWEN_PROJECTS, projDir, 'chats');
         if (!existsSync(chatsDir)) continue;

         // Scan chat JSONL files
         let chatFiles: string[];
         try {
            chatFiles = readdirSync(chatsDir).filter((f) => f.endsWith('.jsonl'));
         } catch {
            continue;
         }

         for (const chatFile of chatFiles) {
            const filePath = join(chatsDir, chatFile);
            const entries = readFirstLines(filePath, 20);
            if (entries.length === 0) continue;

            // Extract metadata from first entries
            const firstEntry = entries[0];
            if (!firstEntry) continue;

            const sessionId = firstEntry.sessionId;
            const timestamp = firstEntry.timestamp;
            const cwd = firstEntry.cwd || projectPath;
            // AI summary из index имеет приоритет над первым сообщением
            const summary = sessionIndex[sessionId]?.summary || extractFirstUserMessage(entries) || 'Qwen Code session';

            // Filter by content
            if (searchQuery && !summary.toLowerCase().includes(searchQuery)) continue;

            const dateStr = formatDate(timestamp);

            sessions.push({
               id: sessionId,
               project,
               projectPath: cwd,
               summary,
               dateStr,
               cnt: '',
               lastTs: timestamp,
               count: entries.length,
               searchText: `${dateStr} ${project} ${summary}`.toLowerCase(),
               agent: 'qwen',
            });
         }
      }

      // Sort by date (newest first) and limit
      sessions.sort((a, b) => b.lastTs - a.lastTs);
      return sessions.slice(0, limit);
   },

   getResumeCommand(sessionId: string): string[] | null {
      const cli = findQwenCli();
      if (!cli) return null;
      return [cli, '--resume', sessionId];
   },

   isSessionAlive(sessionId: string): boolean {
      // Qwen stores chats in ~/.qwen/projects/{project}/chats/{sessionId}.jsonl
      const projectsDir = join(QWEN_HOME, 'projects');
      if (!existsSync(projectsDir)) return false;
      try {
         for (const proj of readdirSync(projectsDir)) {
            const chatFile = join(projectsDir, proj, 'chats', `${sessionId}.jsonl`);
            if (existsSync(chatFile)) return true;
         }
      } catch { /* */ }
      return false;
   },

   getInstructionsPath(): string | null {
      // Check global QWEN.md
      const globalPath = join(QWEN_HOME, 'QWEN.md');
      if (existsSync(globalPath)) return globalPath;
      return null;
   },
};
