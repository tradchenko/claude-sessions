/**
 * Фикстуры для тестов системы миграции (Plan 04-03).
 * Создают временные директории с различными состояниями данных:
 * старый формат, актуальный формат, повреждённые данные.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Создаёт fixture с данными в старом (v0) формате.
 * settings.json — flat hook format без обёртки {matcher, hooks}
 * session-index.json — старый формат без l0 полей
 * Нет meta.json — признак версии 0
 * @param {string} dir — директория для записи файлов
 */
export function createOldFormatFixture(dir) {
   mkdirSync(dir, { recursive: true });

   // Старый flat hook format: { type, command } без matcher/hooks обёртки
   const settings = {
      hooks: {
         Stop: [
            {
               type: 'command',
               command: 'node /usr/local/lib/node_modules/claude-sessions/save-session-summary.mjs',
            },
         ],
      },
   };
   writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');

   // Старый формат session-index.json без l0 полей
   const sessionIndex = {
      version: 0,
      sessions: {
         'session-001': {
            id: 'session-001',
            project: '/home/user/project',
            timestamp: '2024-01-01T00:00:00.000Z',
         },
      },
   };
   writeFileSync(join(dir, 'session-index.json'), JSON.stringify(sessionIndex, null, 2), 'utf8');

   // meta.json отсутствует — признак версии 0 (schema_version = 0)
}

/**
 * Создаёт fixture с данными в актуальном (v1) формате.
 * settings.json — новый format {matcher, hooks: [...]}
 * meta.json — schema_version: 1
 * memory-index.json — version: 1
 * @param {string} dir — директория для записи файлов
 */
export function createCurrentFormatFixture(dir) {
   mkdirSync(dir, { recursive: true });

   // Новый format с обёрткой {matcher, hooks: [...]}
   const settings = {
      hooks: {
         Stop: [
            {
               matcher: '',
               hooks: [
                  {
                     type: 'command',
                     command: 'node /usr/local/lib/node_modules/claude-sessions/dist/hooks/stop.js',
                  },
               ],
            },
         ],
      },
   };
   writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');

   // meta.json с актуальной версией схемы
   const meta = {
      schema_version: 1,
      migrated_at: '2024-06-01T12:00:00.000Z',
   };
   writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

   // memory-index.json в актуальном формате
   const memoryIndex = {
      version: 1,
      memories: {},
      sessions: {},
   };
   writeFileSync(join(dir, 'memory-index.json'), JSON.stringify(memoryIndex, null, 2), 'utf8');
}

/**
 * Создаёт fixture с повреждёнными данными.
 * settings.json — невалидный JSON
 * Нет meta.json
 * @param {string} dir — директория для записи файлов
 */
export function createCorruptFixture(dir) {
   mkdirSync(dir, { recursive: true });

   // Невалидный JSON — вызовет ошибку парсинга
   writeFileSync(join(dir, 'settings.json'), '{ this is not valid json !!!', 'utf8');

   // meta.json отсутствует — schema_version = 0, будет попытка миграции
}
