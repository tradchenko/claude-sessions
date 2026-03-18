#!/usr/bin/env node
// SessionStart hook: outputs memory catalog + hot memories to stdout
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { formatSessionStartOutput } from './memory/catalog.mjs';
import { readIndex } from './memory/index.mjs';
import { recalculateAll } from './memory/hotness.mjs';

try {
   let input = '';
   try { input = readFileSync(process.stdin.fd, 'utf8'); } catch {}
   let project = '';
   try {
      const hookData = JSON.parse(input);
      project = hookData.cwd || hookData.project || '';
   } catch {}

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
