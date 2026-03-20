/**
 * Barrel file для модуля миграции.
 * Экспортирует публичный API системы миграции.
 */

// Основной runner
export { runMigrations, readMeta, writeMeta } from './runner.js';

// Константы и типы
export { CURRENT_SCHEMA_VERSION } from './types.js';
export type { MetaJson, MigrationContext, Migration, MigrationResult } from './types.js';

// Утилиты backup
export { backupFile, cleanupOldBackups } from './backup.js';
