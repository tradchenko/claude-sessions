/**
 * Common constants and utilities.
 * Cross-platform support: macOS, Linux, Windows (WSL).
 */

import { join, sep } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { t, getLocale } from './i18n.mjs';

export const HOME = homedir();
export const PLATFORM = platform();

/**
 * Resolve the Claude Code directory.
 * Claude Code stores data in:
 *   - macOS/Linux: ~/.claude/
 *   - Windows (WSL): ~/.claude/
 *   - Windows (native): %APPDATA%/claude/ or %USERPROFILE%/.claude/
 */
function resolveClaudeDir() {
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

   // Default — standard path (will be created during install)
   return standard;
}

export const CLAUDE_DIR = resolveClaudeDir();
export const HISTORY_FILE = join(CLAUDE_DIR, 'history.jsonl');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const SESSIONS_DIR = join(CLAUDE_DIR, 'sessions');
export const SESSION_INDEX = join(CLAUDE_DIR, 'session-index.json');
export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
export const COMMANDS_DIR = join(CLAUDE_DIR, 'commands');
export const SCRIPTS_DIR = join(CLAUDE_DIR, 'scripts');

export const MEMORY_DIR = join(CLAUDE_DIR, 'session-memory');
export const MEMORY_INDEX = join(MEMORY_DIR, 'index.json');
export const MEMORY_CONFIG = join(MEMORY_DIR, 'config.json');
export const MEMORIES_DIR = join(MEMORY_DIR, 'memories');
export const MEMORY_LOCK = join(MEMORY_DIR, 'index.lock');
export const MEMORY_ERROR_LOG = join(MEMORY_DIR, 'error.log');
export const MEMORY_CATEGORIES = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];

/**
 * Checks that Claude Code is installed and directories exist
 */
export function ensureClaudeDir() {
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

   // Create necessary directories
   for (const dir of [COMMANDS_DIR, SCRIPTS_DIR]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
   }
}

/**
 * Checks if claude CLI is available
 */
export function findClaudeCli() {
   try {
      const cmd = PLATFORM === 'win32' ? 'where claude' : 'which claude';
      return execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
   } catch {
      return null;
   }
}

/**
 * Date formatting (locale-aware)
 */
export function formatDate(ts) {
   const d = new Date(ts);
   const now = new Date();
   const days = Math.floor((now - d) / 86400000);
   const locale = getLocale();
   const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

   if (days === 0) return `${t('today')} ${time}`;
   if (days === 1) return `${t('yesterday')} ${time}`;
   if (days < 7) return t('daysAgo', days);
   return d.toLocaleDateString(locale);
}

/**
 * Short project name
 */
export function shortProjectName(projectPath) {
   if (!projectPath) return 'unknown';
   // Support both / and \ (Windows)
   const parts = projectPath.split(/[/\\]/);
   return parts[parts.length - 1] || parts[parts.length - 2] || projectPath;
}
