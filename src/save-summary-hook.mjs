#!/usr/bin/env node

/**
 * Сохраняет AI-резюме сессии в session-index.json.
 * Использование: node save-summary.mjs --session ID --summary "текст"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

const args = process.argv.slice(2);
let sessionId = null;
let summary = null;

for (let i = 0; i < args.length; i++) {
   if (args[i] === '--session' && args[i + 1]) {
      sessionId = args[i + 1];
      i++;
   } else if (args[i] === '--summary' && args[i + 1]) {
      summary = args[i + 1];
      i++;
   }
}

if (!sessionId || !summary) {
   console.error('Использование: node save-summary.mjs --session ID --summary "текст"');
   process.exit(1);
}

let index = {};
if (existsSync(SESSION_INDEX)) {
   try {
      index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
   } catch {
      index = {};
   }
}

// Поиск полного ID по короткому
if (sessionId.length < 36) {
   const fullId = Object.keys(index).find((k) => k.startsWith(sessionId));
   if (fullId) sessionId = fullId;
}

const existing = index[sessionId] || {};
index[sessionId] = {
   ...existing,
   sessionId,
   summary,
   summarizedAt: Date.now(),
   lastActive: existing.lastActive || Date.now(),
};

const entries = Object.entries(index);
if (entries.length > 200) {
   entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
   index = Object.fromEntries(entries.slice(0, 200));
}

writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
console.log(`✅ Резюме сохранено: [${sessionId.slice(0, 8)}] ${summary}`);
