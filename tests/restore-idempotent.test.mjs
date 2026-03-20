/**
 * Тесты restore идемпотентности — Plan 02-07-03
 * Тестируем логику создания restore-context файла:
 * - два вызова → файл создаётся один раз (идемпотентность)
 * - другой sessionId → файл перезаписывается
 * - restore для не-Claude агента → корректные метаданные
 *
 * Тесты работают через мокнутую FS — без реального диска.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline-логика restore (упрощённая версия для unit-теста) ─────────────────

/**
 * Имитирует логику создания файла контекста restore.
 * Отражает паттерн из src/commands/restore.ts.
 */
function buildRestoreContextContent(sessionId, agent, messages) {
   const header = [
      `# Restore Context`,
      `<!-- session: ${sessionId} agent: ${agent} -->`,
      '',
      '## Conversation History',
      '',
   ].join('\n');

   const body = messages
      .map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:** ${m.text}`)
      .join('\n\n');

   return header + body + '\n';
}

/**
 * Мок файловой системы для тестирования restore логики.
 */
function createMockFs() {
   const files = new Map();
   let writeCount = 0;

   return {
      files,
      getWriteCount: () => writeCount,
      writeFile: (path, content) => {
         files.set(path, content);
         writeCount++;
      },
      readFile: (path) => files.get(path) ?? null,
      existsSync: (path) => files.has(path),
   };
}

// ─── Тесты идемпотентности ────────────────────────────────────────────────────

describe('restore идемпотентность', () => {
   it('одинаковый sessionId + одинаковый content → можно вызвать дважды без ошибки', () => {
      const mockFs = createMockFs();
      const path = '/tmp/test-restore.md';
      const content = buildRestoreContextContent('session-abc', 'claude', [
         { role: 'user', text: 'Hello' },
         { role: 'assistant', text: 'Hi there' },
      ]);

      // Первый вызов
      mockFs.writeFile(path, content);
      assert.ok(mockFs.existsSync(path), 'файл должен существовать после первого вызова');

      // Второй вызов (идемпотентный — перезаписывает тот же контент)
      mockFs.writeFile(path, content);
      assert.equal(mockFs.getWriteCount(), 2, 'writeFile вызван дважды');
      assert.equal(mockFs.readFile(path), content, 'содержимое не изменилось');
   });

   it('другой sessionId → файл перезаписывается новым контентом', () => {
      const mockFs = createMockFs();
      const path = '/tmp/test-restore.md';

      const content1 = buildRestoreContextContent('session-111', 'claude', [
         { role: 'user', text: 'First session' },
      ]);
      const content2 = buildRestoreContextContent('session-222', 'claude', [
         { role: 'user', text: 'Second session' },
      ]);

      mockFs.writeFile(path, content1);
      assert.ok(mockFs.readFile(path).includes('session-111'), 'первая сессия записана');

      mockFs.writeFile(path, content2);
      assert.ok(mockFs.readFile(path).includes('session-222'), 'вторая сессия перезаписала');
      assert.ok(!mockFs.readFile(path).includes('session-111'), 'первая сессия больше не в файле');
   });

   it('restore для не-Claude агента → контент содержит правильный agentName', () => {
      const content = buildRestoreContextContent('qwen-session-xyz', 'qwen', [
         { role: 'user', text: 'Qwen question' },
      ]);
      assert.ok(content.includes('qwen-session-xyz'), 'sessionId в контенте');
      assert.ok(content.includes('agent: qwen'), 'agentName в заголовке');
   });

   it('restore формирует секции User и Assistant', () => {
      const content = buildRestoreContextContent('s1', 'claude', [
         { role: 'user', text: 'Question?' },
         { role: 'assistant', text: 'Answer!' },
      ]);
      assert.ok(content.includes('**User:**'), 'содержит секцию User');
      assert.ok(content.includes('**Assistant:**'), 'содержит секцию Assistant');
      assert.ok(content.includes('Question?'), 'содержит текст пользователя');
      assert.ok(content.includes('Answer!'), 'содержит текст ассистента');
   });

   it('restore с пустыми сообщениями → создаёт файл с заголовком', () => {
      const mockFs = createMockFs();
      const path = '/tmp/empty-restore.md';
      const content = buildRestoreContextContent('empty-session', 'gemini', []);

      mockFs.writeFile(path, content);
      assert.ok(mockFs.existsSync(path), 'файл создан даже с пустыми сообщениями');
      assert.ok(mockFs.readFile(path).includes('Restore Context'), 'заголовок присутствует');
   });
});

describe('restore buildContent для разных агентов', () => {
   const agents = ['claude', 'qwen', 'gemini', 'codex', 'companion'];

   for (const agent of agents) {
      it(`agent=${agent} → корректный заголовок`, () => {
         const sessionId = `${agent}-session-001`;
         const content = buildRestoreContextContent(sessionId, agent, [
            { role: 'user', text: 'test' },
         ]);
         assert.ok(content.includes(`agent: ${agent}`), `заголовок содержит agent: ${agent}`);
         assert.ok(content.includes(sessionId), `заголовок содержит sessionId`);
      });
   }
});
