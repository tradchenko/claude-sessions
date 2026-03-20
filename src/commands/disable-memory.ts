/**
 * Disable session memory integration for all agents
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { detectAgents } from '../agents/registry.js';
import type { AgentInfo } from '../agents/types.js';
import { findCli } from '../core/config.js';
import { t } from '../core/i18n/index.js';

interface ClaudeSettings {
   hooks?: {
      SessionStart?: Array<Record<string, unknown>>;
      [key: string]: unknown;
   };
   [key: string]: unknown;
}

interface DisableMemoryOptions {
   settingsPath: string;
   claudeMdPath: string;
}

/** Memory section marker in instruction files */
const MEMORY_MARKER = '# Session Memory System';

/**
 * Resolves the absolute path to an agent's instructions file.
 * Returns null if the agent has no instructions file configured.
 */
function getAgentInstructionsPath(agent: AgentInfo): string | null {
   if (!agent.instructionsFile) return null;
   // Absolute path — use as-is
   if (agent.instructionsFile.startsWith('/')) return agent.instructionsFile;
   // Relative — resolve against homeDir
   return join(agent.homeDir, agent.instructionsFile);
}

/**
 * Removes the Session Memory System section from a markdown file.
 * The section starts with `# Session Memory System` and ends before the next `# ` heading.
 */
function removeMemorySection(filePath: string): boolean {
   if (!existsSync(filePath)) return false;

   let md = readFileSync(filePath, 'utf8');
   const idx = md.indexOf(MEMORY_MARKER);
   if (idx === -1) return false;

   const nextHeading = md.indexOf('\n# ', idx + MEMORY_MARKER.length);
   md = md.slice(0, idx).trimEnd() + (nextHeading !== -1 ? md.slice(nextHeading) : '');
   writeFileSync(filePath, md);
   return true;
}

export function disableMemory({ settingsPath, claudeMdPath }: DisableMemoryOptions): void {
   // Remove SessionStart hook from Claude settings
   if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as ClaudeSettings;
      if (settings.hooks?.SessionStart) {
         settings.hooks.SessionStart = settings.hooks.SessionStart.filter((h) => {
            const s = JSON.stringify(h);
            return !s.includes('session-start-hook') && !s.includes('session-start.js');
         });
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
   }

   // Remove memory section from CLAUDE.md (always, even if not detected as agent)
   removeMemorySection(claudeMdPath);

   // Remove memory section from all detected agents' instruction files
   const { installed } = detectAgents();
   const processed = new Set<string>();
   // Mark claudeMdPath as already processed
   processed.add(claudeMdPath);

   for (const agent of installed) {
      const instrPath = getAgentInstructionsPath(agent);
      if (!instrPath || processed.has(instrPath)) continue;
      processed.add(instrPath);
      removeMemorySection(instrPath);
   }

   // Удалить hooks из Qwen settings.json
   disableQwenHooks(installed);

   // Удалить MCP серверы из Codex и Qwen
   disableCodexMcp();
   disableQwenMcp();
}

/**
 * Удаляет hooks session-memory из Qwen settings.json
 */
function disableQwenHooks(agents: AgentInfo[]): void {
   const qwen = agents.find((a) => a.id === 'qwen');
   if (!qwen) return;

   const settingsPath = join(qwen.homeDir, 'settings.json');
   if (!existsSync(settingsPath)) return;

   const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as ClaudeSettings;
   if (!settings.hooks) return;

   let changed = false;

   // Удалить SessionStart hooks с session-start.js
   if (settings.hooks.SessionStart) {
      const before = settings.hooks.SessionStart.length;
      settings.hooks.SessionStart = settings.hooks.SessionStart.filter((h) => {
         const s = JSON.stringify(h);
         return !s.includes('session-start-hook') && !s.includes('session-start.js');
      });
      if (settings.hooks.SessionStart.length !== before) changed = true;
   }

   // Удалить Stop hooks с stop.js
   const stopHooks = (settings.hooks as Record<string, unknown>).Stop as Array<Record<string, unknown>> | undefined;
   if (stopHooks) {
      const before = stopHooks.length;
      const filtered = stopHooks.filter((h) => {
         const s = JSON.stringify(h);
         return !s.includes('stop-hook') && !s.includes('stop.js');
      });
      if (filtered.length !== before) {
         (settings.hooks as Record<string, unknown>).Stop = filtered;
         changed = true;
      }
   }

   if (changed) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`   ✅ ${t('qwenHooksRemoved')}`);
   }
}

/**
 * Удаляет MCP сервер session-memory из Codex CLI
 */
function disableCodexMcp(): void {
   try {
      const codexBin = findCli('codex');
      if (!codexBin) return;

      execSync(`${codexBin} mcp remove session-memory`, { timeout: 5000 });
      console.log(`   ✅ ${t('codexMcpRemoved')}`);
   } catch (e) {
      // Игнорируем ошибку если сервер не был зарегистрирован
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('not found') && !msg.includes('does not exist')) {
         console.log(`   ⚠️ Codex MCP: ${msg || t('mcpError')}`);
      }
   }
}

/**
 * Удаляет MCP сервер session-memory из Qwen CLI
 */
function disableQwenMcp(): void {
   try {
      const qwenBin = findCli('qwen');
      if (!qwenBin) return;

      execSync(`${qwenBin} mcp remove session-memory`, { timeout: 5000 });
      console.log(`   ✅ ${t('qwenMcpRemoved')}`);
   } catch (e) {
      // Игнорируем ошибку если сервер не был зарегистрирован
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('not found') && !msg.includes('does not exist')) {
         console.log(`   ⚠️ Qwen MCP: ${msg || t('mcpError')}`);
      }
   }
}
