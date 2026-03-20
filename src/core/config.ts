/**
 * Common constants and utilities.
 * Cross-platform support: macOS, Linux, Windows (WSL).
 */

import { join } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { t, getLocale } from './i18n.js';

/** Supported platforms */
export type Platform = 'darwin' | 'linux' | 'win32';

export const HOME: string = homedir();
export const PLATFORM: Platform = platform() as Platform;

/**
 * Resolves the Claude Code directory.
 * Claude Code stores data in:
 *   - macOS/Linux: ~/.claude/
 *   - Windows (WSL): ~/.claude/
 *   - Windows (native): %APPDATA%/claude/ or %USERPROFILE%/.claude/
 */
function resolveClaudeDir(): string {
   // Standard path
   const standard = join(HOME, '.claude');
   if (existsSync(standard)) return standard;

   // Windows fallback
   if (PLATFORM === 'win32') {
      const appData = process.env.APPDATA;
      if (appData) {
         const winPath = join(appData, 'claude');
         if (existsSync(winPath)) return winPath;
      }
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
         const winLocalPath = join(localAppData, 'claude');
         if (existsSync(winLocalPath)) return winLocalPath;
      }
   }

   // XDG fallback (Linux)
   const xdgConfig = process.env.XDG_CONFIG_HOME || join(HOME, '.config');
   const xdgPath = join(xdgConfig, 'claude');
   if (existsSync(xdgPath)) return xdgPath;

   // Default — standard path (created during installation)
   return standard;
}

export const CLAUDE_DIR: string = resolveClaudeDir();
export const HISTORY_FILE: string = join(CLAUDE_DIR, 'history.jsonl');
export const PROJECTS_DIR: string = join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR: string = join(CLAUDE_DIR, 'sessions');
export const SESSION_INDEX: string = join(CLAUDE_DIR, 'session-index.json');
export const SETTINGS_FILE: string = join(CLAUDE_DIR, 'settings.json');
export const COMMANDS_DIR: string = join(CLAUDE_DIR, 'commands');
export const SCRIPTS_DIR: string = join(CLAUDE_DIR, 'scripts');

export const MEMORY_DIR: string = join(CLAUDE_DIR, 'session-memory');
export const MEMORY_INDEX: string = join(MEMORY_DIR, 'index.json');
export const MEMORY_CONFIG: string = join(MEMORY_DIR, 'config.json');
export const MEMORIES_DIR: string = join(MEMORY_DIR, 'memories');
export const MEMORY_LOCK: string = join(MEMORY_DIR, 'index.lock');
export const SNAPSHOTS_DIR: string = join(MEMORY_DIR, 'snapshots');
export const MEMORY_ERROR_LOG: string = join(MEMORY_DIR, 'error.log');

/** Memory categories */
export const MEMORY_CATEGORIES = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

/**
 * Verifies that Claude Code is installed and directories exist
 */
export function ensureClaudeDir(): void {
   if (!existsSync(CLAUDE_DIR)) {
      console.error('❌ ' + t('claudeDirNotFound'));
      console.error('   ' + t('checked', CLAUDE_DIR));
      console.error('   ' + t('installClaudeCode'));
      process.exit(1);
   }

   if (!existsSync(HISTORY_FILE)) {
      console.error('❌ ' + t('historyNotFound'));
      console.error('   ' + t('checked', HISTORY_FILE));
      console.error('   ' + t('runClaudeOnce'));
      process.exit(1);
   }

   // Create required directories
   for (const dir of [COMMANDS_DIR, SCRIPTS_DIR]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
   }
}

/**
 * Checks if the claude CLI is available
 */
export function findClaudeCli(): string | null {
   try {
      const cmd = PLATFORM === 'win32' ? 'where claude' : 'which claude';
      return execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0] ?? null;
   } catch {
      return null;
   }
}

/**
 * Ищет CLI утилиту по имени. Возвращает абсолютный путь или null.
 */
export function findCli(name: string): string | null {
   try {
      const cmd = PLATFORM === 'win32' ? `where ${name}` : `which ${name}`;
      return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0] || null;
   } catch {
      return null;
   }
}

/**
 * Format date (locale-aware)
 */
export function formatDate(ts: number | string | Date): string {
   const d = new Date(ts);
   const now = new Date();
   const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
   const locale = getLocale();
   const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

   if (days === 0) return `${t('today')} ${time}`;
   if (days === 1) return `${t('yesterday')} ${time}`;
   if (days < 7) return t('daysAgo', days);
   return d.toLocaleDateString(locale);
}

/** Результат поиска JSONL-файла сессии */
export interface FoundSessionFile {
   path: string;
   projectDir: string;
}

/**
 * Ищет JSONL-файл сессии во всех project-директориях.
 * Поддерживает два уровня вложенности:
 *   ~/.claude/projects/{projectDir}/{sessionId}.jsonl
 *   ~/.claude/projects/{projectDir}/{subDir}/{sessionId}.jsonl
 * Также проверяет ~/.claude/sessions/ как fallback.
 */
export function findSessionJsonl(sessionId: string): FoundSessionFile | null {
   const fileName = `${sessionId}.jsonl`;

   // Поиск в projects — до 2-х уровней вложенности
   if (existsSync(PROJECTS_DIR)) {
      try {
         for (const dir of readdirSync(PROJECTS_DIR)) {
            const dirPath = join(PROJECTS_DIR, dir);
            try {
               if (!statSync(dirPath).isDirectory()) continue;
            } catch {
               continue;
            }

            // Уровень 1: {projectDir}/{sessionId}.jsonl
            const filePath = join(dirPath, fileName);
            if (existsSync(filePath)) return { path: filePath, projectDir: dir };

            // Уровень 2: {projectDir}/{subDir}/{sessionId}.jsonl
            try {
               for (const sub of readdirSync(dirPath)) {
                  const subPath = join(dirPath, sub);
                  try {
                     if (!statSync(subPath).isDirectory()) continue;
                  } catch {
                     continue;
                  }
                  const subFile = join(subPath, fileName);
                  if (existsSync(subFile)) return { path: subFile, projectDir: dir };
               }
            } catch {
               // Ошибка чтения поддиректории — пропускаем
            }
         }
      } catch {
         // Ошибка чтения PROJECTS_DIR — продолжаем к fallback
      }
   }

   // Fallback: ~/.claude/sessions/{sessionId}.jsonl
   if (existsSync(SESSIONS_DIR)) {
      const fallbackPath = join(SESSIONS_DIR, fileName);
      if (existsSync(fallbackPath)) return { path: fallbackPath, projectDir: 'sessions' };
   }

   return null;
}

/**
 * Short project name from full path
 */
export function shortProjectName(projectPath: string | undefined | null): string {
   if (!projectPath) return 'unknown';
   // Support both / and \ (Windows)
   const parts = projectPath.split(/[/\\]/);
   return parts[parts.length - 1] || parts[parts.length - 2] || projectPath;
}
