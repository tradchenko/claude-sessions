/**
 * Enable session memory integration for all detected agents
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AgentInfo } from '../agents/types.js';

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
      // Gemini — hooks via `gemini hooks migrate`, skipping for now
      // Codex/Qwen — no hooks, use lazy extraction
   }
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
