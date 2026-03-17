/**
 * Общие константы и утилиты.
 * Кроссплатформенная поддержка: macOS, Linux, Windows (WSL).
 */

import { join, sep } from 'path';
import { homedir, platform } from 'os';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

export const HOME = homedir();
export const PLATFORM = platform();

/**
 * Определяем директорию Claude Code.
 * Claude Code хранит данные в:
 *   - macOS/Linux: ~/.claude/
 *   - Windows (WSL): ~/.claude/
 *   - Windows (native): %APPDATA%/claude/ или %USERPROFILE%/.claude/
 */
function resolveClaudeDir() {
   // Стандартный путь
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

   // По умолчанию — стандартный путь (создадим при install)
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

/**
 * Проверяет что Claude Code установлен и каталоги существуют
 */
export function ensureClaudeDir() {
   if (!existsSync(CLAUDE_DIR)) {
      console.error('❌ Директория Claude Code не найдена.');
      console.error(`   Проверено: ${CLAUDE_DIR}`);
      console.error('   Убедись что Claude Code установлен: https://docs.anthropic.com/en/docs/claude-code');
      process.exit(1);
   }

   if (!existsSync(HISTORY_FILE)) {
      console.error('❌ Файл history.jsonl не найден.');
      console.error(`   Проверено: ${HISTORY_FILE}`);
      console.error('   Запусти Claude Code хотя бы один раз чтобы создать историю сессий.');
      process.exit(1);
   }

   // Создаём необходимые директории
   for (const dir of [COMMANDS_DIR, SCRIPTS_DIR]) {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
   }
}

/**
 * Определяет доступен ли claude CLI
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
 * Форматирование даты
 */
export function formatDate(ts) {
   const d = new Date(ts);
   const now = new Date();
   const days = Math.floor((now - d) / 86400000);
   const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

   if (days === 0) return `сегодня ${time}`;
   if (days === 1) return `вчера ${time}`;
   if (days < 7) return `${days} дн. назад`;
   return d.toLocaleDateString('ru-RU');
}

/**
 * Короткое имя проекта
 */
export function shortProjectName(projectPath) {
   if (!projectPath) return 'unknown';
   // Поддержка и / и \ (Windows)
   const parts = projectPath.split(/[/\\]/);
   return parts[parts.length - 1] || parts[parts.length - 2] || projectPath;
}
