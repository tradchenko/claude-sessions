/**
 * Установка slash-команд, hooks и скриптов в ~/.claude/
 * Безопасно: не перезаписывает существующие настройки, а дополняет.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CLAUDE_DIR, COMMANDS_DIR, SCRIPTS_DIR, SETTINGS_FILE, HISTORY_FILE, SESSION_INDEX, ensureClaudeDir } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const PKG_COMMANDS = join(PKG_ROOT, 'claude-commands');

const isAuto = process.argv.includes('--auto');

/**
 * Копирует slash-команды
 */
function installCommands() {
   const commands = [
      { file: 'sessions.md', desc: '/sessions — список сессий' },
      { file: 'session-summarize.md', desc: '/session-summarize — AI-резюме' },
   ];

   for (const cmd of commands) {
      const src = join(PKG_COMMANDS, cmd.file);
      const dest = join(COMMANDS_DIR, cmd.file);

      if (!existsSync(src)) continue;

      if (existsSync(dest)) {
         if (!isAuto) console.log(`   ⏭  ${cmd.desc} — уже существует, пропускаю`);
         continue;
      }

      copyFileSync(src, dest);
      if (!isAuto) console.log(`   ✅ ${cmd.desc}`);
   }
}

/**
 * Копирует вспомогательный скрипт save-summary.mjs
 */
function installScripts() {
   const saveSummary = join(PKG_ROOT, 'src', 'save-summary-hook.mjs');
   const dest = join(SCRIPTS_DIR, 'save-summary.mjs');

   if (existsSync(saveSummary) && !existsSync(dest)) {
      copyFileSync(saveSummary, dest);
      if (!isAuto) console.log('   ✅ save-summary.mjs скопирован');
   }
}

/**
 * Добавляет Stop hook для автосохранения метаданных сессии.
 * Безопасно: не трогает существующие hooks.
 */
function installHook() {
   if (!existsSync(SETTINGS_FILE)) {
      if (!isAuto) console.log('   ⚠️  settings.json не найден — hook не установлен');
      return;
   }

   try {
      const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));

      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.Stop) settings.hooks.Stop = [];

      // Проверяем, не установлен ли уже наш hook
      const alreadyInstalled = settings.hooks.Stop.some((entry) => JSON.stringify(entry).includes('save-session-summary'));

      if (alreadyInstalled) {
         if (!isAuto) console.log('   ⏭  Stop hook — уже установлен');
         return;
      }

      // Добавляем hook
      settings.hooks.Stop.push({
         hooks: [
            {
               type: 'command',
               command: `node ${join(SCRIPTS_DIR, 'save-session-summary.mjs')}`,
            },
         ],
      });

      writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      if (!isAuto) console.log('   ✅ Stop hook для автосохранения метаданных');
   } catch (e) {
      if (!isAuto) console.log(`   ⚠️  Не удалось обновить settings.json: ${e.message}`);
   }
}

/**
 * Копирует save-session-summary.mjs
 */
function installSaveHookScript() {
   const src = join(PKG_ROOT, 'src', 'save-session-summary.mjs');
   const dest = join(SCRIPTS_DIR, 'save-session-summary.mjs');

   if (!existsSync(dest) && existsSync(src)) {
      copyFileSync(src, dest);
      if (!isAuto) console.log('   ✅ save-session-summary.mjs скопирован');
   }
}

/**
 * Сканирует существующие сессии и показывает статистику
 */
async function discoverExistingSessions() {
   if (!existsSync(HISTORY_FILE)) {
      console.log('   ℹ️  История сессий пуста. Запусти Claude Code чтобы создать первые сессии.');
      return;
   }

   const { createReadStream } = await import('fs');
   const { createInterface: rl } = await import('readline');

   const reader = rl({ input: createReadStream(HISTORY_FILE, { encoding: 'utf8' }), crlfDelay: Infinity });

   const sessionsMap = new Map();
   const projects = new Set();

   for await (const line of reader) {
      if (!line.trim()) continue;
      try {
         const e = JSON.parse(line);
         if (!e.sessionId) continue;
         if (!sessionsMap.has(e.sessionId)) {
            sessionsMap.set(e.sessionId, { ts: e.timestamp, project: e.project || '' });
            if (e.project) projects.add(e.project.split('/').pop() || e.project);
         } else {
            sessionsMap.get(e.sessionId).ts = Math.max(sessionsMap.get(e.sessionId).ts, e.timestamp);
         }
      } catch {}
   }

   const total = sessionsMap.size;
   if (total === 0) {
      console.log('   ℹ️  Сессий не найдено.');
      return;
   }

   // Считаем сессии с резюме
   let withSummary = 0;
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         withSummary = Object.values(index).filter((v) => v.summary && v.summary.length > 10).length;
      } catch {}
   }

   // Находим самую раннюю и последнюю
   const sorted = Array.from(sessionsMap.values()).sort((a, b) => a.ts - b.ts);
   const oldest = new Date(sorted[0].ts).toLocaleDateString('ru-RU');
   const newest = new Date(sorted[sorted.length - 1].ts).toLocaleDateString('ru-RU');

   console.log(`   📊 Найдено сессий: ${total}`);
   console.log(`   📁 Проектов: ${projects.size} (${[...projects].slice(0, 5).join(', ')}${projects.size > 5 ? '...' : ''})`);
   console.log(`   📅 Период: ${oldest} — ${newest}`);
   console.log(`   📝 С AI-резюме: ${withSummary}/${total}`);

   if (total - withSummary > 0) {
      console.log(`\n   💡 ${total - withSummary} сессий без описания.`);
      console.log(`      Запусти: claude-sessions summarize`);
   }
}

/**
 * Определяет терминал пользователя и даёт рекомендации
 */
function detectTerminal() {
   const term = process.env.TERM_PROGRAM || process.env.TERM || 'unknown';
   const warp = process.env.WARP_IS_LOCAL_SHELL_SESSION === '1' || process.env.TERM_PROGRAM === 'WarpTerminal';
   const vscode = process.env.TERM_PROGRAM === 'vscode';
   const iterm = process.env.TERM_PROGRAM === 'iTerm.app';
   const companion = process.env.COMPANION_AUTH_TOKEN || process.env.SDK_URL;

   console.log(`   🖥  Терминал: ${warp ? 'Warp' : vscode ? 'VS Code' : iterm ? 'iTerm2' : term}`);

   if (warp) {
      console.log(`   ℹ️  Warp: TUI пикер использует Node.js (не fzf) для совместимости`);
   }
   if (companion) {
      console.log(`   ℹ️  The Companion обнаружен — /sessions будет работать через WebSocket`);
   }
}

export default async function install() {
   console.log('\n🔧 Установка claude-sessions...\n');

   ensureClaudeDir();
   console.log(`   📁 Claude Code: ${CLAUDE_DIR}`);

   detectTerminal();

   console.log('\n   Slash-команды:');
   installCommands();

   console.log('\n   Скрипты:');
   installScripts();
   installSaveHookScript();

   console.log('\n   Hooks:');
   installHook();

   console.log('\n   Существующие сессии:');
   await discoverExistingSessions();

   console.log('\n✅ Установка завершена!\n');
   console.log('Использование:');
   console.log('   claude-sessions     — интерактивный TUI пикер (стрелки + поиск)');
   console.log('   cs                  — короткий алиас');
   console.log('   cs 3                — быстрый запуск сессии #3');
   console.log('   cs --search miniapp — поиск по содержимому');
   console.log('   /sessions           — внутри Claude Code');
   console.log('   /session-summarize  — AI-резюме внутри Claude Code\n');
}

// Поддержка прямого вызова из postinstall
if (process.argv[1]?.endsWith('install.mjs') && isAuto) {
   install().catch(() => {});
}
