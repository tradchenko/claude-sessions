/**
 * Утилиты для создания резервных копий файлов перед миграцией.
 * Используется runner.ts для backup settings.json и memory-index.json.
 */

import { copyFile, readdir, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Создаёт резервную копию файла с ISO-timestamp суффиксом.
 * Если файл не существует — возвращает null (не ошибка).
 * @param filePath - абсолютный путь к файлу
 * @param backupsDir - директория для хранения backup-файлов
 * @returns путь к созданной копии, или null если файл не существует
 */
export async function backupFile(filePath: string, backupsDir: string): Promise<string | null> {
   // Если исходный файл не существует — backup не нужен
   if (!existsSync(filePath)) {
      return null;
   }

   // Создать директорию backup если не существует
   mkdirSync(backupsDir, { recursive: true });

   // Формируем имя backup: {basename}.{ISO-timestamp}
   const name = basename(filePath);
   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
   const backupName = `${name}.${timestamp}`;
   const backupPath = join(backupsDir, backupName);

   await copyFile(filePath, backupPath);
   return backupPath;
}

/**
 * Удаляет старые backup-файлы, оставляя последние keepCount штук.
 * Сортировка по имени файла (ISO-timestamp в суффиксе = хронологический порядок).
 * @param backupsDir - директория с backup-файлами
 * @param keepCount - сколько последних копий оставить (по умолчанию 3)
 */
export async function cleanupOldBackups(backupsDir: string, keepCount: number = 3): Promise<void> {
   // Если директории нет — нечего чистить
   if (!existsSync(backupsDir)) {
      return;
   }

   // Читаем все файлы и сортируем по имени (алфавитный = хронологический для ISO-дат)
   const files = await readdir(backupsDir);
   const sorted = files.filter((f) => !f.startsWith('.')).sort();

   // Удаляем самые старые, оставляем keepCount последних
   const toDelete = sorted.slice(0, Math.max(0, sorted.length - keepCount));
   await Promise.all(toDelete.map((f) => unlink(join(backupsDir, f))));
}
