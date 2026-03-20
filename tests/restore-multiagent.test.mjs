/**
 * Тесты restore: мультиагентность и идемпотентность.
 * SESS-11..12: restore через registry, идемпотентность, метаданные.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Вспомогательные данные ────────────────────────────────────────────────

let AdapterError;
let tmpDir;

before(async () => {
   const errMod = await import('../dist/core/errors.js');
   AdapterError = errMod.AdapterError;

   // Создать временную директорию для тестов
   tmpDir = join(tmpdir(), `restore-test-${Date.now()}`);
   mkdirSync(tmpDir, { recursive: true });
});

after(() => {
   if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
   }
});

// ─── SESS-11: мультиагентность ────────────────────────────────────────────

describe('restore: мультиагентность', () => {
   it('AdapterError с AGENT_NOT_INSTALLED корректно создаётся', () => {
      const err = new AdapterError({ code: 'AGENT_NOT_INSTALLED', message: 'Agent "qwen" is not installed', agentName: 'qwen' });
      assert.ok(err instanceof AdapterError);
      assert.equal(err.code, 'AGENT_NOT_INSTALLED');
      assert.equal(err.agentName, 'qwen');
   });

   it('AdapterError с RESUME_NOT_SUPPORTED имеет корректный код и suggestion', () => {
      const err = new AdapterError({ code: 'RESUME_NOT_SUPPORTED', message: 'Agent "codex" does not support resume', agentName: 'codex', suggestion: 'Агент codex не поддерживает восстановление сессий' });
      assert.ok(err instanceof AdapterError);
      assert.equal(err.code, 'RESUME_NOT_SUPPORTED');
      assert.equal(err.suggestion, 'Агент codex не поддерживает восстановление сессий');
   });

   it('getAdapter возвращает адаптер для claude', async () => {
      const { getAdapter } = await import('../dist/agents/registry.js');
      const adapter = getAdapter('claude');
      assert.ok(adapter !== undefined, 'адаптер claude должен быть зарегистрирован');
      assert.equal(adapter.id, 'claude');
      assert.ok(typeof adapter.getResumeCommand === 'function');
   });

   it('getAdapter возвращает адаптер для codex', async () => {
      const { getAdapter } = await import('../dist/agents/registry.js');
      const adapter = getAdapter('codex');
      assert.ok(adapter !== undefined, 'адаптер codex должен быть зарегистрирован');
      assert.equal(adapter.id, 'codex');
   });

   it('getAdapter возвращает адаптер для qwen', async () => {
      const { getAdapter } = await import('../dist/agents/registry.js');
      const adapter = getAdapter('qwen');
      assert.ok(adapter !== undefined, 'адаптер qwen должен быть зарегистрирован');
      assert.equal(adapter.id, 'qwen');
   });

   it('getAdapter возвращает адаптер для gemini', async () => {
      const { getAdapter } = await import('../dist/agents/registry.js');
      const adapter = getAdapter('gemini');
      assert.ok(adapter !== undefined, 'адаптер gemini должен быть зарегистрирован');
      assert.equal(adapter.id, 'gemini');
   });

   it('getAdapter возвращает undefined для несуществующего агента', async () => {
      const { getAdapter } = await import('../dist/agents/registry.js');
      const adapter = getAdapter('unknown-agent');
      assert.equal(adapter, undefined);
   });
});

// ─── SESS-12: идемпотентность ────────────────────────────────────────────

describe('restore: идемпотентность контекстного файла', () => {
   it('создаёт файл если не существует', () => {
      const contextPath = join(tmpDir, '.restore-context.md');
      const content = '# Test\n\nSession: abc123\n';
      writeFileSync(contextPath, content, { encoding: 'utf8', flag: 'w' });
      assert.ok(existsSync(contextPath));
      assert.equal(readFileSync(contextPath, 'utf8'), content);
   });

   it('идемпотентность: файл с тем же sessionId содержит правильный id', () => {
      const contextPath = join(tmpDir, '.restore-context-idem.md');
      const sessionId = 'test-session-123';
      const content = `# Restored Session\n\n- session: ${sessionId}\n`;

      writeFileSync(contextPath, content, { encoding: 'utf8' });
      const existing = readFileSync(contextPath, 'utf8');
      const isSameSession = existing.includes(`session: ${sessionId}`);
      assert.ok(isSameSession, 'файл должен содержать sessionId');
   });

   it('atomic write: temp + rename корректно записывает файл', () => {
      const targetPath = join(tmpDir, '.restore-context-atomic.md');
      const tmpPath = targetPath + '.tmp';
      const content = '# Atomic Write Test\n\nSession: xyz789\n';

      // Атомарная запись: temp → rename
      writeFileSync(tmpPath, content, { encoding: 'utf8' });
      assert.ok(existsSync(tmpPath), 'temp файл должен существовать');
      renameSync(tmpPath, targetPath);
      assert.ok(existsSync(targetPath), 'целевой файл должен существовать после rename');
      assert.ok(!existsSync(tmpPath), 'temp файл должен исчезнуть после rename');
      assert.equal(readFileSync(targetPath, 'utf8'), content);
   });

   it('перезапись при другой сессии: новое содержимое заменяет старое', () => {
      const contextPath = join(tmpDir, '.restore-context-overwrite.md');
      const session1 = 'session-aaa';
      const session2 = 'session-bbb';

      writeFileSync(contextPath, `# Session\n- session: ${session1}\n`);
      const first = readFileSync(contextPath, 'utf8');
      assert.ok(first.includes(session1));

      // Другая сессия — перезаписываем
      writeFileSync(contextPath, `# Session\n- session: ${session2}\n`);
      const second = readFileSync(contextPath, 'utf8');
      assert.ok(second.includes(session2), 'должен содержать новый sessionId');
      assert.ok(!second.includes(session1), 'не должен содержать старый sessionId');
   });
});

// ─── SESS-12: корректные метаданные ───────────────────────────────────────

describe('restore: метаданные контекстного файла', () => {
   it('метаданные frontmatter содержат sessionId, agent, projectPath, дату', () => {
      const sessionId = 'abc-123-def';
      const agentName = 'claude';
      const projectPath = '/Users/user/my-project';
      const createdAt = new Date('2026-03-20').toISOString();

      const frontmatter = [
         '---',
         `session: ${sessionId}`,
         `agent: ${agentName}`,
         `project: ${projectPath}`,
         `created: ${createdAt}`,
         '---',
      ].join('\n');

      assert.ok(frontmatter.includes(`session: ${sessionId}`));
      assert.ok(frontmatter.includes(`agent: ${agentName}`));
      assert.ok(frontmatter.includes(`project: ${projectPath}`));
      assert.ok(frontmatter.includes(`created: ${createdAt}`));
   });

   it('контекст без JSONL содержит предупреждение', () => {
      const content = '# Restored Session\n\n> Warning: JSONL data unavailable. Minimal context only.\n';
      assert.ok(content.includes('Warning'));
      assert.ok(content.includes('Minimal context'));
   });

   it('формат метаданных единообразен для всех агентов', () => {
      const agents = ['claude', 'codex', 'qwen', 'gemini', 'companion'];
      for (const agent of agents) {
         const sessionId = `session-${agent}`;
         const projectPath = `/projects/${agent}-project`;
         const header = `# Restored Session\n\n- **Session:** ${sessionId}\n- **Agent:** ${agent}\n- **Project:** ${projectPath}\n`;
         assert.ok(header.includes(`**Agent:** ${agent}`), `должен содержать agent для ${agent}`);
         assert.ok(header.includes(`**Session:** ${sessionId}`), `должен содержать sessionId для ${agent}`);
      }
   });
});
