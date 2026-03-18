import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export function disableMemory({ settingsPath, claudeMdPath }) {
   // Remove SessionStart hook
   if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      if (settings.hooks?.SessionStart) {
         settings.hooks.SessionStart = settings.hooks.SessionStart
            .filter(h => !JSON.stringify(h).includes('session-start-hook'));
      }
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
   }

   // Remove Session Memory System section from CLAUDE.md
   if (existsSync(claudeMdPath)) {
      let md = readFileSync(claudeMdPath, 'utf8');
      const marker = '# Session Memory System';
      const idx = md.indexOf(marker);
      if (idx !== -1) {
         const nextHeading = md.indexOf('\n# ', idx + marker.length);
         md = md.slice(0, idx).trimEnd() + (nextHeading !== -1 ? md.slice(nextHeading) : '');
         writeFileSync(claudeMdPath, md);
      }
   }
}
