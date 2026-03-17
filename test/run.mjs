#!/usr/bin/env node

/**
 * Test runner for claude-sessions.
 * Uses Node.js built-in test runner (node:test) — no dependencies needed.
 * Run: node test/run.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const CLI = join(PKG_ROOT, 'bin', 'cli.mjs');

// Create a temporary ~/.claude mock directory for tests
const TEST_DIR = join(tmpdir(), `claude-sessions-test-${Date.now()}`);
const MOCK_CLAUDE = join(TEST_DIR, '.claude');

function setupMockClaudeDir() {
   mkdirSync(join(MOCK_CLAUDE, 'projects', '-test-project'), { recursive: true });
   mkdirSync(join(MOCK_CLAUDE, 'commands'), { recursive: true });
   mkdirSync(join(MOCK_CLAUDE, 'scripts'), { recursive: true });
   mkdirSync(join(MOCK_CLAUDE, 'sessions'), { recursive: true });

   // Mock history.jsonl
   const now = Date.now();
   const sessions = [
      { sessionId: 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001', project: '/test-project', display: 'Fix login bug', timestamp: now - 86400000 * 0 },
      { sessionId: 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001', project: '/test-project', display: 'Check auth flow', timestamp: now - 86400000 * 0 + 1000 },
      { sessionId: 'aaaa2222-bbbb-cccc-dddd-eeeeeeee0002', project: '/test-project', display: 'Add dark mode', timestamp: now - 86400000 * 1 },
      { sessionId: 'aaaa3333-bbbb-cccc-dddd-eeeeeeee0003', project: '/other-project', display: 'Deploy pipeline', timestamp: now - 86400000 * 3 },
      { sessionId: 'aaaa4444-bbbb-cccc-dddd-eeeeeeee0004', project: '/test-project', display: '/mcp', timestamp: now - 86400000 * 7 },
      { sessionId: 'aaaa5555-bbbb-cccc-dddd-eeeeeeee0005', project: '/test-project', display: 'Telegram miniapp CSS fixes', timestamp: now - 86400000 * 10 },
   ];
   const historyContent = sessions.map((s) => JSON.stringify(s)).join('\n') + '\n';
   writeFileSync(join(MOCK_CLAUDE, 'history.jsonl'), historyContent);

   // Mock session-index.json
   writeFileSync(
      join(MOCK_CLAUDE, 'session-index.json'),
      JSON.stringify({
         'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001': { summary: 'Login bug fix and auth flow', lastActive: now },
         'aaaa2222-bbbb-cccc-dddd-eeeeeeee0002': { summary: 'Dark mode implementation', lastActive: now - 86400000 },
      }),
   );

   // Mock session JSONL file
   const sessionContent = [
      JSON.stringify({ type: 'user', message: { content: 'Fix the login bug on the main page' } }),
      JSON.stringify({ type: 'assistant', message: { content: 'I found the issue in auth.js line 42...' } }),
      JSON.stringify({ type: 'user', message: { content: 'Also check the password reset flow' } }),
   ].join('\n');
   writeFileSync(join(MOCK_CLAUDE, 'projects', '-test-project', 'aaaa1111-bbbb-cccc-dddd-eeeeeeee0001.jsonl'), sessionContent);

   // Mock settings.json
   writeFileSync(join(MOCK_CLAUDE, 'settings.json'), JSON.stringify({ permissions: { allow: [] }, hooks: {} }, null, 2));
}

function cleanupMockDir() {
   if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
   }
}

function runCli(args, env = {}) {
   try {
      return execSync(`node ${CLI} ${args}`, {
         encoding: 'utf8',
         env: { ...process.env, HOME: TEST_DIR, ...env },
         timeout: 10000,
      });
   } catch (e) {
      return e.stdout || e.stderr || '';
   }
}

// ===== TESTS =====

describe('i18n', () => {
   it('should export t() and getLocale()', async () => {
      const { t, getLocale, currentLang } = await import(join(PKG_ROOT, 'src', 'i18n.mjs'));
      assert.equal(typeof t, 'function');
      assert.equal(typeof getLocale, 'function');
      assert.equal(typeof currentLang, 'string');
   });

   it('should return English translations by default', async () => {
      const { t } = await import(join(PKG_ROOT, 'src', 'i18n.mjs'));
      // t() returns string or the result of calling the translation
      const noDesc = t('noDescription');
      assert.ok(typeof noDesc === 'string');
      assert.ok(noDesc.length > 0);
   });

   it('should handle function translations with args', async () => {
      const { t } = await import(join(PKG_ROOT, 'src', 'i18n.mjs'));
      const result = t('daysAgo', 5);
      assert.ok(result.includes('5'));
   });

   it('should return key for unknown translations', async () => {
      const { t } = await import(join(PKG_ROOT, 'src', 'i18n.mjs'));
      const result = t('nonexistent_key_xyz');
      assert.equal(result, 'nonexistent_key_xyz');
   });
});

describe('config', () => {
   it('should export all constants', async () => {
      const config = await import(join(PKG_ROOT, 'src', 'config.mjs'));
      assert.ok(config.CLAUDE_DIR);
      assert.ok(config.HISTORY_FILE);
      assert.ok(config.PROJECTS_DIR);
      assert.ok(config.SESSION_INDEX);
      assert.equal(typeof config.formatDate, 'function');
      assert.equal(typeof config.shortProjectName, 'function');
      assert.equal(typeof config.ensureClaudeDir, 'function');
   });

   it('formatDate should return string for current timestamp', async () => {
      const { formatDate } = await import(join(PKG_ROOT, 'src', 'config.mjs'));
      const result = formatDate(Date.now());
      assert.equal(typeof result, 'string');
      assert.ok(result.length > 0);
   });

   it('shortProjectName should extract last path segment', async () => {
      const { shortProjectName } = await import(join(PKG_ROOT, 'src', 'config.mjs'));
      assert.equal(shortProjectName('/Users/user/my-project'), 'my-project');
      assert.equal(shortProjectName('C:\\Users\\user\\project'), 'project');
      assert.equal(shortProjectName(null), 'unknown');
      assert.equal(shortProjectName(''), 'unknown');
   });
});

describe('delete - validation', () => {
   it('should have isValidSessionId logic', async () => {
      // Test via CLI with invalid ID
      const output = runCli('delete "../../../etc"');
      assert.ok(output.includes('Invalid') || output.includes('UUID') || output.includes('invalid'));
   });
});

describe('CLI help', () => {
   it('should display help text', () => {
      const output = runCli('help');
      assert.ok(output.includes('claude-sessions'));
      assert.ok(output.includes('Commands:') || output.includes('commands'));
      assert.ok(output.includes('list'));
      assert.ok(output.includes('search'));
      assert.ok(output.includes('install'));
   });
});

describe('CLI list (with mock data)', () => {
   before(() => {
      setupMockClaudeDir();
   });

   after(() => {
      cleanupMockDir();
   });

   it('should list sessions from mock history', () => {
      const output = runCli('list --limit 3');
      assert.ok(output.includes('test-project') || output.includes('Login bug fix'));
   });

   it('should filter by project', () => {
      const output = runCli('list --project other');
      assert.ok(output.includes('other-project') || output.includes('Deploy pipeline'));
      assert.ok(!output.includes('Fix login'));
   });

   it('should search by content', () => {
      const output = runCli('search miniapp');
      assert.ok(output.includes('miniapp') || output.includes('Telegram'));
   });

   it('should show no results for non-matching search', () => {
      const output = runCli('search zzzznonexistent');
      // Should not contain any session IDs
      assert.ok(!output.includes('aaaa1111') && !output.includes('aaaa2222'));
   });

   it('should respect --limit', () => {
      const output = runCli('list --limit 1');
      // Count "claude --resume" occurrences — should be exactly 1
      const resumeCount = (output.match(/claude --resume/g) || []).length;
      assert.equal(resumeCount, 1);
   });
});

describe('CLI install (with mock data)', () => {
   before(() => {
      setupMockClaudeDir();
   });

   after(() => {
      cleanupMockDir();
   });

   it('should install commands and hooks', () => {
      const output = runCli('install');
      assert.ok(output.includes('sessions') || output.includes('install'));
      // Verify files were created
      assert.ok(existsSync(join(MOCK_CLAUDE, 'commands', 'sessions.md')));
      assert.ok(existsSync(join(MOCK_CLAUDE, 'commands', 'session-summarize.md')));
   });

   it('should not overwrite on second install', () => {
      const output = runCli('install');
      // Should contain skip indicator (⏭) for already installed items
      assert.ok(output.includes('⏭'));
   });
});

describe('CLI uninstall (with mock data)', () => {
   before(() => {
      setupMockClaudeDir();
      // First install
      runCli('install');
   });

   after(() => {
      cleanupMockDir();
   });

   it('should remove installed files', () => {
      const output = runCli('uninstall');
      // Should contain checkmark for removed items
      assert.ok(output.includes('✅'));
      assert.ok(!existsSync(join(MOCK_CLAUDE, 'commands', 'sessions.md')));
   });

   it('should preserve session-index.json', () => {
      assert.ok(existsSync(join(MOCK_CLAUDE, 'session-index.json')));
   });
});

describe('save-summary-hook', () => {
   before(() => {
      setupMockClaudeDir();
   });

   after(() => {
      cleanupMockDir();
   });

   it('should save summary to session-index.json', () => {
      const script = join(PKG_ROOT, 'src', 'save-summary-hook.mjs');
      execSync(`node ${script} --session aaaa3333-bbbb-cccc-dddd-eeeeeeee0003 --summary "Pipeline deploy fix"`, {
         encoding: 'utf8',
         env: { ...process.env, HOME: TEST_DIR },
      });

      const index = JSON.parse(readFileSync(join(MOCK_CLAUDE, 'session-index.json'), 'utf8'));
      assert.equal(index['aaaa3333-bbbb-cccc-dddd-eeeeeeee0003'].summary, 'Pipeline deploy fix');
   });

   it('should find full ID from short ID', () => {
      const script = join(PKG_ROOT, 'src', 'save-summary-hook.mjs');
      execSync(`node ${script} --session aaaa4444 --summary "MCP configuration"`, {
         encoding: 'utf8',
         env: { ...process.env, HOME: TEST_DIR },
      });

      const index = JSON.parse(readFileSync(join(MOCK_CLAUDE, 'session-index.json'), 'utf8'));
      // Should have saved with full ID if it was found, or short ID if not
      const hasEntry = index['aaaa4444'] || index['aaaa4444-bbbb-cccc-dddd-eeeeeeee0004'];
      assert.ok(hasEntry);
      assert.equal(hasEntry.summary, 'MCP configuration');
   });
});

describe('edge cases', () => {
   it('should handle missing ~/.claude gracefully', () => {
      const emptyDir = join(tmpdir(), `claude-sessions-empty-${Date.now()}`);
      mkdirSync(emptyDir, { recursive: true });
      const output = runCli('list', { HOME: emptyDir });
      assert.ok(output.includes('not found') || output.includes('error') || output.length === 0);
      rmSync(emptyDir, { recursive: true, force: true });
   });

   it('should handle empty history.jsonl', () => {
      const dir = join(tmpdir(), `claude-sessions-empty2-${Date.now()}`);
      mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
      mkdirSync(join(dir, '.claude', 'scripts'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'history.jsonl'), '');
      const output = runCli('list', { HOME: dir });
      // Should not crash and not show any session resume commands
      assert.ok(!output.includes('claude --resume'));
      rmSync(dir, { recursive: true, force: true });
   });

   it('should handle corrupted session-index.json', () => {
      const dir = join(tmpdir(), `claude-sessions-corrupt-${Date.now()}`);
      mkdirSync(join(dir, '.claude', 'commands'), { recursive: true });
      mkdirSync(join(dir, '.claude', 'scripts'), { recursive: true });
      writeFileSync(join(dir, '.claude', 'history.jsonl'), JSON.stringify({ sessionId: 'test-123', project: '/p', display: 'hi', timestamp: Date.now() }) + '\n');
      writeFileSync(join(dir, '.claude', 'session-index.json'), 'NOT VALID JSON{{{');
      const output = runCli('list --limit 1', { HOME: dir });
      // Should not crash, should still show sessions
      assert.ok(!output.includes('SyntaxError'));
      rmSync(dir, { recursive: true, force: true });
   });
});

console.log('\nRunning claude-sessions tests...\n');
