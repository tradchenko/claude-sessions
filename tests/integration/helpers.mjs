/**
 * Общие утилиты для интеграционных тестов CLI-команд.
 * Предоставляют изолированные temp environments для каждого теста.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Создаёт изолированную temp-директорию с базовой структурой:
 *   {tmp}/claude/           — эмулирует ~/.claude/
 *   {tmp}/claude/session-memory/  — эмулирует ~/.claude/session-memory/
 *   {tmp}/claude/projects/        — эмулирует ~/.claude/projects/
 *
 * @returns {{ root: string, claudeDir: string, dataDir: string, projectsDir: string }}
 */
export function createTestEnv() {
   const root = mkdtempSync(join(tmpdir(), 'cs-integ-'));
   const claudeDir = join(root, 'claude');
   const dataDir = join(claudeDir, 'session-memory');
   const projectsDir = join(claudeDir, 'projects');

   mkdirSync(claudeDir, { recursive: true });
   mkdirSync(dataDir, { recursive: true });
   mkdirSync(projectsDir, { recursive: true });

   return { root, claudeDir, dataDir, projectsDir };
}

/**
 * Рекурсивно удаляет temp-директорию, игнорируя ошибки.
 * @param {string} dir
 */
export function cleanupTestEnv(dir) {
   try {
      rmSync(dir, { recursive: true, force: true });
   } catch {
      // Игнорируем ошибки очистки
   }
}

/**
 * Создаёт JSONL-файл сессии для указанного агента в projects-директории.
 * @param {string} projectsDir  — путь к {claudeDir}/projects/
 * @param {string} agent        — идентификатор агента (claude, codex, qwen, gemini)
 * @param {Object} sessionData  — данные сессии
 * @param {string} sessionData.id        — id сессии
 * @param {string} [sessionData.project] — имя проекта (по умолчанию 'test-project')
 * @param {Array}  [sessionData.events]  — массив событий JSONL (по умолчанию минимальный валидный)
 * @returns {string} путь к созданному JSONL-файлу
 */
export function createSessionFixture(projectsDir, agent, sessionData) {
   const { id, project = 'test-project', events } = sessionData;
   const projectDir = join(projectsDir, project);
   mkdirSync(projectDir, { recursive: true });

   const defaultEvents = [
      { type: 'user', message: { content: 'Привет' }, sessionId: id, timestamp: Date.now() - 2000 },
      { type: 'assistant', message: { content: 'Привет! Чем могу помочь?' }, sessionId: id, timestamp: Date.now() - 1000 },
   ];

   const lines = (events ?? defaultEvents).map((e) => JSON.stringify(e)).join('\n') + '\n';
   const filePath = join(projectDir, `${id}.jsonl`);
   writeFileSync(filePath, lines, 'utf8');
   return filePath;
}

/**
 * Создаёт settings.json в claudeDir.
 * @param {string} claudeDir
 * @param {Object} settings
 */
export function createSettingsFixture(claudeDir, settings) {
   writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
}

/**
 * Создаёт memory index (index.json) в dataDir.
 * @param {string} dataDir
 * @param {Object} [index]
 */
export function createMemoryIndexFixture(dataDir, index = {}) {
   const defaultIndex = {
      sessions: {},
      version: 1,
      updatedAt: new Date().toISOString(),
      ...index,
   };
   writeFileSync(join(dataDir, 'index.json'), JSON.stringify(defaultIndex, null, 2), 'utf8');
}

/**
 * Создаёт мета-файл миграции (meta.json) в dataDir.
 * @param {string} dataDir
 * @param {number} [version=1]
 */
export function createMetaFixture(dataDir, version = 1) {
   const meta = { schema_version: version, migrated_at: new Date().toISOString() };
   writeFileSync(join(dataDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}
