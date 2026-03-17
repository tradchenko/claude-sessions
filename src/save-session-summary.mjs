#!/usr/bin/env node

/**
 * Hook-скрипт (Stop): сохраняет метаданные текущей сессии в session-index.json.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

let input = '';
try {
   input = readFileSync('/dev/stdin', 'utf8');
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

let index = {};
if (existsSync(SESSION_INDEX)) {
   try {
      index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
   } catch {
      index = {};
   }
}

const existing = index[sessionId] || {};
index[sessionId] = {
   ...existing,
   sessionId,
   project: cwd,
   lastActive: Date.now(),
};

const entries = Object.entries(index);
if (entries.length > 200) {
   entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
   index = Object.fromEntries(entries.slice(0, 200));
}

writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
