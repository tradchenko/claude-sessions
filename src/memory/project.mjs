/**
 * Projects hot memories into Claude's native memory format
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'sm-'; // session-memory prefix to identify projected files

export function projectToNativeFormat(index, currentProject, nativeMemoryDir) {
   mkdirSync(nativeMemoryDir, { recursive: true });

   // Clean old projected files
   try {
      const existing = readdirSync(nativeMemoryDir).filter(f => f.startsWith(PREFIX));
      for (const f of existing) unlinkSync(join(nativeMemoryDir, f));
   } catch {}

   // Project top hot memories for this project
   const memories = Object.values(index.memories || {})
      .filter(m => (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, 10);

   for (const m of memories) {
      const fileName = `${PREFIX}${m.category}-${m.name}.md`;
      const content = `---\nname: ${m.name}\ndescription: ${(m.description || '').replace(/\n/g, ' ')}\ntype: ${m.category}\n---\n\n${m.content || ''}`;
      writeFileSync(join(nativeMemoryDir, fileName), content);
   }

   return memories.length;
}
