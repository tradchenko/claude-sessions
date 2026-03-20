/**
 * Безопасные операции с файловой системой через Result type.
 * Заменяет readFileSync + try/catch паттерны во всех модулях.
 */

import { readFileSync, readdirSync } from 'fs';
import type { Result } from './result.js';
import { ok, err } from './result.js';

/**
 * Безопасно читает файл в строку.
 * Возвращает err если файл недоступен.
 */
export function safeReadFile(path: string): Result<string> {
   try {
      return ok(readFileSync(path, 'utf8'));
   } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
   }
}

/**
 * Безопасно читает и парсит JSON-файл.
 * Возвращает err если файл недоступен или содержит невалидный JSON.
 */
export function safeReadJson<T>(path: string): Result<T> {
   const fileResult = safeReadFile(path);
   if (!fileResult.ok) return fileResult;
   try {
      return ok(JSON.parse(fileResult.data) as T);
   } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
   }
}

/**
 * Безопасно читает список файлов в директории.
 * Возвращает err если директория недоступна.
 */
export function safeReaddir(path: string): Result<string[]> {
   try {
      return ok(readdirSync(path));
   } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
   }
}
