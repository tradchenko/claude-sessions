export function generateCatalog(index) {
   const entries = Object.values(index.memories || {})
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0));
   if (entries.length === 0) return '(no memories yet)';
   const MAX_CATALOG_ENTRIES = 30; // ~200 tokens for 30 rows
   const limited = entries.slice(0, MAX_CATALOG_ENTRIES);
   const lines = ['| name | category | hotness | description |', '|------|----------|---------|-------------|'];
   for (const m of limited) {
      lines.push(`| ${m.name} | ${m.category} | ${(m.hotness || 0).toFixed(2)} | ${(m.description || '').slice(0, 50)} |`);
   }
   return lines.join('\n');
}

export function selectHotMemories(index, currentProject, count = 5) {
   return Object.values(index.memories || {})
      .filter(m => !currentProject || (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, count);
}

export function formatSessionStartOutput(index, currentProject) {
   const catalog = generateCatalog(index);
   const hot = selectHotMemories(index, currentProject, 5);
   let output = `# Session Memory (auto-loaded)\n\n## Memory Catalog\n${catalog}\n`;
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
