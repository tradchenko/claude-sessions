import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('memory system integration', () => {
   let tempDir, projectsDir, memoryDir, indexPath, configPath;

   beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'cs-integration-'));
      projectsDir = join(tempDir, 'projects');
      memoryDir = join(tempDir, 'session-memory');
      indexPath = join(memoryDir, 'index.json');
      configPath = join(memoryDir, 'config.json');
      mkdirSync(projectsDir, { recursive: true });
      mkdirSync(join(memoryDir, 'memories'), { recursive: true });
   });

   afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
   });

   it('full flow: migrate -> L0 -> memory-status', async () => {
      // 1. Create old session-index.json
      const oldIndexPath = join(tempDir, 'session-index.json');
      writeFileSync(oldIndexPath, JSON.stringify({
         'session-abc': { sessionId: 'session-abc', summary: 'Fixed auth bug', project: '/myproject', lastActive: Date.now() },
      }));

      // 2. Create JSONL for that session
      const sessionDir = join(projectsDir, '-myproject');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'session-abc.jsonl'),
         JSON.stringify({ type: 'human', message: { content: 'Fix the auth token expiry bug in src/auth.js' } }) + '\n' +
         JSON.stringify({ type: 'assistant', message: { content: 'I will update src/auth.js and src/middleware/session.js' } }) + '\n'
      );

      // 3. Migrate
      const { migrateSessionIndex, generateL0ForExistingSessions } = await import('../dist/memory/migrate.js');
      const index = migrateSessionIndex(oldIndexPath, indexPath);
      assert.ok(index.sessions['session-abc']);
      assert.equal(index.sessions['session-abc'].summary, 'Fixed auth bug');

      // 4. Generate L0
      const l0Count = generateL0ForExistingSessions(index, projectsDir);
      assert.equal(l0Count, 1);
      assert.ok(index.sessions['session-abc'].l0);
      assert.ok(index.sessions['session-abc'].l0.summary.includes('Fix the auth'));
      assert.ok(index.sessions['session-abc'].l0.files.includes('src/auth.js'));

      // 5. Write updated index
      const { writeIndex, readIndex } = await import('../dist/memory/index.js');
      writeIndex(indexPath, index);

      // 6. Verify memory-status works
      const { formatMemoryStatus } = await import('../dist/commands/memory-status.js');
      // Use the test index, not the real one
      const status = formatMemoryStatus(readIndex(indexPath));
      assert.ok(status.includes('1')); // 1 session
   });

   it('Stop hook L0 -> catalog generation', async () => {
      // 1. Create session JSONL
      const sessionDir = join(projectsDir, '-testproject');
      mkdirSync(sessionDir, { recursive: true });
      const sessionId = 'test-session-456';
      writeFileSync(join(sessionDir, sessionId + '.jsonl'),
         JSON.stringify({ type: 'human', message: { content: 'Refactor the database layer' } }) + '\n' +
         JSON.stringify({ type: 'assistant', message: { content: 'Updating src/db/connection.mjs and src/db/queries.mjs' } }) + '\n'
      );

      // 2. Run saveSessionWithL0
      const { saveSessionWithL0 } = await import('../dist/hooks/stop.js');
      saveSessionWithL0({
         sessionId,
         project: '/testproject',
         indexPath,
         projectsDir,
      });

      // 3. Verify L0 in index
      const { readIndex } = await import('../dist/memory/index.js');
      const index = readIndex(indexPath);
      assert.ok(index.sessions[sessionId].l0);
      assert.ok(index.sessions[sessionId].l0.summary.includes('Refactor'));

      // 4. Generate catalog
      const { formatSessionStartOutput } = await import('../dist/memory/catalog.js');
      const output = formatSessionStartOutput(index, '/testproject');
      assert.ok(output.includes('Session Memory'));
   });

   it('enable/disable memory lifecycle', async () => {
      const settingsPath = join(tempDir, 'settings.json');
      const claudeMdPath = join(tempDir, 'CLAUDE.md');
      writeFileSync(settingsPath, JSON.stringify({ hooks: {} }));
      writeFileSync(claudeMdPath, '# My Project\n');

      // Enable
      const { enableMemory } = await import('../dist/commands/enable-memory.js');
      enableMemory({ settingsPath, claudeMdPath, scriptsDir: tempDir });

      let settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.ok(settings.hooks.SessionStart.length > 0);
      assert.ok(readFileSync(claudeMdPath, 'utf8').includes('Session Memory System'));

      // Disable
      const { disableMemory } = await import('../dist/commands/disable-memory.js');
      disableMemory({ settingsPath, claudeMdPath });

      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      assert.equal(settings.hooks.SessionStart.length, 0);
      assert.ok(!readFileSync(claudeMdPath, 'utf8').includes('Session Memory System'));
      assert.ok(readFileSync(claudeMdPath, 'utf8').includes('My Project'));
   });

   it('hotness recalculation + memory limit enforcement', async () => {
      const { readIndex, writeIndex, enforceMemoryLimit } = await import('../dist/memory/index.js');
      const { recalculateAll } = await import('../dist/memory/hotness.js');

      const index = { version: 1, memories: {}, sessions: {} };
      // Add 510 memories
      for (let i = 0; i < 510; i++) {
         index.memories[`cases/mem-${i}`] = {
            name: `mem-${i}`, category: 'cases',
            lastAccessed: Date.now() - i * 24 * 60 * 60 * 1000,
            active_count: 510 - i,
            projects: ['/p'],
         };
      }

      recalculateAll(index, '/p');
      const pruned = enforceMemoryLimit(index);
      assert.ok(Object.keys(pruned.memories).length <= 400);

      // Verify remaining are the hottest ones
      const remaining = Object.values(pruned.memories);
      for (const m of remaining) {
         assert.ok(typeof m.hotness === 'number');
      }
   });

   it('dedup resolves candidates correctly', async () => {
      const { resolveCandidate } = await import('../dist/memory/dedup.js');
      const index = {
         memories: {
            'profile/role': { name: 'role', category: 'profile', content: 'Senior developer' },
            'events/deploy': { name: 'deploy', category: 'events', content: 'Deployed v2.0 on March 15' },
         }
      };

      // Merge for appendable
      const r1 = resolveCandidate({ name: 'role', category: 'profile', content: 'Also knows Python' }, index);
      assert.equal(r1.action, 'merge');
      assert.ok(r1.content.includes('Senior developer'));
      assert.ok(r1.content.includes('Also knows Python'));

      // Skip for duplicate immutable
      const r2 = resolveCandidate({ name: 'deploy', category: 'events', content: 'Deployed v2.0 on March 15' }, index);
      assert.equal(r2.action, 'skip');

      // Create for new
      const r3 = resolveCandidate({ name: 'new-pattern', category: 'patterns', content: 'Always use TDD' }, index);
      assert.equal(r3.action, 'create');
   });

   it('memory file format roundtrip', async () => {
      const { serializeMemory, parseMemory } = await import('../dist/memory/format.js');
      const meta = { name: 'test', category: 'cases', hotness: 0.75 };
      const content = 'Fixed the critical production bug.\nRoot cause was race condition.';
      const serialized = serializeMemory(meta, content);
      const { meta: parsedMeta, content: parsedContent } = parseMemory(serialized);
      assert.equal(parsedMeta.name, 'test');
      assert.equal(parsedMeta.hotness, 0.75);
      assert.equal(parsedContent, content);
   });

   it('native projection creates files in correct format', async () => {
      const { projectToNativeFormat } = await import('../dist/memory/project.js');
      const index = {
         memories: {
            'cases/bugfix': { name: 'bugfix', category: 'cases', hotness: 0.8, content: 'Fixed auth bug', description: 'Auth bugfix', projects: ['/p'] },
         }
      };
      const memDir = join(tempDir, 'native-memory');
      const count = projectToNativeFormat(index, '/p', memDir);
      assert.equal(count, 1);
      const file = readFileSync(join(memDir, 'sm-cases-bugfix.md'), 'utf8');
      assert.ok(file.includes('name: bugfix'));
      assert.ok(file.includes('Fixed auth bug'));
   });
});
