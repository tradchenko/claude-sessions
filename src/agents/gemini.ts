/**
 * Gemini CLI adapter for the agent system.
 * Sessions are stored as git repositories in ~/.gemini/history/{project}/
 */

import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { Session } from '../sessions/loader.js';
import { readSessionIndex } from '../sessions/loader.js';
import { HOME, PLATFORM, formatDate } from '../core/config.js';
import { AdapterError } from '../core/errors.js';
import type { AgentInfo, AgentLoadOptions } from './types.js';
import { BaseAgentAdapter } from './base-adapter.js';
import { safeReaddir } from '../utils/fs.js';

/** Gemini CLI home directory */
const GEMINI_DIR = join(HOME, '.gemini');

/** Project history directory */
const HISTORY_DIR = join(GEMINI_DIR, 'history');

/** Instructions file name */
const INSTRUCTIONS_FILENAME = 'GEMINI.md';

/**
 * Finds the gemini binary in PATH
 */
function findGeminiBin(): string | null {
   const candidates = ['/usr/local/bin/gemini', '/opt/homebrew/bin/gemini', join(HOME, 'bin', 'gemini'), join(HOME, '.local', 'bin', 'gemini')];
   for (const c of candidates) {
      if (existsSync(c)) return c;
   }
   try {
      const cmd = PLATFORM === 'win32' ? 'where gemini' : 'which gemini';
      return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0] ?? null;
   } catch {
      return null;
   }
}

/**
 * Gets the timestamp of the last commit in a git repository.
 * Returns null if it's not a git repo or has no commits.
 */
function getLastCommitTimestamp(repoPath: string): number | null {
   try {
      const gitDir = join(repoPath, '.git');
      if (!existsSync(gitDir)) return null;

      // Get UNIX timestamp of the last commit
      const output = execSync('git log -1 --format=%ct', {
         cwd: repoPath,
         encoding: 'utf8',
         timeout: 5000,
         stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const ts = parseInt(output, 10);
      if (isNaN(ts)) return null;

      // git log --format=%ct returns seconds, convert to milliseconds
      return ts * 1000;
   } catch {
      return null;
   }
}

/**
 * Gets the subject line of the last commit in a git repository.
 */
function getLastCommitMessage(repoPath: string): string {
   try {
      return execSync('git log -1 --format=%s', {
         cwd: repoPath,
         encoding: 'utf8',
         timeout: 3000,
         stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
   } catch {
      return '';
   }
}

/**
 * Scans history directory and returns list of projects
 */
function scanProjects(): Array<{ name: string; path: string; lastTs: number; commitMsg: string }> {
   if (!existsSync(HISTORY_DIR)) return [];

   const readdirResult = safeReaddir(HISTORY_DIR);
   if (!readdirResult.ok) return [];

   const projects: Array<{ name: string; path: string; lastTs: number; commitMsg: string }> = [];

   for (const name of readdirResult.data) {
      const projectPath = join(HISTORY_DIR, name);
      try {
         if (!statSync(projectPath).isDirectory()) continue;
      } catch {
         continue;
      }

      const lastTs = getLastCommitTimestamp(projectPath);

      if (lastTs !== null) {
         const commitMsg = getLastCommitMessage(projectPath);
         projects.push({ name, path: projectPath, lastTs, commitMsg });
         continue;
      }

      // Fallback: use directory mtime if no git commits
      try {
         const stat = statSync(projectPath);
         projects.push({ name, path: projectPath, lastTs: stat.mtimeMs, commitMsg: '' });
      } catch {
         // Skip inaccessible directories
      }
   }

   return projects;
}

/**
 * Адаптер Gemini CLI — класс с DI файловой системы.
 * Gemini id — project directory name (не UUID).
 */
export class GeminiAdapter extends BaseAgentAdapter {
   readonly id = 'gemini' as const;
   readonly name = 'Gemini CLI';
   readonly icon = '✦';



   /**
    * Detects installed Gemini CLI
    */
   detect(): AgentInfo | null {
      if (!existsSync(GEMINI_DIR)) return null;

      const cliBin = findGeminiBin();
      return {
         id: 'gemini',
         name: 'Gemini CLI',
         icon: '✦',
         homeDir: GEMINI_DIR,
         cliBin,
         instructionsFile: INSTRUCTIONS_FILENAME,
         hooksSupport: true,
         resumeSupport: false,
      };
   }

   /**
    * Loads Gemini sessions — one per project from git history
    */
   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      const { projectFilter, searchQuery, limit = 100 } = options || {};

      let projects = scanProjects();

      // Sort by last commit time (newest first)
      projects.sort((a, b) => b.lastTs - a.lastTs);

      // Filter by project name
      if (projectFilter) {
         const pf = projectFilter.toLowerCase();
         projects = projects.filter((p) => p.name.toLowerCase().includes(pf));
      }

      // Filter by search query (search in project name)
      if (searchQuery) {
         const sq = searchQuery.toLowerCase();
         projects = projects.filter((p) => p.name.toLowerCase().includes(sq));
      }

      // Читаем AI-generated summary из session-index
      const sessionIndex = readSessionIndex();

      return projects.slice(0, limit).map((p): Session => {
         const dateStr = formatDate(p.lastTs);
         const sessionId = `gemini-${p.name}`;
         // AI summary из index имеет приоритет над commit message
         const summary = sessionIndex[sessionId]?.summary || p.commitMsg || p.name;

         return {
            id: sessionId,
            project: p.name,
            projectPath: p.path,
            summary,
            dateStr,
            cnt: '',
            lastTs: p.lastTs,
            count: 1,
            searchText: `${dateStr} ${p.name} ${summary}`.toLowerCase(),
            agent: 'gemini',
         };
      });
   }

   /**
    * Формирует команду для возобновления сессии Gemini.
    * Gemini sessions = git commits, id = "gemini-{projectName}".
    * Gemini CLI не поддерживает --resume нативно.
    * Если binary не найден → AGENT_NOT_INSTALLED.
    * Если project directory не существует → SESSION_NOT_FOUND.
    * Иначе → открываем gemini в директории проекта.
    */
   getResumeCommand(sessionId: string): string[] | null {
      const bin = findGeminiBin();
      if (!bin) {
         throw new AdapterError({
            code: 'AGENT_NOT_INSTALLED',
            message: 'Agent "gemini" is not installed',
            agentName: 'gemini',
            suggestion: 'Установите gemini-cli и убедитесь что бинарник доступен в PATH',
         });
      }
      // sessionId = "gemini-{projectName}" — извлекаем имя проекта
      const projectName = sessionId.startsWith('gemini-') ? sessionId.slice(7) : sessionId;
      const projectHistoryPath = join(HISTORY_DIR, projectName);
      if (!existsSync(projectHistoryPath)) {
         throw new AdapterError({
            code: 'SESSION_NOT_FOUND',
            message: `Gemini project "${projectName}" not found`,
            agentName: 'gemini',
            suggestion: `Убедитесь что директория ~/.gemini/history/${projectName} существует`,
         });
      }
      // Открываем gemini в директории проекта (projectHistoryPath — это git-репо с историей)
      return [bin];
   }

   // isSessionAlive: базовая реализация (false) подходит, Gemini не поддерживает resume

   /**
    * Path to GEMINI.md for memory injection
    */
   getInstructionsPath(): string | null {
      const globalPath = join(GEMINI_DIR, INSTRUCTIONS_FILENAME);
      if (existsSync(globalPath)) return globalPath;
      return null;
   }
}

/** Singleton для обратной совместимости */
export const geminiAdapter = new GeminiAdapter();
