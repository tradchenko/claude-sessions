/**
 * Утилиты для нормализации путей (кросс-платформенные).
 */

import { normalize } from 'path';

/**
 * Нормализует путь: убирает двойные слеши, trailing slash и т.д.
 * Кросс-платформенный (использует Node.js path.normalize).
 */
export function normalizePath(p: string): string {
   return normalize(p);
}
