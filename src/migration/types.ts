/**
 * Типы и интерфейсы системы миграции.
 * Используются runner.ts и backup.ts.
 */

/** Текущая версия схемы данных */
export const CURRENT_SCHEMA_VERSION = 1;

/** Метаданные состояния миграции, хранятся в ~/.claude-sessions/meta.json */
export interface MetaJson {
   /** Версия схемы после последней успешной миграции */
   schema_version: number;
   /** ISO-дата последней миграции */
   migrated_at: string;
}

/** Контекст выполнения миграции */
export interface MigrationContext {
   /** Путь к ~/.claude/ */
   claudeDir: string;
   /** Путь к ~/.claude/session-memory/ */
   dataDir: string;
   /** Подавлять вывод в stdout */
   silent: boolean;
}

/** Описание одного шага миграции */
export interface Migration {
   /** Версия до миграции */
   fromVersion: number;
   /** Версия после миграции */
   toVersion: number;
   /** Функция выполнения миграции */
   migrate: (ctx: MigrationContext) => Promise<void>;
}

/** Результат выполнения runMigrations() */
export interface MigrationResult {
   /** true если миграция прошла успешно (или была no-op) */
   ok: boolean;
   /** Версия до запуска */
   fromVersion: number;
   /** Версия после завершения */
   toVersion: number;
   /** Сообщение об ошибке при ok=false */
   error?: string;
}
