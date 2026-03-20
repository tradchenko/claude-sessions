/**
 * Install slash commands, hooks, and scripts to ~/.claude/
 * Safe: does not overwrite existing settings, only adds.
 *
 * Hook scripts run from the package directory (not copied to scripts/).
 * This ensures correct import resolution and automatic updates.
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import {
   CLAUDE_DIR,
   COMMANDS_DIR,
   SCRIPTS_DIR,
   SETTINGS_FILE,
   HISTORY_FILE,
   SESSION_INDEX,
   MEMORY_DIR,
   MEMORIES_DIR,
   MEMORY_INDEX,
   PROJECTS_DIR,
   ensureClaudeDir,
} from '../core/config.js';
import { t } from '../core/i18n/index.js';
import { migrateSessionIndex, generateL0ForExistingSessions } from '../memory/migrate.js';
import { writeIndex } from '../memory/index.js';
import { enableMemory } from './enable-memory.js';

/** Claude settings structure */
interface ClaudeSettings {
   hooks?: {
      Stop?: Array<HookEntry>;
      SessionStart?: Array<HookEntry>;
      [key: string]: unknown;
   };
   [key: string]: unknown;
}

/** Hook entry */
interface HookEntry {
   type?: string;
   command?: string;
   matcher?: string;
   hooks?: HookEntry[];
   [key: string]: unknown;
}

/** Slash command definition */
interface CommandDef {
   file: string;
   desc: string;
}

/** Script definition */
interface ScriptDef {
   src: string;
   dest: string;
}

/** Session entry in history */
interface HistoryEntry {
   sessionId?: string;
   timestamp: number;
   project?: string;
   display?: string;
}

/** Session from Map */
interface DiscoveredSession {
   ts: number;
   project: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..', '..');
const PKG_DIST = join(PKG_ROOT, 'dist');
const PKG_COMMANDS = join(PKG_ROOT, 'claude-commands');

const isAuto = process.argv.includes('--auto');

/** Interactive yes/no question */
function askYesNo(question: string): Promise<boolean> {
   return new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
         rl.close();
         const a = answer.trim().toLowerCase();
         resolve(a === '' || a === 'y' || a === 'yes');
      });
   });
}

/**
 * Copy slash commands — compare content, update on change.
 */
function installCommands(): void {
   const commands: CommandDef[] = [
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
 * Copy helper scripts to ~/.claude/scripts/.
 * Main hook scripts run from the package — no copying needed.
 */
function installScripts(): void {
   const scripts: ScriptDef[] = [{ src: 'save-summary.js', dest: 'save-summary.js' }];

   for (const s of scripts) {
      const srcPath = join(PKG_DIST, 'hooks', s.dest);
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
 * Migrate hooks to correct format {matcher, hooks: [{type, command}]}
 * and update legacy paths to dist/
 */
export function migrateHooks(settings: ClaudeSettings): boolean {
   let changed = false;

   // Map old scripts to new paths
   const scriptMapping: Record<string, string> = {
      'save-session-summary.mjs': join(PKG_DIST, 'hooks', 'stop.js'),
      'session-start-hook.mjs': join(PKG_DIST, 'hooks', 'session-start.js'),
   };

   for (const hookType of Object.keys(settings.hooks || {})) {
      const arr = (settings.hooks as Record<string, HookEntry[]>)[hookType];
      if (!Array.isArray(arr)) continue;

      for (let i = 0; i < arr.length; i++) {
         const entry = arr[i];
         if (!entry) continue;

         // Flat format {type, command} → wrap in {matcher, hooks: [...]}
         if (entry.type && entry.command && !entry.hooks) {
            const matcher = entry.matcher || '';
            arr[i] = {
               matcher,
               hooks: [{ type: entry.type, command: entry.command }],
            } as unknown as HookEntry;
            changed = true;
         }

         // Update legacy paths in hooks[].command
         const hooks = (arr[i] as unknown as { hooks?: Array<{ command?: string }> }).hooks;
         if (Array.isArray(hooks)) {
            for (const hook of hooks) {
               if (!hook.command) continue;
               for (const [oldScript, newPath] of Object.entries(scriptMapping)) {
                  if (hook.command.includes(oldScript) && !hook.command.includes(PKG_DIST)) {
                     hook.command = `node ${newPath}`;
                     changed = true;
                  }
               }
            }
         }
      }
   }
   return changed;
}

/**
 * Adds Stop hook for auto-saving session metadata.
 * Points to package src/ — no copying needed.
 */
function installHook(): void {
   if (!existsSync(SETTINGS_FILE)) {
      if (!isAuto) console.log(`   ⚠️  ${t('settingsNotFound')}`);
      return;
   }

   try {
      const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) as ClaudeSettings;

      if (!settings.hooks) settings.hooks = {};
      if (!settings.hooks.Stop) settings.hooks.Stop = [];

      // Fix incorrectly formatted or legacy hook entries
      if (migrateHooks(settings)) {
         writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
         if (!isAuto) console.log(`   🔄 Hooks migrated`);
      }

      // Check if our hook is already installed
      const hookStr = JSON.stringify(settings.hooks.Stop);
      const alreadyInstalled = hookStr.includes('stop.js') || hookStr.includes('save-session-summary');

      if (alreadyInstalled) {
         if (!isAuto) console.log(`   ⏭  Stop hook — ${t('alreadyInstalled')}`);
         return;
      }

      // Add hook in correct format {matcher, hooks: [...]}
      (settings.hooks.Stop as unknown as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>).push({
         matcher: '',
         hooks: [{ type: 'command', command: `node ${join(PKG_DIST, 'hooks', 'stop.js')}` }],
      });

      writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
      if (!isAuto) console.log(`   ✅ ${t('stopHookInstalled')}`);
   } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (!isAuto) console.log(`   ⚠️  ${t('failedSettings', message)}`);
   }
}

/**
 * Scan existing sessions and show statistics
 */
async function discoverExistingSessions(): Promise<void> {
   if (!existsSync(HISTORY_FILE)) {
      console.log(`   ℹ️  ${t('historyEmpty')}`);
      return;
   }

   const reader = createInterface({
      input: createReadStream(HISTORY_FILE, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   const sessionsMap = new Map<string, DiscoveredSession>();
   const projects = new Set<string>();

   for await (const line of reader) {
      if (!line.trim()) continue;
      try {
         const e = JSON.parse(line) as HistoryEntry;
         if (!e.sessionId) continue;
         if (!sessionsMap.has(e.sessionId)) {
            sessionsMap.set(e.sessionId, { ts: e.timestamp, project: e.project || '' });
            if (e.project) projects.add(e.project.split('/').pop() || e.project);
         } else {
            const existing = sessionsMap.get(e.sessionId)!;
            existing.ts = Math.max(existing.ts, e.timestamp);
         }
      } catch {
         // Skip invalid lines
      }
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
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as Record<string, { summary?: string }>;
         withSummary = Object.values(index).filter((v) => v.summary && v.summary.length > 10).length;
      } catch {
         // Ignore parse errors
      }
   }

   // Find earliest and latest dates
   const sorted = Array.from(sessionsMap.values()).sort((a, b) => a.ts - b.ts);
   const oldestTs = sorted[0]?.ts ?? Date.now();
   const newestTs = sorted[sorted.length - 1]?.ts ?? Date.now();
   const oldest = new Date(oldestTs).toLocaleDateString('en-US');
   const newest = new Date(newestTs).toLocaleDateString('en-US');

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
function detectTerminal(): void {
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

/**
 * Detect installed AI agents
 */
async function detectInstalledAgents(): Promise<void> {
   const { detectAgents, acknowledgeAgents } = await import('../agents/registry.js');
   const result = detectAgents();

   if (result.installed.length === 0) {
      console.log(`\n   🤖 ${t('noAgentsFound')}`);
      return;
   }

   console.log(`\n   🤖 ${t('detectedAgents')}:`);
   for (const agent of result.installed) {
      const cli = agent.cliBin ? '✅' : '⚠️';
      const hooks = agent.hooksSupport ? t('withHooks') : t('noHooks');
      console.log(`      ${agent.icon} ${agent.name} ${cli} (${hooks})`);
   }

   // Remember detected agents
   acknowledgeAgents(result.installed.map((a) => a.id));
}

export default async function install(): Promise<void> {
   console.log(`\n🔧 ${t('installing')}\n`);

   ensureClaudeDir();
   console.log(`   📁 Claude Code: ${CLAUDE_DIR}`);

   detectTerminal();

   // Detect AI agents
   await detectInstalledAgents();

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

   // Enable memory integration for all detected agents
   if (!isAuto) {
      const { detectAgents } = await import('../agents/registry.js');
      const { enableMemoryForAllAgents } = await import('./enable-memory.js');
      const detected = detectAgents();

      console.log('');
      console.log(`   ${t('memoryPrompt')}`);
      console.log(`   ${t('memoryWillDo')}:`);
      for (const agent of detected.installed) {
         if (agent.instructionsFile) {
            console.log(`     - ${agent.icon} ${agent.name}: ${t('memoryInjectInstructions')} ${agent.instructionsFile}`);
         }
         if (agent.hooksSupport && agent.id === 'claude') {
            console.log(`     - ${agent.icon} ${agent.name}: ${t('memoryInstallHooks')}`);
         }
      }
      console.log('');
      const yes = await askYesNo(`   ${t('memoryEnablePrompt')} [Y/n]: `);
      if (yes) {
         enableMemoryForAllAgents(detected.installed, PKG_DIST);
         // Also enable Claude-specific hooks via legacy path
         enableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md'), scriptsDir: PKG_DIST });
         console.log(`\n   ✅ ${t('memoryEnabled')}`);
         for (const agent of detected.installed) {
            if (agent.instructionsFile) {
               console.log(`      ${agent.icon} ${agent.name} — ✅`);
            }
         }
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
