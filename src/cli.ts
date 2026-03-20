#!/usr/bin/env node

/**
 * claude-sessions — AI agent session manager CLI
 *
 * Usage:
 *   claude-sessions              — interactive TUI picker
 *   claude-sessions list         — text listing
 *   claude-sessions search <text> — content search
 *   claude-sessions summarize    — AI summaries for sessions
 *   claude-sessions delete <id>  — delete a session
 *   claude-sessions restore <id> — restore a session
 *   claude-sessions install      — install hooks and slash commands
 *   claude-sessions uninstall    — remove hooks and slash commands
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { t } from './core/i18n.js';
import { handleFatalError } from './core/errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
// Флаг --debug: показывать stack traces при ошибках
const debug = args.includes('--debug');
const filteredArgs = args.filter(a => a !== '--debug');
const command = filteredArgs[0];

try {

// Quick launch by number
if (command && /^\d+$/.test(command)) {
   const { default: picker } = await import('./commands/picker.js');
   await picker(['--quick', command]);
   process.exit(0);
}

switch (command) {
   case 'list':
   case 'ls': {
      const { default: list } = await import('./commands/list.js');
      await list(filteredArgs.slice(1));
      break;
   }

   case 'search':
   case 's': {
      const query = filteredArgs.slice(1).join(' ');
      if (!query) {
         process.stderr.write('Usage: claude-sessions search <text>\n');
         process.exit(1);
      }
      const { default: list } = await import('./commands/list.js');
      await list(['--search', query]);
      break;
   }

   case 'summarize':
   case 'sum': {
      const { default: summarize } = await import('./commands/summarize.js');
      await summarize(filteredArgs.slice(1));
      break;
   }

   case 'delete':
   case 'del':
   case 'rm': {
      const id = filteredArgs[1];
      if (!id) {
         process.stderr.write('Usage: claude-sessions delete <session-id>\n');
         process.exit(1);
      }
      const { default: deleteSession } = await import('./commands/delete.js');
      await deleteSession(id);
      break;
   }

   case 'restore': {
      const id = filteredArgs[1];
      if (!id) {
         process.stderr.write('Usage: claude-sessions restore <session-id>\n');
         process.exit(1);
      }
      const { default: restore } = await import('./commands/restore.js');
      await restore(id);
      break;
   }

   case 'install': {
      const { default: install } = await import('./commands/install.js');
      await install();
      break;
   }

   case 'uninstall': {
      const { default: uninstall } = await import('./commands/uninstall.js');
      await uninstall();
      break;
   }

   case 'memory-status':
   case 'ms': {
      const { default: memoryStatus } = await import('./commands/memory-status.js');
      await memoryStatus();
      break;
   }

   case 'mcp-server':
   case 'mcp': {
      const { startMcpServer } = await import('./mcp/server.js');
      await startMcpServer();
      break;
   }

   case 'memory-search': {
      if (!filteredArgs[1]) {
         process.stderr.write('Usage: claude-sessions memory-search <query>\n');
         process.exit(1);
      }
      const { default: memorySearch } = await import('./commands/memory-search.js');
      await memorySearch(filteredArgs.slice(1).join(' '));
      break;
   }

   case 'extract-memory': {
      const { readIndex } = await import('./memory/index.js');
      const { MEMORY_INDEX, PROJECTS_DIR } = await import('./core/config.js');
      const { checkPendingExtractions } = await import('./sessions/loader.js');

      const index = readIndex(MEMORY_INDEX);
      const extractScript = join(__dirname, 'memory', 'extract-l1.js');
      // Type cast: MemoryIndex is structurally compatible with UnifiedIndex
      const unifiedIndex = index as unknown as Parameters<typeof checkPendingExtractions>[0];

      let sessionIds: string[];
      if (filteredArgs.includes('--all')) {
         sessionIds = checkPendingExtractions(unifiedIndex);
      } else if (filteredArgs[1] && !filteredArgs[1].startsWith('-')) {
         sessionIds = [filteredArgs[1]];
      } else {
         sessionIds = checkPendingExtractions(unifiedIndex).slice(0, 5);
      }

      if (sessionIds.length === 0) {
         console.log('✅ No sessions pending L1 extraction.');
         break;
      }

      console.log(`Extracting memories from ${sessionIds.length} sessions...\n`);
      let success = 0;
      let failed = 0;
      for (const sid of sessionIds) {
         const sessionMeta = index.sessions[sid];
         const project = sessionMeta?.project || sessionMeta?.l0?.project || '';
         process.stdout.write(`  ${sid.slice(0, 8)}... `);
         const proc = spawnSync(process.execPath, [extractScript, sid, project], {
            encoding: 'utf8',
            timeout: 120_000,
            env: { ...process.env, MEMORY_DIR: join(MEMORY_INDEX, '..'), PROJECTS_DIR },
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

   case 'cleanup': {
      const { default: cleanup } = await import('./commands/cleanup.js');
      await cleanup(args.slice(1));
      break;
   }

   case 'enable-memory': {
      const { enableMemory } = await import('./commands/enable-memory.js');
      const { SETTINGS_FILE, CLAUDE_DIR } = await import('./core/config.js');
      enableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md'), scriptsDir: __dirname });
      console.log(t('memoryEnabled'));
      break;
   }

   case 'disable-memory': {
      const { disableMemory } = await import('./commands/disable-memory.js');
      const { SETTINGS_FILE, CLAUDE_DIR } = await import('./core/config.js');
      disableMemory({ settingsPath: SETTINGS_FILE, claudeMdPath: join(CLAUDE_DIR, 'CLAUDE.md') });
      console.log(t('memoryDisabled'));
      break;
   }

   case 'help':
   case '--help':
   case '-h': {
      console.log(`
claude-sessions — AI agent session manager

Commands:
  (no arguments)       Interactive TUI picker
  <number>             Quick launch session by number
  list [options]       Text listing of sessions
  search <text>        Search by content
  summarize            Generate AI summaries
  delete <id>          Delete a session
  restore <id>         Restore a session from JSONL
  cleanup              Remove orphaned sessions from index
  install              Install slash commands and hooks
  uninstall            Remove slash commands and hooks
  memory-status (ms)   Memory system status
  memory-search <q>    Search memories
  extract-memory       Run memory extraction
  mcp-server (mcp)     MCP server for memory system
  enable-memory        Enable memory integration
  disable-memory       Disable memory integration

Options for list:
  --project <name>     Filter by project
  --search <text>      Search by content
  --limit <N>          Count (default 20)
  --all                Show all

TUI picker keys:
  Up/Down     Navigation (cyclic)
  Tab         Filter by agent
  Type text   Instant search
  Enter       Open session
  Ctrl-D      Delete session
  Ctrl-H      Toggle orphaned sessions
  Ctrl-A      AI summary
  Ctrl-R      Refresh list
  Esc         Exit

Aliases: cs = claude-sessions
`);
      break;
   }

   default: {
      // Default — interactive picker
      const { default: picker } = await import('./commands/picker.js');
      const pickerArgs = command ? ['--' + command, ...filteredArgs.slice(1)] : filteredArgs;
      await picker(pickerArgs.filter(Boolean));
      break;
   }
}

} catch (err) {
   handleFatalError(err, debug);
}
