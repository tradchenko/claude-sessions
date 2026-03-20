/**
 * Enable session memory integration for all detected agents
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import type { AgentInfo } from '../agents/types.js';
import { findCli } from '../core/config.js';
import { t } from '../core/i18n/index.js';

/** Universal memory instructions section for any agent */
const MEMORY_SECTION = `
# Session Memory System
You have a structured memory system at \`~/.claude/session-memory/\`.
A catalog and hot memories are loaded at session start.
If you need more context, read specific memory files via Read tool.
Path: \`~/.claude/session-memory/memories/{category}/{name}.md\`
Do not modify these files directly — they are managed by claude-sessions.
`;

const MEMORY_MARKER = '# Session Memory System';

interface HookSettings {
   hooks?: {
      SessionStart?: Array<Record<string, unknown>>;
      Stop?: Array<Record<string, unknown>>;
      [key: string]: unknown;
   };
   [key: string]: unknown;
}

/** Формат settings.json для Gemini CLI */
interface GeminiSettings {
   hooks?: {
      SessionStart?: Array<Record<string, unknown>>;
      AfterAgent?: Array<Record<string, unknown>>;
      [key: string]: unknown;
   };
   [key: string]: unknown;
}

/** Формат settings.json для Qwen CLI (v0.12.6+ с --experimental-hooks) */
interface QwenSettings {
   hooks?: {
      SessionStart?: Array<Record<string, unknown>>;
      Stop?: Array<Record<string, unknown>>;
      [key: string]: unknown;
   };
   [key: string]: unknown;
}

export interface EnableMemoryOptions {
   settingsPath: string;
   claudeMdPath: string;
   scriptsDir: string;
}

/**
 * Enables memory for Claude Code (hooks + instructions)
 */
export function enableMemory({ settingsPath, claudeMdPath, scriptsDir }: EnableMemoryOptions): void {
   // SessionStart hook in settings.json
   const settings: HookSettings = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as HookSettings) : {};
   if (!settings.hooks) settings.hooks = {};
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

   const hookCmd = `node ${join(scriptsDir, 'hooks', 'session-start.js')}`;
   const hookStr = JSON.stringify(settings.hooks.SessionStart);
   const exists = hookStr.includes('session-start.js') || hookStr.includes('session-start-hook');
   if (!exists) {
      settings.hooks.SessionStart.push({
         matcher: '',
         hooks: [{ type: 'command', command: hookCmd }],
      } as unknown as Record<string, unknown>);
   }
   writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

   // Instructions in CLAUDE.md
   injectInstructions(claudeMdPath);
}

/**
 * Injects memory section into agent instructions file.
 * Works with any file: CLAUDE.md, AGENTS.md, QWEN.md, GEMINI.md
 */
export function injectInstructions(filePath: string): void {
   mkdirSync(dirname(filePath), { recursive: true });
   const content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
   if (!content.includes(MEMORY_MARKER)) {
      writeFileSync(filePath, content + '\n' + MEMORY_SECTION);
   }
}

/**
 * Enables memory for all detected agents.
 * Injects instructions into each agent's file.
 * For agents with hooks — installs hooks.
 */
export function enableMemoryForAllAgents(agents: AgentInfo[], scriptsDir: string): void {
   for (const agent of agents) {
      // Instructions for each agent
      const instructionsPath = getAgentInstructionsPath(agent);
      if (instructionsPath) {
         injectInstructions(instructionsPath);
      }

      // Hooks — only for Claude (settings.json) and Gemini (via migration)
      if (agent.id === 'claude') {
         const settingsPath = join(agent.homeDir, 'settings.json');
         if (existsSync(settingsPath)) {
            enableClaudeHooks(settingsPath, scriptsDir);
         }
      }
      // Gemini — прямая запись hooks в settings.json
      if (agent.id === 'gemini') {
         const settingsPath = join(agent.homeDir, 'settings.json');
         enableGeminiHooks(settingsPath, scriptsDir);
      }
      // Qwen — hooks через settings.json (v0.12.6+ с --experimental-hooks)
      if (agent.id === 'qwen') {
         const settingsPath = join(agent.homeDir, 'settings.json');
         enableQwenHooks(settingsPath, scriptsDir);
      }
      // Codex — no hooks, use lazy extraction
   }

   // MCP серверы для агентов без hooks
   enableCodexMcp();
   enableQwenMcp();
}

/**
 * Determines the path to the agent's instructions file
 */
function getAgentInstructionsPath(agent: AgentInfo): string | null {
   if (!agent.instructionsFile) return null;
   // If path is absolute — use as is
   if (agent.instructionsFile.startsWith('/')) return agent.instructionsFile;
   // Otherwise — relative to homeDir
   return join(agent.homeDir, agent.instructionsFile);
}

/**
 * Installs Claude memory hooks (without duplication)
 */
function enableClaudeHooks(settingsPath: string, scriptsDir: string): void {
   const settings: HookSettings = JSON.parse(readFileSync(settingsPath, 'utf8')) as HookSettings;
   if (!settings.hooks) settings.hooks = {};
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

   const hookCmd = `node ${join(scriptsDir, 'hooks', 'session-start.js')}`;
   const hookStr = JSON.stringify(settings.hooks.SessionStart);
   if (hookStr.includes('session-start.js') || hookStr.includes('session-start-hook')) return;

   settings.hooks.SessionStart.push({
      matcher: '',
      hooks: [{ type: 'command', command: hookCmd }],
   } as unknown as Record<string, unknown>);

   writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

/**
 * Устанавливает hooks для Gemini CLI (SessionStart + AfterAgent)
 * Формат hooks Gemini аналогичен Claude, но событие Stop называется AfterAgent
 */
function enableGeminiHooks(settingsPath: string, scriptsDir: string): void {
   const settings: GeminiSettings = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as GeminiSettings) : {};
   if (!settings.hooks) settings.hooks = {};

   let changed = false;

   // SessionStart — загрузка памяти при старте сессии
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
   const startCmd = `node ${join(scriptsDir, 'hooks', 'session-start.js')}`;
   const startStr = JSON.stringify(settings.hooks.SessionStart);
   if (!startStr.includes('session-start.js') && !startStr.includes('session-start-hook')) {
      settings.hooks.SessionStart.push({
         matcher: '',
         hooks: [{ type: 'command', command: startCmd }],
      } as unknown as Record<string, unknown>);
      changed = true;
   }

   // AfterAgent — L0 extraction при завершении ответа агента
   if (!settings.hooks.AfterAgent) settings.hooks.AfterAgent = [];
   const stopCmd = `node ${join(scriptsDir, 'hooks', 'stop.js')}`;
   const stopStr = JSON.stringify(settings.hooks.AfterAgent);
   if (!stopStr.includes('stop.js') && !stopStr.includes('stop-hook')) {
      settings.hooks.AfterAgent.push({
         matcher: '',
         hooks: [{ type: 'command', command: stopCmd }],
      } as unknown as Record<string, unknown>);
      changed = true;
   }

   if (changed) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
   }
}

/**
 * Устанавливает hooks для Qwen CLI (SessionStart + Stop)
 * Qwen v0.12.6+ поддерживает экспериментальные hooks (--experimental-hooks).
 * Формат hooks совместим с Claude — JSON в settings.json.
 */
function enableQwenHooks(settingsPath: string, scriptsDir: string): void {
   const settings: QwenSettings = existsSync(settingsPath) ? (JSON.parse(readFileSync(settingsPath, 'utf8')) as QwenSettings) : {};
   if (!settings.hooks) settings.hooks = {};

   let changed = false;

   // SessionStart — загрузка памяти при старте сессии
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
   const startCmd = `node ${join(scriptsDir, 'hooks', 'session-start.js')}`;
   const startStr = JSON.stringify(settings.hooks.SessionStart);
   if (!startStr.includes('session-start.js') && !startStr.includes('session-start-hook')) {
      settings.hooks.SessionStart.push({
         matcher: '',
         hooks: [{ type: 'command', command: startCmd }],
      } as unknown as Record<string, unknown>);
      changed = true;
   }

   // Stop — извлечение памяти при завершении сессии
   if (!settings.hooks.Stop) settings.hooks.Stop = [];
   const stopCmd = `node ${join(scriptsDir, 'hooks', 'stop.js')}`;
   const stopStr = JSON.stringify(settings.hooks.Stop);
   if (!stopStr.includes('stop.js') && !stopStr.includes('stop-hook')) {
      settings.hooks.Stop.push({
         matcher: '',
         hooks: [{ type: 'command', command: stopCmd }],
      } as unknown as Record<string, unknown>);
      changed = true;
   }

   if (changed) {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
   }
}

/**
 * Регистрирует MCP сервер session-memory в Codex CLI
 */
function enableCodexMcp(): void {
   try {
      const codexBin = findCli('codex');
      if (!codexBin) return;

      // Проверить что сервер ещё не зарегистрирован
      const listOutput = execSync(`${codexBin} mcp list`, { encoding: 'utf8', timeout: 5000 });
      if (listOutput.includes('session-memory')) {
         console.log(`   ${t('codexMcpAlreadyRegistered')}`);
         return;
      }

      // Найти путь к cs binary
      const csBin = findCli('cs') || findCli('claude-sessions');
      if (!csBin) return;

      execSync(`${codexBin} mcp add session-memory -- ${csBin} mcp-server`, { timeout: 5000 });
      console.log(`   ✅ ${t('codexMcpRegistered')}`);
   } catch (e) {
      console.log(`   ⚠️ Codex MCP: ${e instanceof Error ? e.message : t('mcpError')}`);
   }
}

/**
 * Регистрирует MCP сервер session-memory в Qwen CLI
 */
function enableQwenMcp(): void {
   try {
      const qwenBin = findCli('qwen');
      if (!qwenBin) return;

      // Проверить что сервер ещё не зарегистрирован
      const listOutput = execSync(`${qwenBin} mcp list`, { encoding: 'utf8', timeout: 5000 });
      if (listOutput.includes('session-memory')) {
         console.log(`   ${t('qwenMcpAlreadyRegistered')}`);
         return;
      }

      // Найти путь к cs binary
      const csBin = findCli('cs') || findCli('claude-sessions');
      if (!csBin) return;

      execSync(`${qwenBin} mcp add session-memory -- ${csBin} mcp-server`, { timeout: 5000 });
      console.log(`   ✅ ${t('qwenMcpRegistered')}`);
   } catch (e) {
      console.log(`   ⚠️ Qwen MCP: ${e instanceof Error ? e.message : t('mcpError')}`);
   }
}
