import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CLAUDE_MD_SECTION = `
# Session Memory System
You have a structured memory system at \`~/.claude/session-memory/\`.
A catalog and hot memories are loaded at session start.
If you need more context, read specific memory files via Read tool.
Path: \`~/.claude/session-memory/memories/{category}/{name}.md\`
Do not modify these files directly — they are managed by claude-sessions.
`;

const MEMORY_MARKER = '# Session Memory System';

export function enableMemory({ settingsPath, claudeMdPath, scriptsDir }) {
   // Add SessionStart hook to settings.json
   const settings = existsSync(settingsPath)
      ? JSON.parse(readFileSync(settingsPath, 'utf8'))
      : {};
   if (!settings.hooks) settings.hooks = {};
   if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

   const hookCmd = `node ${join(scriptsDir, 'session-start-hook.mjs')}`;
   const exists = settings.hooks.SessionStart.some(h =>
      JSON.stringify(h).includes('session-start-hook')
   );
   if (!exists) {
      settings.hooks.SessionStart.push({
         type: 'command',
         command: hookCmd,
      });
   }
   writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

   // Add to CLAUDE.md
   const claudeMd = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
   if (!claudeMd.includes(MEMORY_MARKER)) {
      writeFileSync(claudeMdPath, claudeMd + '\n' + CLAUDE_MD_SECTION);
   }
}
