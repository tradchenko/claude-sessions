#!/usr/bin/env node

/**
 * claude-sessions — CLI for managing Claude Code sessions
 *
 * Usage:
 *   claude-sessions              — interactive TUI picker
 *   claude-sessions list         — text list
 *   claude-sessions search <text> — search by content
 *   claude-sessions summarize    — AI summaries for sessions without description
 *   claude-sessions delete <id>  — delete session
 *   claude-sessions restore <id> — restore unavailable session
 *   claude-sessions install      — install slash commands and hooks
 *   claude-sessions uninstall    — remove slash commands and hooks
 */

import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'src');

const args = process.argv.slice(2);
const command = args[0];

// If the first argument is a number, it's a quick pick
if (/^\d+$/.test(command)) {
   const { default: picker } = await import(resolve(srcDir, 'picker.mjs'));
   await picker(['--quick', command]);
   process.exit(0);
}

switch (command) {
   case 'list':
   case 'ls': {
      const { default: list } = await import(resolve(srcDir, 'list.mjs'));
      await list(args.slice(1));
      break;
   }

   case 'search':
   case 's': {
      const query = args.slice(1).join(' ');
      if (!query) {
         console.error('Usage: claude-sessions search <text>');
         process.exit(1);
      }
      const { default: list } = await import(resolve(srcDir, 'list.mjs'));
      await list(['--search', query]);
      break;
   }

   case 'summarize':
   case 'sum': {
      const { default: summarize } = await import(resolve(srcDir, 'summarize.mjs'));
      await summarize(args.slice(1));
      break;
   }

   case 'delete':
   case 'del':
   case 'rm': {
      const id = args[1];
      if (!id) {
         console.error('Usage: claude-sessions delete <session-id>');
         process.exit(1);
      }
      const { default: deleteSession } = await import(resolve(srcDir, 'delete.mjs'));
      await deleteSession(id);
      break;
   }

   case 'restore': {
      const id = args[1];
      if (!id) {
         console.error('Usage: claude-sessions restore <session-id>');
         process.exit(1);
      }
      const { default: restore } = await import(resolve(srcDir, 'restore.mjs'));
      await restore(id);
      break;
   }

   case 'install': {
      const { default: install } = await import(resolve(srcDir, 'install.mjs'));
      await install(args.slice(1));
      break;
   }

   case 'uninstall': {
      const { default: uninstall } = await import(resolve(srcDir, 'uninstall.mjs'));
      await uninstall();
      break;
   }

   case 'memory-status':
   case 'ms': {
      const { default: memoryStatus } = await import(join(srcDir, 'memory-status.mjs'));
      await memoryStatus();
      break;
   }

   case 'memory-search': {
      if (!args[1]) {
         console.error('Usage: claude-sessions memory-search <query>');
         process.exit(1);
      }
      const { default: memorySearch } = await import(join(srcDir, 'memory-search.mjs'));
      await memorySearch(args.slice(1).join(' '));
      break;
   }

   case 'extract-memory': {
      const { readIndex } = await import(join(srcDir, 'memory', 'index.mjs'));
      const { MEMORY_INDEX, PROJECTS_DIR: projDir } = await import(join(srcDir, 'config.mjs'));
      const { checkPendingExtractions } = await import(join(srcDir, 'sessions.mjs'));
      const { spawnSync } = await import('child_process');

      const index = readIndex(MEMORY_INDEX);
      const extractScript = join(srcDir, 'memory', 'extract-l1.mjs');

      let sessionIds;
      if (args.includes('--all')) {
         sessionIds = checkPendingExtractions(index);
      } else if (args[0] && !args[0].startsWith('-')) {
         sessionIds = [args[0]];
      } else {
         sessionIds = checkPendingExtractions(index).slice(0, 5);
      }

      if (sessionIds.length === 0) {
         console.log('✅ No sessions pending L1 extraction.');
         break;
      }

      console.log(`Extracting memories from ${sessionIds.length} sessions...\n`);
      let success = 0;
      let failed = 0;
      for (const sid of sessionIds) {
         const project = index.sessions[sid]?.project || index.sessions[sid]?.l0?.project || '';
         process.stdout.write(`  ${sid.slice(0, 8)}... `);
         const proc = spawnSync(process.execPath, [extractScript, sid, project], {
            encoding: 'utf8',
            timeout: 120_000,
            env: { ...process.env, MEMORY_DIR: join(MEMORY_INDEX, '..'), PROJECTS_DIR: projDir },
         });
         if (proc.status === 0) {
            console.log('✅');
            success++;
         } else {
            console.log('❌');
            failed++;
         }
      }
      console.log(`\nDone: ${success} extracted, ${failed} failed.`);
      break;
   }

   case 'enable-memory': {
      const { enableMemory } = await import(join(srcDir, 'enable-memory.mjs'));
      const { SETTINGS_FILE, CLAUDE_DIR } = await import(join(srcDir, 'config.mjs'));
      enableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md'), scriptsDir: srcDir });
      console.log('Memory integration enabled.');
      break;
   }

   case 'disable-memory': {
      const { disableMemory } = await import(join(srcDir, 'disable-memory.mjs'));
      const { SETTINGS_FILE, CLAUDE_DIR } = await import(join(srcDir, 'config.mjs'));
      disableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md') });
      console.log('Memory integration disabled.');
      break;
   }

   case 'help':
   case '--help':
   case '-h': {
      console.log(`
claude-sessions — Claude Code Session Manager

Commands:
  (no arguments)       Interactive TUI picker
  <number>             Quick launch session by number
  list [options]       Text list of sessions
  search <text>        Search by session content
  summarize            AI summary generation
  delete <id>          Delete session
  restore <id>         Restore session from JSONL
  install              Install slash commands and hooks
  uninstall            Remove slash commands and hooks
  memory-status (ms)   Show memory system status
  memory-search <q>    Search memories by keyword
  extract-memory       Trigger memory extraction
  enable-memory        Enable Claude memory integration
  disable-memory       Disable Claude memory integration

Options for list:
  --project <name>     Filter by project
  --search <text>      Search by content
  --limit <N>          Count (default 20)
  --all                Show all

TUI picker (keys):
  ↑↓          Navigate (wraps around)
  Type text   Instant search
  Enter       Open session
  Ctrl-D      Delete session
  Ctrl-A      AI summary
  Ctrl-R      Refresh list
  Esc         Quit

Aliases: cs = claude-sessions
`);
      break;
   }

   default: {
      // Default — interactive picker
      const { default: picker } = await import(resolve(srcDir, 'picker.mjs'));
      const pickerArgs = command ? ['--' + command, ...args.slice(1)] : args;
      await picker(pickerArgs.filter(Boolean));
      break;
   }
}
