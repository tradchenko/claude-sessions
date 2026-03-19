#!/usr/bin/env node

/**
 * Generate a demo screenshot with fake session data for README.
 * Creates a mock environment and renders the list command output.
 * Usage: node scripts/demo-screenshot.mjs > screenshot.txt
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const MOCK_DIR = join(tmpdir(), `cs-demo-${Date.now()}`);
const MOCK_CLAUDE = join(MOCK_DIR, '.claude');
const MOCK_CODEX = join(MOCK_DIR, '.codex');
const MOCK_QWEN = join(MOCK_DIR, '.qwen');
const MOCK_GEMINI = join(MOCK_DIR, '.gemini');
const MOCK_COMPANION = join(MOCK_DIR, '.companion');

// Create directories
for (const d of [
   join(MOCK_CLAUDE, 'commands'),
   join(MOCK_CLAUDE, 'scripts'),
   join(MOCK_CLAUDE, 'sessions'),
   join(MOCK_CLAUDE, 'session-memory'),
   MOCK_CODEX,
   join(MOCK_QWEN, 'projects', '-demo-webapp', 'chats'),
   join(MOCK_QWEN, 'projects', '-demo-api-server', 'chats'),
   join(MOCK_GEMINI, 'history', 'webapp', '.git'),
   join(MOCK_GEMINI, 'history', 'mobile-app', '.git'),
   join(MOCK_COMPANION, 'recordings'),
]) mkdirSync(d, { recursive: true });

// Settings
writeFileSync(join(MOCK_CLAUDE, 'settings.json'), JSON.stringify({ hooks: {} }));
writeFileSync(join(MOCK_CLAUDE, 'session-memory', 'index.json'), JSON.stringify({ version: 1, sessions: {}, memories: {} }));

const now = Date.now();
const hour = 3600000;
const day = 86400000;

// Claude sessions
const claudeSessions = [
   { sessionId: 'a1b2c3d4-1111-2222-3333-444455556666', project: '/Users/demo/webapp', display: 'Fix authentication middleware — JWT token refresh', timestamp: now - hour * 1 },
   { sessionId: 'a1b2c3d4-1111-2222-3333-444455556666', project: '/Users/demo/webapp', display: 'Also update the session store', timestamp: now - hour * 0.5 },
   { sessionId: 'b2c3d4e5-2222-3333-4444-555566667777', project: '/Users/demo/webapp', display: 'Implement dark mode toggle with CSS variables', timestamp: now - hour * 3 },
   { sessionId: 'c3d4e5f6-3333-4444-5555-666677778888', project: '/Users/demo/api-server', display: 'Add rate limiting to /api/v2 endpoints', timestamp: now - hour * 6 },
   { sessionId: 'd4e5f6a7-4444-5555-6666-777788889999', project: '/Users/demo/webapp', display: 'Refactor useAuth hook — extract token logic', timestamp: now - day * 1 },
   { sessionId: 'e5f6a7b8-5555-6666-7777-888899990000', project: '/Users/demo/mobile-app', display: 'Setup React Native navigation stack', timestamp: now - day * 1.5 },
   { sessionId: 'f6a7b8c9-6666-7777-8888-999900001111', project: '/Users/demo/api-server', display: 'Database migration: add user_preferences table', timestamp: now - day * 2 },
   { sessionId: 'a7b8c9d0-7777-8888-9999-000011112222', project: '/Users/demo/webapp', display: 'Fix SSR hydration mismatch on /profile page', timestamp: now - day * 3 },
];

// Codex sessions
const codexSessions = [
   { session_id: '019abc01-1111-2222-3333-444455556666', ts: (now - hour * 4) / 1000, text: 'Optimize database queries for dashboard analytics' },
   { session_id: '019abc01-1111-2222-3333-444455556666', ts: (now - hour * 3.5) / 1000, text: 'Also add indexes for the new columns' },
   { session_id: '019abc02-2222-3333-4444-555566667777', ts: (now - day * 2) / 1000, text: 'Configure CI/CD pipeline for staging environment' },
];

// Qwen sessions (per-project chats)
const qwenChat1 = [
   JSON.stringify({ sessionId: 'qwen-sess-001', timestamp: new Date(now - hour * 2).toISOString(), type: 'user', cwd: '/Users/demo/webapp', message: { role: 'user', parts: [{ text: 'Review PR #142 — payment integration refactor' }] } }),
].join('\n');

const qwenChat2 = [
   JSON.stringify({ sessionId: 'qwen-sess-002', timestamp: new Date(now - day * 1).toISOString(), type: 'user', cwd: '/Users/demo/api-server', message: { role: 'user', parts: [{ text: 'Write unit tests for OrderService.processRefund()' }] } }),
].join('\n');

// Companion recordings
const companionRec1 = JSON.stringify({ _header: true, version: 1, session_id: 'comp-sess-001', backend_type: 'acp', started_at: now - hour * 5, cwd: '/Users/demo/webapp' });
const companionRec2 = JSON.stringify({ _header: true, version: 1, session_id: 'comp-sess-002', backend_type: 'acp', started_at: now - day * 1.2, cwd: '/Users/demo/mobile-app' });

// Gemini git repos (just need HEAD with timestamp)
for (const proj of ['webapp', 'mobile-app']) {
   execSync(`cd ${join(MOCK_GEMINI, 'history', proj)} && git init && git commit --allow-empty -m "session" 2>/dev/null`, { stdio: 'ignore' });
}

// Write mock data
writeFileSync(join(MOCK_CLAUDE, 'history.jsonl'), claudeSessions.map(s => JSON.stringify(s)).join('\n') + '\n');
writeFileSync(join(MOCK_CODEX, 'history.jsonl'), codexSessions.map(s => JSON.stringify(s)).join('\n') + '\n');
writeFileSync(join(MOCK_QWEN, 'projects', '-demo-webapp', 'chats', 'qwen-sess-001.jsonl'), qwenChat1 + '\n');
writeFileSync(join(MOCK_QWEN, 'projects', '-demo-api-server', 'chats', 'qwen-sess-002.jsonl'), qwenChat2 + '\n');
writeFileSync(join(MOCK_COMPANION, 'recordings', 'comp-sess-001_acp_demo.jsonl'), companionRec1 + '\n');
writeFileSync(join(MOCK_COMPANION, 'recordings', 'comp-sess-002_acp_demo.jsonl'), companionRec2 + '\n');
writeFileSync(join(MOCK_COMPANION, 'session-names.json'), JSON.stringify({
   'comp-sess-001': 'Claude auth debugging',
   'comp-sess-002': 'Claude mobile layout fixes',
}));

// Run list command with mock HOME
const output = execSync(`HOME="${MOCK_DIR}" CLAUDE_SESSIONS_LANG=en node ${join(PKG_ROOT, 'dist', 'cli.js')} list --limit 15`, {
   encoding: 'utf8',
   env: { ...process.env, HOME: MOCK_DIR, CLAUDE_SESSIONS_LANG: 'en' },
});

console.log(output);

// Cleanup
execSync(`rm -rf "${MOCK_DIR}"`);
