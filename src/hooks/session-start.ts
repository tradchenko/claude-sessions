#!/usr/bin/env node

/**
 * SessionStart hook: outputs memory catalog + hot memories to stdout.
 * Standalone — does not import package modules (runs from ~/.claude/scripts/).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Category weights for hotness calculation */
const CATEGORY_WEIGHTS: Record<string, number> = {
   profile: 0.5,
   preferences: 0.7,
   entities: 0.4,
   events: 0.3,
   cases: 0.8,
   patterns: 0.6,
};

const DECAY_TAU_DAYS = 60;
const MAX_CATALOG_ENTRIES = 30;
const MAX_HOT_CONTENT_CHARS = 3000;

/** Memory entry in the index */
interface MemoryEntry {
   name: string;
   category: string;
   description?: string;
   content?: string;
   lastAccessed?: number;
   active_count?: number;
   projects?: string[];
   hotness?: number;
}

/** Memory index */
interface MemoryIndex {
   version?: number;
   memories: Record<string, MemoryEntry>;
   sessions: Record<string, unknown>;
}

/** Context for hotness calculation */
interface HotnessContext {
   maxActiveCount: number;
   currentProject: string;
}

/** Hook data */
interface HookData {
   cwd?: string;
   project?: string;
}

/** Reads index from file */
function readIndex(indexPath: string): MemoryIndex {
   try {
      return JSON.parse(readFileSync(indexPath, 'utf8')) as MemoryIndex;
   } catch {
      return { version: 1, memories: {}, sessions: {} };
   }
}

/** Calculates memory hotness */
function calculateHotness(memory: MemoryEntry, context: HotnessContext): number {
   const { lastAccessed = Date.now(), active_count = 0, projects = [], category = 'cases' } = memory;
   const { maxActiveCount = 1, currentProject = '' } = context;

   const daysSince = (Date.now() - lastAccessed) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.exp(-daysSince / DECAY_TAU_DAYS);
   const frequencyScore = maxActiveCount > 0 ? Math.min(active_count / maxActiveCount, 1.0) : 0;

   const projectMatch = projects.includes(currentProject) ? 1.0 : projects.length === 0 ? 0.3 : 0.0;
   const categoryWeight = CATEGORY_WEIGHTS[category] || 0.5;
   const relevanceScore = projectMatch * 0.6 + categoryWeight * 0.4;

   return recencyScore * 0.3 + frequencyScore * 0.4 + relevanceScore * 0.3;
}

/** Recalculates hotness for all memories */
function recalculateAll(index: MemoryIndex, currentProject: string): MemoryIndex {
   const memories = Object.values(index.memories || {});
   const maxActiveCount = Math.max(1, ...memories.map((m) => m.active_count || 0));

   for (const mem of Object.values(index.memories || {})) {
      mem.hotness = calculateHotness(mem, { maxActiveCount, currentProject });
   }
   return index;
}

/** Generates markdown catalog table */
function generateCatalog(index: MemoryIndex): string {
   const entries = Object.values(index.memories || {})
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, MAX_CATALOG_ENTRIES);

   if (entries.length === 0) return '(no memories yet)';

   const lines = ['| name | category | hotness | description |', '|------|----------|---------|-------------|'];
   for (const m of entries) {
      lines.push(`| ${m.name} | ${m.category} | ${(m.hotness || 0).toFixed(2)} | ${(m.description || '').slice(0, 50)} |`);
   }
   return lines.join('\n');
}

/** Selects hot memories for the current project */
function selectHotMemories(index: MemoryIndex, currentProject: string, count = 5): MemoryEntry[] {
   return Object.values(index.memories || {})
      .filter((m) => !currentProject || (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, count);
}

/** Formats output for SessionStart hook */
function formatSessionStartOutput(index: MemoryIndex, currentProject: string): string {
   const catalog = generateCatalog(index);
   const hot = selectHotMemories(index, currentProject, 5);

   let output = `# Session Memory (auto-loaded)\n\n## Memory Catalog\n${catalog}\n`;

   if (hot.length > 0) {
      output += `\n## Hot Memories for ${currentProject || 'global'}\n\n`;
      let hotLen = 0;
      for (const m of hot) {
         const text = m.content || m.description || '';
         if (hotLen + text.length > MAX_HOT_CONTENT_CHARS) break;
         output += `### ${m.name} (${m.category})\n${text}\n\n`;
         hotLen += text.length;
      }
   }

   output += `\nTo load more: read files from ~/.claude/session-memory/memories/{category}/{name}.md\n`;
   return output;
}

// Main execution
try {
   let input = '';
   try {
      input = readFileSync(process.stdin.fd, 'utf8');
   } catch {
      // stdin unavailable
   }

   let project = '';
   try {
      const hookData = JSON.parse(input) as HookData;
      project = hookData.cwd || hookData.project || '';
   } catch {
      // Invalid JSON — use empty project
   }

   const memoryDir = process.env.MEMORY_DIR || join(homedir(), '.claude', 'session-memory');
   const indexPath = join(memoryDir, 'index.json');
   if (!existsSync(indexPath)) process.exit(0);

   let index = readIndex(indexPath);
   index = recalculateAll(index, project);
   const output = formatSessionStartOutput(index, project);
   process.stdout.write(output);
} catch {
   process.exit(0);
}
