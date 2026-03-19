// Project hot memories into Claude's native format
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { MemoryIndex } from './types.js';

const PREFIX = 'sm-'; // session-memory prefix for identifying projected files

export function projectToNativeFormat(index: MemoryIndex, currentProject: string, nativeMemoryDir: string): number {
   mkdirSync(nativeMemoryDir, { recursive: true });

   // Clean up old projected files
   try {
      const existing = readdirSync(nativeMemoryDir).filter((f) => f.startsWith(PREFIX));
      for (const f of existing) unlinkSync(join(nativeMemoryDir, f));
   } catch {
      // Directory may not exist
   }

   // Project top hot memories for the current project
   const memories = Object.values(index.memories || {})
      .filter((m) => (m.projects || []).includes(currentProject) || (m.projects || []).length === 0)
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0))
      .slice(0, 10);

   for (const m of memories) {
      const fileName = `${PREFIX}${m.category}-${m.name}.md`;
      const content = `---\nname: ${m.name}\ndescription: ${(m.description || '').replace(/\n/g, ' ')}\ntype: ${m.category}\n---\n\n${m.content || ''}`;
      writeFileSync(join(nativeMemoryDir, fileName), content);
   }

   return memories.length;
}
