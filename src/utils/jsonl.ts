/**
 * Утилиты для работы с JSONL-файлами (JSON Lines).
 * Обрабатывает BOM, пустые строки, невалидный JSON.
 */

import type { Result } from './result.js';
import { ok } from './result.js';
import { safeReadFile } from './fs.js';

/**
 * Парсит строки JSONL-контента в массив объектов.
 * Пропускает пустые строки и невалидный JSON (не бросает).
 */
export function parseJsonlLines(content: string): Result<unknown[]> {
   // Убираем BOM если присутствует
   const cleaned = content.startsWith('\uFEFF') ? content.slice(1) : content;
   const lines = cleaned.split('\n');
   const result: unknown[] = [];

   for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
         result.push(JSON.parse(trimmed));
      } catch {
         // Пропускаем невалидные строки молча
      }
   }

   return ok(result);
}

/**
 * Читает JSONL-файл и парсит его строки.
 * Возвращает err если файл недоступен.
 */
export function parseJsonlFile(filePath: string): Result<unknown[]> {
   const fileResult = safeReadFile(filePath);
   if (!fileResult.ok) return fileResult;
   return parseJsonlLines(fileResult.data);
}
