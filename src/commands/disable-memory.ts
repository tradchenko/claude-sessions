/**
 * Disable session memory integration for all agents
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectAgents } from '../agents/registry.js';
import type { AgentInfo } from '../agents/types.js';

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
}
