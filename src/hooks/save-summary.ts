#!/usr/bin/env node

/**
 * Saves AI summary for a session to session-index.json.
 * Usage: node save-summary.ts --session ID --summary "text"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { t } from '../core/i18n.js';

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

/** Session index entry */
interface SessionEntry {
   sessionId?: string;
   summary?: string;
   summarizedAt?: number;
   lastActive?: number;
   [key: string]: unknown;
}

type SessionIndex = Record<string, SessionEntry>;

// Parse command line arguments
const args = process.argv.slice(2);
let sessionId: string | null = null;
let summary: string | null = null;

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
   console.error(t('saveSummaryUsage'));
   process.exit(1);
}

let index: SessionIndex = {};
if (existsSync(SESSION_INDEX)) {
   try {
      index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as SessionIndex;
   } catch {
      index = {};
   }
}

// Find full ID by short prefix
if (sessionId.length < 36) {
   const fullId = Object.keys(index).find((k) => k.startsWith(sessionId!));
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

// Limit to 200 entries
const entries = Object.entries(index);
if (entries.length > 200) {
   entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
   index = Object.fromEntries(entries.slice(0, 200));
}

writeFileSync(SESSION_INDEX, JSON.stringify(index, null, 2));
console.log('\u2705 ' + t('summarySaved', sessionId.slice(0, 8), summary));
