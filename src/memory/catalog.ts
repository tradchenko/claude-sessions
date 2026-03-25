// Catalog generation and hot memory selection for session start loading
import type { MemoryEntry, MemoryIndex, SessionMeta } from './types.js';

export function generateCatalog(index: MemoryIndex): string {
   const entries = Object.values(index.memories || {}).sort((a, b) => (b.hotness || 0) - (a.hotness || 0));
   if (entries.length === 0) return '(no memories yet)';
   const MAX_CATALOG_ENTRIES = 30; // ~200 tokens for 30 lines
   const limited = entries.slice(0, MAX_CATALOG_ENTRIES);
   const lines = ['| name | category | hotness | description |', '|------|----------|---------|-------------|'];
   for (const m of limited) {
      lines.push(`| ${m.name} | ${m.category} | ${(m.hotness || 0).toFixed(2)} | ${(m.description || '').slice(0, 50)} |`);
   }
   return lines.join('\n');
}

export function selectHotMemories(index: MemoryIndex, currentProject: string, count = 5): MemoryEntry[] {
   return Object.values(index.memories || {})
      .filter((m) => !currentProject || (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, count);
}

/** Находит последнюю сессию для проекта с L0 данными */
function findLastSessionForProject(index: MemoryIndex, currentProject: string): SessionMeta | undefined {
   const sessions = Object.values(index.sessions || {});
   return sessions.filter((s) => s.l0 && s.l0.project === currentProject).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0))[0];
}

export function formatSessionStartOutput(index: MemoryIndex, currentProject: string): string {
   const catalog = generateCatalog(index);
   const hot = selectHotMemories(index, currentProject, 5);
   let output = `# Session Memory (auto-loaded)\n\n## Memory Catalog\n${catalog}\n`;

   // Показать failures и next_step из последней сессии проекта
   const lastSession = findLastSessionForProject(index, currentProject);
   if (lastSession?.l0) {
      const l0 = lastSession.l0;
      const hasContext = l0.failures?.length || l0.next_step || l0.git_status;
      if (hasContext) {
         output += `\n## Previous Session Context\n\n`;
         if (l0.next_step) {
            output += `**Next step:** ${l0.next_step}\n\n`;
         }
         if (l0.failures?.length) {
            output += `**What didn't work:**\n`;
            for (const f of l0.failures.slice(0, 5)) {
               output += `- ${f}\n`;
            }
            output += '\n';
         }
         if (l0.git_status) {
            output += `**Git status (at session end):**\n\`\`\`\n${l0.git_status}\n\`\`\`\n\n`;
         }
      }
   }

   const MAX_HOT_CONTENT_CHARS = 3000; // ~1000 tokens
   let hotContentLen = 0;
   if (hot.length > 0) {
      output += `\n## Hot Memories for ${currentProject || 'global'}\n\n`;
      for (const m of hot) {
         const chunk = `### ${m.name} (${m.category})\n${m.content || m.description || ''}\n\n`;
         if (hotContentLen + chunk.length > MAX_HOT_CONTENT_CHARS) break;
         output += chunk;
         hotContentLen += chunk.length;
      }
   }
   output += `\nTo load more: read files from ~/.claude/session-memory/memories/{category}/{name}.md\n`;
   return output;
}
