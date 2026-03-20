/**
 * Основной runner системы миграции.
 * Обеспечивает версионирование через meta.json, backup конфигов и идемпотентность.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_SCHEMA_VERSION } from './types.js';
import type { MetaJson, MigrationContext, Migration, MigrationResult } from './types.js';
import { backupFile, cleanupOldBackups } from './backup.js';
import { migrateSessionIndex, generateL0ForExistingSessions } from '../memory/migrate.js';
import { writeIndex } from '../memory/index.js';
import { t } from '../core/i18n/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..', '..');
const PKG_DIST = join(PKG_ROOT, 'dist');

/**
 * Читает meta.json из dataDir.
 * При ошибке (файл не существует, невалидный JSON) возвращает null — что означает версию 0.
 */
export function readMeta(dataDir: string): MetaJson | null {
   const metaPath = join(dataDir, 'meta.json');
   if (!existsSync(metaPath)) return null;
   try {
      return JSON.parse(readFileSync(metaPath, 'utf8')) as MetaJson;
   } catch {
      return null;
   }
}

/**
 * Записывает meta.json атомарно (temp + rename) для защиты от частичной записи.
 */
export function writeMeta(dataDir: string, meta: MetaJson): void {
   mkdirSync(dataDir, { recursive: true });
   const metaPath = join(dataDir, 'meta.json');
   const tmpPath = `${metaPath}.tmp`;
   writeFileSync(tmpPath, JSON.stringify(meta, null, 2), 'utf8');
   renameSync(tmpPath, metaPath);
}

/**
 * Список всех доступных миграций.
 * Каждая миграция выполняется последовательно при необходимости.
 */
const MIGRATIONS: Migration[] = [
   {
      fromVersion: 0,
      toVersion: 1,
      migrate: async (ctx: MigrationContext): Promise<void> => {
         // Migrate settings hooks (settings.json)
         const settingsPath = join(ctx.claudeDir, 'settings.json');
         if (existsSync(settingsPath)) {
            try {
               // Динамически импортируем для избежания circular deps
               const { migrateHooks } = await import('../commands/install.js');
               const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
               if (migrateHooks(settings as Parameters<typeof migrateHooks>[0])) {
                  // Atomic write: temp + rename
                  const tmpPath = `${settingsPath}.tmp`;
                  writeFileSync(tmpPath, JSON.stringify(settings, null, 2), 'utf8');
                  renameSync(tmpPath, settingsPath);
                  if (!ctx.silent) console.log('   Hooks migrated to new format');
               }
            } catch {
               // Ошибка чтения/записи settings — не блокируем миграцию
            }
         }

         // Migrate session index → memory index
         const sessionIndex = join(ctx.claudeDir, 'session-index.json');
         const memoryIndex = join(ctx.dataDir, 'index.json');
         const projectsDir = join(ctx.claudeDir, 'projects');

         if (existsSync(sessionIndex)) {
            const index = migrateSessionIndex(sessionIndex, memoryIndex, projectsDir);
            const l0Count = generateL0ForExistingSessions(index, projectsDir);
            if (l0Count > 0) writeIndex(memoryIndex, index);
            if (!ctx.silent) {
               console.log(`   Migrated ${Object.keys(index.sessions).length} sessions, generated ${l0Count} L0 memories`);
            }
         }

         // Ensure PKG_DIST is in scope (used for potential future hook path updates)
         void PKG_DIST;
      },
   },
];

/**
 * Выполняет все необходимые миграции схемы данных.
 * Идемпотентна: повторный вызов при актуальной версии = no-op.
 *
 * @param ctx - контекст с путями и флагом silent
 * @returns результат с ok, fromVersion, toVersion и опциональной ошибкой
 */
export async function runMigrations(ctx: MigrationContext): Promise<MigrationResult> {
   const meta = readMeta(ctx.dataDir);
   const currentVersion = meta?.schema_version ?? 0;

   // Идемпотентность: если версия актуальна — nothing to do
   if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return { ok: true, fromVersion: currentVersion, toVersion: currentVersion };
   }

   try {
      // Создаём backup критических файлов перед изменением
      const backupsDir = join(ctx.dataDir, 'backups');
      const settingsPath = join(ctx.claudeDir, 'settings.json');
      const memoryIndexPath = join(ctx.dataDir, 'index.json');

      await backupFile(settingsPath, backupsDir);
      await backupFile(memoryIndexPath, backupsDir);
      await cleanupOldBackups(backupsDir, 3);

      // Выполняем миграции последовательно
      const pending = MIGRATIONS.filter((m) => m.fromVersion >= currentVersion);
      for (const migration of pending) {
         if (!ctx.silent) {
            console.log(`   ${t('migrationStarted', migration.fromVersion, migration.toVersion)}`);
         }
         await migration.migrate(ctx);
      }

      // Записываем meta.json атомарно
      const newMeta: MetaJson = {
         schema_version: CURRENT_SCHEMA_VERSION,
         migrated_at: new Date().toISOString(),
      };
      writeMeta(ctx.dataDir, newMeta);

      if (!ctx.silent) {
         console.log(`   ${t('migrationComplete')}`);
      }

      return { ok: true, fromVersion: currentVersion, toVersion: CURRENT_SCHEMA_VERSION };
   } catch (err: unknown) {
      // Graceful return при ошибке: логируем, не бросаем
      const error = err instanceof Error ? err.message : String(err);
      console.error(`   ${t('migrationError', error)}`);
      return { ok: false, fromVersion: currentVersion, toVersion: currentVersion, error };
   }
}
