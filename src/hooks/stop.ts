#!/usr/bin/env node

/**
 * Hook script (Stop): saves current session metadata to session-index.json.
 * Also extracts L0 from session JSONL and writes to memory index.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';

// Determine package root — works from both src/ and ~/.claude/scripts/
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_SRC: string | null = existsSync(join(__dirname, '..', 'memory', 'extract-l0.js')) ? join(__dirname, '..') : null;

const SESSION_INDEX = join(homedir(), '.claude', 'session-index.json');

// Inline L0 extraction for running from ~/.claude/scripts/ (without access to memory modules)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;
const MAX_SUMMARY_LEN = 120;

/** L0 extraction result */
interface L0Result {
   summary: string;
   project: string;
   messageCount: number;
   files: string[];
   topics?: string[];
   timestamp?: number;
}

/** Message from JSONL */
interface JNSONLMessage {
   role: 'user' | 'assistant';
   content: string;
}

/** Content block */
interface ContentBlock {
   type: string;
   text?: string;
}

/** Event from a session JSONL file */
interface SessionEvent {
   type?: string;
   message?: {
      content: string | ContentBlock[];
   };
}

/** Parameters for saveSessionWithL0 */
interface SaveSessionParams {
   sessionId: string;
   project: string;
   indexPath: string;
   projectsDir: string;
   memoryDir?: string;
}

/** Session entry in unified index */
interface UnifiedSessionEntry {
   l0?: L0Result;
   l1_ready?: boolean;
   lastActive?: number;
   [key: string]: unknown;
}

/** Unified index */
interface UnifiedIndex {
   version?: number;
   sessions: Record<string, UnifiedSessionEntry>;
   memories: Record<string, unknown>;
}

/** Legacy session index */
interface LegacyIndexEntry {
   sessionId?: string;
   project?: string;
   lastActive?: number;
   summary?: string;
   [key: string]: unknown;
}

type LegacyIndex = Record<string, LegacyIndexEntry>;

/** Hook data */
interface HookData {
   session_id?: string;
   cwd?: string;
}

/** Extracts file paths from text */
function inlineExtractFilePaths(text: string): string[] {
   const matches = new Set<string>();
   for (const m of text.matchAll(FILE_PATH_RE)) {
      const path = m[1];
      if (path && (path.includes('/') || path.includes('.'))) matches.add(path);
   }
   return [...matches].filter((p) => !p.startsWith('http') && !p.startsWith('//'));
}

/** Extracts L0 data from JSONL lines */
function inlineExtractL0FromJSONL(lines: string[], project: string): L0Result {
   const messages: JNSONLMessage[] = [];
   for (const line of lines) {
      try {
         const event = JSON.parse(line) as SessionEvent;
         if (event.type === 'human' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
            messages.push({ role: 'user', content: text });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
            messages.push({ role: 'assistant', content: text });
         }
      } catch {
         // Skip invalid lines
      }
   }

   if (!messages.length) return { summary: '', project, messageCount: 0, files: [], topics: [] };

   const firstUser = messages.find((m) => m.role === 'user');
   const summary = firstUser ? firstUser.content.replace(/\n/g, ' ').trim().slice(0, MAX_SUMMARY_LEN) : '';

   const files = new Set<string>();
   for (const msg of messages) {
      const t = typeof msg.content === 'string' ? msg.content : '';
      for (const f of inlineExtractFilePaths(t)) files.add(f);
   }

   return { summary, project, messageCount: messages.length, files: [...files].slice(0, 20), timestamp: Date.now() };
}

/** Read unified index (inline version for standalone operation) */
function inlineReadIndex(indexPath: string): UnifiedIndex {
   try {
      if (existsSync(indexPath)) return JSON.parse(readFileSync(indexPath, 'utf8')) as UnifiedIndex;
   } catch {
      // File corrupted — return empty index
   }
   return { version: 1, sessions: {}, memories: {} };
}

/** Write unified index (inline version) */
function inlineWriteIndex(indexPath: string, index: UnifiedIndex): void {
   writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

/** Find session JSONL file in projects subdirectories */
function findSessionJSONL(projectsDir: string, sessionId: string): string | null {
   try {
      const dirs = readdirSync(projectsDir);
      for (const dir of dirs) {
         const jsonlPath = join(projectsDir, dir, sessionId + '.jsonl');
         if (existsSync(jsonlPath)) return jsonlPath;
      }
   } catch {
      // Directory doesn't exist or no access
   }
   return null;
}

/** Saves session with L0 extraction */
export function saveSessionWithL0({ sessionId, project, indexPath, projectsDir, memoryDir }: SaveSessionParams): void {
   const readIdx = inlineReadIndex;
   const writeIdx = inlineWriteIndex;
   const extractL0 = inlineExtractL0FromJSONL;

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

   // Сохраняем snapshot для восстановления если JSONL будет удалён
   if (jsonlPath) {
      try {
         import('../memory/snapshot.js')
            .then(({ saveSessionSnapshot }) => saveSessionSnapshot(sessionId, jsonlPath, project))
            .catch(() => {});
      } catch {
         /* snapshot не критичен */
      }
   }

   // Launch background L1 extraction (detached) — only if JSONL found and memoryDir set
   if (jsonlPath && memoryDir) {
      try {
         const extractScript = new URL('../memory/extract-l1.js', import.meta.url).pathname;
         if (existsSync(extractScript)) {
            const child = spawn(process.execPath, [extractScript, sessionId, project], {
               detached: true,
               stdio: 'ignore',
               env: { ...process.env, MEMORY_DIR: memoryDir },
            });
            child.unref();
         }
      } catch {
         // Script unavailable — skip L1
      }
   }
}

// Main hook execution — runs only when called as script (not import)
const isMain = process.argv[1] && (process.argv[1].endsWith('stop.js') || process.argv[1] === new URL(import.meta.url).pathname);

if (isMain) {
   let input = '';
   try {
      input = readFileSync(process.stdin.fd, 'utf8');
   } catch {
      process.exit(0);
   }

   let hookData: HookData;
   try {
      hookData = JSON.parse(input) as HookData;
   } catch {
      process.exit(0);
   }

   const sessionId = hookData.session_id || process.env.CLAUDE_SESSION_ID;
   const cwd = hookData.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();

   if (!sessionId) process.exit(0);

   // Write to legacy session-index.json (backward compatibility)
   let legacyIndex: LegacyIndex = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         legacyIndex = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as LegacyIndex;
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

   // Write to new memory index with L0 extraction
   let MEMORY_INDEX: string | undefined;
   let MEMORY_DIR: string | undefined;
   let PROJECTS_DIR: string | undefined;

   try {
      if (PKG_SRC) {
         const config = await import(join(PKG_SRC, 'core', 'config.js'));
         MEMORY_INDEX = config.MEMORY_INDEX as string;
         MEMORY_DIR = config.MEMORY_DIR as string;
         PROJECTS_DIR = config.PROJECTS_DIR as string;
      }
   } catch {
      // Package modules unavailable — use defaults
   }

   // Default values when running from ~/.claude/scripts/
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
