#!/usr/bin/env node

/**
 * Hook script (Stop): saves current session metadata to session-index.json.
 * Also extracts L0 from the session JSONL and writes it to the memory index.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';

// Resolve package root — works both from src/ and from ~/.claude/scripts/
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_SRC = existsSync(join(__dirname, 'memory', 'extract-l0.mjs'))
   ? __dirname
   : null;

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

// Inline L0 extraction for when running from ~/.claude/scripts/ (no access to memory modules)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;
const MAX_SUMMARY_LEN = 120;

function inlineExtractFilePaths(text) {
   const matches = new Set();
   for (const m of text.matchAll(FILE_PATH_RE)) {
      const path = m[1];
      if (path.includes('/') || path.includes('.')) matches.add(path);
   }
   return [...matches].filter(p => !p.startsWith('http') && !p.startsWith('//'));
}

function inlineExtractL0FromJSONL(lines, project) {
   const messages = [];
   for (const line of lines) {
      try {
         const event = JSON.parse(line);
         if (event.type === 'human' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'user', content: text });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'assistant', content: text });
         }
      } catch {}
   }
   if (!messages.length) return { summary: '', project, messageCount: 0, files: [], topics: [] };
   const firstUser = messages.find(m => m.role === 'user');
   const summary = firstUser
      ? firstUser.content.replace(/\n/g, ' ').trim().slice(0, MAX_SUMMARY_LEN)
      : '';
   const files = new Set();
   for (const msg of messages) {
      const t = typeof msg.content === 'string' ? msg.content : '';
      for (const f of inlineExtractFilePaths(t)) files.add(f);
   }
   return { summary, project, messageCount: messages.length, files: [...files].slice(0, 20), timestamp: Date.now() };
}

// Inline index read/write for standalone execution
function inlineReadIndex(indexPath) {
   try {
      if (existsSync(indexPath)) return JSON.parse(readFileSync(indexPath, 'utf8'));
   } catch {}
   return { version: 1, sessions: {}, memories: {} };
}

function inlineWriteIndex(indexPath, index) {
   writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

function findSessionJSONL(projectsDir, sessionId) {
   // Search all subdirs of projectsDir for sessionId.jsonl
   try {
      const dirs = readdirSync(projectsDir);
      for (const dir of dirs) {
         const jsonlPath = join(projectsDir, dir, sessionId + '.jsonl');
         if (existsSync(jsonlPath)) return jsonlPath;
      }
   } catch {}
   return null;
}

export function saveSessionWithL0({ sessionId, project, indexPath, projectsDir, memoryDir }) {
   // Use package modules if available, otherwise use inline versions
   let readIdx = inlineReadIndex;
   let writeIdx = inlineWriteIndex;
   let extractL0 = inlineExtractL0FromJSONL;

   if (PKG_SRC) {
      try {
         // Dynamic imports would be async; for sync operation use inline versions
         // The inline versions are functionally identical to the module versions
      } catch {}
   }

   const index = readIdx(indexPath);
   if (!index.sessions) index.sessions = {};

   const jsonlPath = findSessionJSONL(projectsDir, sessionId);
   if (jsonlPath) {
      const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).slice(-50);
      const l0 = extractL0(lines, project);
      index.sessions[sessionId] = {
         ...index.sessions[sessionId],
         l0,
         l1_ready: false,
         lastActive: Date.now(),
      };
   } else {
      index.sessions[sessionId] = {
         ...index.sessions[sessionId],
         lastActive: Date.now(),
      };
   }

   writeIdx(indexPath, index);

   // Spawn background L1 extraction (detached) — only if JSONL found and memoryDir provided
   if (jsonlPath && memoryDir) {
      try {
         const extractScript = new URL('./memory/extract-l1.mjs', import.meta.url).pathname;
         if (existsSync(extractScript)) {
            const child = spawn(process.execPath, [extractScript, sessionId, project], {
               detached: true,
               stdio: 'ignore',
               env: { ...process.env, MEMORY_DIR: memoryDir },
            });
            child.unref();
         }
      } catch {}
   }
}

// Main hook execution — only runs when invoked as a script (not imported)
// Check if this module is the entry point
const isMain = process.argv[1] && (
   process.argv[1].endsWith('save-session-summary.mjs') ||
   process.argv[1] === new URL(import.meta.url).pathname
);

if (isMain) {
   let input = '';
   try {
      // /dev/stdin doesn't work on Windows, using fd 0
      input = readFileSync(process.stdin.fd, 'utf8');
   } catch {
      process.exit(0);
   }

   let hookData;
   try {
      hookData = JSON.parse(input);
   } catch {
      process.exit(0);
   }

   const sessionId = hookData.session_id || process.env.CLAUDE_SESSION_ID;
   const cwd = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

   if (!sessionId) process.exit(0);

   // Existing session-index.json write (backwards compatibility)
   let legacyIndex = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         legacyIndex = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
      } catch {
         legacyIndex = {};
      }
   }

   const existing = legacyIndex[sessionId] || {};
   legacyIndex[sessionId] = {
      ...existing,
      sessionId,
      project: cwd,
      lastActive: Date.now(),
   };

   const entries = Object.entries(legacyIndex);
   if (entries.length > 200) {
      entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
      legacyIndex = Object.fromEntries(entries.slice(0, 200));
   }

   writeFileSync(SESSION_INDEX, JSON.stringify(legacyIndex, null, 2));

   // New memory index write with L0 extraction
   // Resolve config — use package modules if available, otherwise use defaults
   let MEMORY_INDEX, MEMORY_DIR, PROJECTS_DIR;
   try {
      if (PKG_SRC) {
         const config = await import(join(PKG_SRC, 'config.mjs'));
         MEMORY_INDEX = config.MEMORY_INDEX;
         MEMORY_DIR = config.MEMORY_DIR;
         PROJECTS_DIR = config.PROJECTS_DIR;
      }
   } catch {}
   // Fallback defaults when running from ~/.claude/scripts/
   const claudeDir = join(homedir(), '.claude');
   MEMORY_INDEX = MEMORY_INDEX || join(claudeDir, 'session-memory', 'index.json');
   MEMORY_DIR = MEMORY_DIR || join(claudeDir, 'session-memory');
   PROJECTS_DIR = PROJECTS_DIR || join(claudeDir, 'projects');

   saveSessionWithL0({
      sessionId,
      project: cwd,
      indexPath: MEMORY_INDEX,
      projectsDir: PROJECTS_DIR,
      memoryDir: MEMORY_DIR,
   });
}
