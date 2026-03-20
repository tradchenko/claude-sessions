/**
 * Хелпер для генерации больших JSONL файлов во временной директории.
 * Используется в тестах DATA-07 для проверки работы с файлами 10MB+.
 * Файл создаётся в os.tmpdir() и должен удаляться через after() хук теста.
 */

import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Генерирует JSONL файл заданного размера.
 * @param {number} targetSizeMB - целевой размер в мегабайтах (по умолчанию 10)
 * @returns {Promise<string>} путь к созданному временному файлу
 */
export async function generateLargeJsonl(targetSizeMB = 10) {
   const targetBytes = targetSizeMB * 1024 * 1024;
   const tmpDir = mkdtempSync(join(tmpdir(), 'claude-sessions-large-'));
   const filePath = join(tmpDir, 'large.jsonl');

   const lines = [];
   let totalBytes = 0;
   let i = 0;

   while (totalBytes < targetBytes) {
      const ts = Date.now() + i;
      const line = JSON.stringify({ sessionId: `gen-${i}`, timestamp: ts, project: '/test' }) + '\n';
      lines.push(line);
      totalBytes += Buffer.byteLength(line, 'utf8');
      i++;

      // Записываем порциями по 10000 строк для экономии памяти
      if (lines.length >= 10000) {
         writeFileSync(filePath, lines.join(''), { flag: i <= 10000 ? 'w' : 'a' });
         lines.length = 0;
      }
   }

   // Записываем оставшиеся строки
   if (lines.length > 0) {
      writeFileSync(filePath, lines.join(''), { flag: i > 10000 ? 'a' : 'w' });
   }

   return filePath;
}
