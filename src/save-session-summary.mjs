#!/usr/bin/env node

/**
 * Hook script (Stop): saves current session metadata to session-index.json.
 * Also extracts L0 from the session JSONL and writes it to the memory index.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'node:child_process';
import { extractL0FromJSONL } from './memory/extract-l0.mjs';
import { readIndex, writeIndex } from './memory/index.mjs';

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

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
   const index = readIndex(indexPath);
   if (!index.sessions) index.sessions = {};

   const jsonlPath = findSessionJSONL(projectsDir, sessionId);
   if (jsonlPath) {
      const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).slice(-50);
      const l0 = extractL0FromJSONL(lines, project);
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

   writeIndex(indexPath, index);

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
   const { MEMORY_INDEX, MEMORY_DIR, PROJECTS_DIR } = await import('./config.mjs');
   saveSessionWithL0({
      sessionId,
      project: cwd,
      indexPath: MEMORY_INDEX,
      projectsDir: PROJECTS_DIR,
      memoryDir: MEMORY_DIR,
   });
}
