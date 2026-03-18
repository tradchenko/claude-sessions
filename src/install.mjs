/**
 * Install slash commands, hooks and scripts to ~/.claude/
 * Safe: does not overwrite existing settings, only adds to them.
 *
 * Hook scripts run directly from the package directory (not copied to scripts/).
 * This ensures imports resolve correctly and updates are automatic.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { CLAUDE_DIR, COMMANDS_DIR, SCRIPTS_DIR, SETTINGS_FILE, HISTORY_FILE, SESSION_INDEX, MEMORY_DIR, MEMORIES_DIR, MEMORY_INDEX, PROJECTS_DIR, ensureClaudeDir } from './config.mjs';
import { t } from './i18n.mjs';
import { migrateSessionIndex, generateL0ForExistingSessions } from './memory/migrate.mjs';
import { writeIndex } from './memory/index.mjs';
import { enableMemory } from './enable-memory.mjs';

function askYesNo(question) {
   return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
         rl.close();
         const a = answer.trim().toLowerCase();
         resolve(a === '' || a === 'y' || a === 'yes');
      });
   });
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const PKG_SRC = join(PKG_ROOT, 'src');
const PKG_COMMANDS = join(PKG_ROOT, 'claude-commands');

const isAuto = process.argv.includes('--auto');

/**
 * Copy slash commands — compare content, update if changed.
 */
function installCommands() {
   const commands = [
      { file: 'sessions.md', desc: t('cmdSessionsDesc') },
      { file: 'session-summarize.md', desc: t('cmdSummarizeDesc') },
      { file: 'memory-recall.md', desc: t('cmdMemoryRecallDesc') },
      { file: 'memory-status.md', desc: t('cmdMemoryStatusDesc') },
   ];

   for (const cmd of commands) {
      const src = join(PKG_COMMANDS, cmd.file);
      const dest = join(COMMANDS_DIR, cmd.file);

      if (!existsSync(src)) continue;

      if (existsSync(dest)) {
         const srcContent = readFileSync(src, 'utf8');
         const destContent = readFileSync(dest, 'utf8');
         if (srcContent === destContent) {
            if (!isAuto) console.log(`   ⏭  ${cmd.desc} — ${t('alreadyExists')}`);
            continue;
         }
         copyFileSync(src, dest);
         if (!isAuto) console.log(`   🔄 ${cmd.desc} — updated`);
         continue;
      }

      copyFileSync(src, dest);
      if (!isAuto) console.log(`   ✅ ${cmd.desc}`);
   }
}

/**
 * Copy helper scripts to ~/.claude/scripts/ (only small standalone helpers).
 * Main hook scripts run from the package directly — no copy needed.
 */
function installScripts() {
   const scripts = [
      { src: 'save-summary-hook.mjs', dest: 'save-summary.mjs' },
   ];

   for (const s of scripts) {
      const srcPath = join(PKG_SRC, s.src);
      const destPath = join(SCRIPTS_DIR, s.dest);
      if (!existsSync(srcPath)) continue;

      if (existsSync(destPath)) {
         const srcContent = readFileSync(srcPath, 'utf8');
         const destContent = readFileSync(destPath, 'utf8');
         if (srcContent === destContent) {
            if (!isAuto) console.log(`   ⏭  ${s.dest} — ${t('alreadyExists')}`);
            continue;
         }
         copyFileSync(srcPath, destPath);
         if (!isAuto) console.log(`   🔄 ${s.dest} — updated`);
      } else {
         copyFileSync(srcPath, destPath);
         if (!isAuto) console.log(`   ✅ ${s.dest}`);
      }
   }
}

/**
 * Fix hook entries: wrong format and stale paths.
 * - Unwrap nested {hooks: [...]} to flat {type, command}
 * - Update paths pointing to ~/.claude/scripts/ to point to package src/
 */
function migrateHooks(settings) {
   let changed = false;
   const staleScripts = ['save-session-summary.mjs', 'session-start-hook.mjs'];

   for (const hookType of Object.keys(settings.hooks || {})) {
      const arr = settings.hooks[hookType];
      if (!Array.isArray(arr)) continue;

      for (let i = 0; i < arr.length; i++) {
         const entry = arr[i];

         // Fix nested format: {hooks: [{type, command}]} -> {type, command}
         if (entry.hooks && Array.isArray(entry.hooks) && entry.hooks.length > 0 && !entry.type) {
            const inner = entry.hooks[0];
            if (inner.type && inner.command) {
               arr[i] = { ...inner };
               if (entry.matcher) arr[i].matcher = entry.matcher;
               changed = true;
            }
         }

         // Fix stale paths: ~/.claude/scripts/X.mjs -> package/src/X.mjs
         // Match both absolute (/Users/.../scripts/) and tilde (~/.claude/scripts/) forms
         const cmd = arr[i].command || '';
         for (const script of staleScripts) {
            if (cmd.includes(script) && !cmd.includes(PKG_SRC)) {
               arr[i].command = `node ${join(PKG_SRC, script)}`;
               changed = true;
            }
         }
      }
   }
   return changed;
}

/**
 * Add Stop hook for auto-saving session metadata.
 * Points directly to package src/ — no copy needed.
 */
function installHook() {
   if (!existsSync(SETTINGS_FILE)) {
      if (!isAuto) console.log(`   ⚠️  ${t('settingsNotFound')}`);
      return;
   }

   try {
      const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));

      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.Stop) settings.hooks.Stop = [];

      // Fix wrongly-formatted or stale hook entries
      if (migrateHooks(settings)) {
         writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
         if (!isAuto) console.log(`   🔄 Hooks migrated`);
      }

      // Check if our hook is already installed
      const alreadyInstalled = settings.hooks.Stop.some((entry) => JSON.stringify(entry).includes('save-session-summary'));

      if (alreadyInstalled) {
         if (!isAuto) console.log(`   ⏭  Stop hook — ${t('alreadyInstalled')}`);
         return;
      }

      // Add hook pointing to package source
      settings.hooks.Stop.push({
         type: 'command',
         command: `node ${join(PKG_SRC, 'save-session-summary.mjs')}`,
      });

      writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      if (!isAuto) console.log(`   ✅ ${t('stopHookInstalled')}`);
   } catch (e) {
      if (!isAuto) console.log(`   ⚠️  ${t('failedSettings', e.message)}`);
   }
}

/**
 * Scan existing sessions and show statistics
 */
async function discoverExistingSessions() {
   if (!existsSync(HISTORY_FILE)) {
      console.log(`   ℹ️  ${t('historyEmpty')}`);
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
      console.log(`   ℹ️  ${t('noSessionsInstall')}`);
      return;
   }

   // Count sessions with summaries
   let withSummary = 0;
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         withSummary = Object.values(index).filter((v) => v.summary && v.summary.length > 10).length;
      } catch {}
   }

   // Find earliest and latest
   const sorted = Array.from(sessionsMap.values()).sort((a, b) => a.ts - b.ts);
   const oldest = new Date(sorted[0].ts).toLocaleDateString('en-US');
   const newest = new Date(sorted[sorted.length - 1].ts).toLocaleDateString('en-US');

   console.log(`   📊 ${t('sessionsFound', total)}`);
   console.log(`   📁 ${t('projects', projects.size, [...projects].slice(0, 5).join(', ') + (projects.size > 5 ? '...' : ''))}`);
   console.log(`   📅 ${t('period', oldest, newest)}`);
   console.log(`   📝 ${t('withSummary', withSummary, total)}`);

   if (total - withSummary > 0) {
      console.log(`\n   💡 ${t('withoutDesc', total - withSummary)}`);
      console.log(`      ${t('runSummarize')}`);
   }
}

/**
 * Detect user terminal and provide recommendations
 */
function detectTerminal() {
   const term = process.env.TERM_PROGRAM || process.env.TERM || 'unknown';
   const warp = process.env.WARP_IS_LOCAL_SHELL_SESSION === '1' || process.env.TERM_PROGRAM === 'WarpTerminal';
   const vscode = process.env.TERM_PROGRAM === 'vscode';
   const iterm = process.env.TERM_PROGRAM === 'iTerm.app';
   const companion = process.env.COMPANION_AUTH_TOKEN || process.env.SDK_URL;

   console.log(`   🖥  ${t('terminal')}: ${warp ? 'Warp' : vscode ? 'VS Code' : iterm ? 'iTerm2' : term}`);

   if (warp) {
      console.log(`   ℹ️  ${t('warpNote')}`);
   }
   if (companion) {
      console.log(`   ℹ️  ${t('companionNote')}`);
   }
}

export default async function install() {
   console.log(`\n🔧 ${t('installing')}\n`);

   ensureClaudeDir();
   console.log(`   📁 Claude Code: ${CLAUDE_DIR}`);

   detectTerminal();

   console.log(`\n   ${t('slashCommands')}`);
   installCommands();

   console.log(`\n   ${t('scripts')}`);
   installScripts();

   console.log(`\n   ${t('hooks')}`);
   installHook();

   console.log(`\n   ${t('existingSessions')}`);
   await discoverExistingSessions();

   // Create memory directories
   mkdirSync(MEMORY_DIR, { recursive: true });
   mkdirSync(MEMORIES_DIR, { recursive: true });

   // Migrate existing sessions to new memory index
   if (existsSync(SESSION_INDEX)) {
      const index = migrateSessionIndex(SESSION_INDEX, MEMORY_INDEX, PROJECTS_DIR);
      const l0Count = generateL0ForExistingSessions(index, PROJECTS_DIR);
      if (l0Count > 0) writeIndex(MEMORY_INDEX, index);
      console.log(`\n   ${t('memoryMigrated', Object.keys(index.sessions).length, l0Count)}`);
   }

   // Ask to enable Claude memory integration (interactive mode only)
   if (!isAuto) {
      console.log('');
      console.log(`   ${t('memoryPrompt')}`);
      console.log(`   This will:`);
      console.log(`     - Add a SessionStart hook to load relevant memories`);
      console.log(`     - Add instructions to ~/.claude/CLAUDE.md`);
      console.log('');
      const yes = await askYesNo('   Enable memory integration? [Y/n]: ');
      if (yes) {
         enableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md'), scriptsDir: PKG_SRC });
         console.log(`\n   ✅ ${t('memoryEnabled')}`);
      } else {
         console.log(`\n   💡 ${t('memoryEnableLater')}`);
      }
   } else {
      console.log(`\n   💡 ${t('memoryEnableLater')}`);
   }

   console.log(`\n✅ ${t('installComplete')}\n`);
   console.log(`${t('usage')}`);
   console.log(`   ${t('usagePicker')}`);
   console.log(`   ${t('usageAlias')}`);
   console.log(`   ${t('usageQuick')}`);
   console.log(`   ${t('usageSearch')}`);
   console.log(`   ${t('usageSessions')}`);
   console.log(`   ${t('usageSummarize')}\n`);
}

// Support direct invocation from postinstall
if (process.argv[1]?.endsWith('install.mjs') && isAuto) {
   install().catch(() => {});
}
