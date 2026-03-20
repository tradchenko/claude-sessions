/**
 * Модуль структурированных ошибок и exit codes.
 * Единая точка форматирования ошибок для CLI.
 */

import { t } from './i18n.js';

// ─── Exit codes ───────────────────────────────────────────────────────────────

export const EXIT_OK = 0;
export const EXIT_GENERAL = 1;
export const EXIT_SESSION_NOT_FOUND = 2;
export const EXIT_AGENT_NOT_INSTALLED = 3;
export const EXIT_CORRUPT_DATA = 4;

// ─── AdapterErrorCode ─────────────────────────────────────────────────────────

export type AdapterErrorCode =
   | 'SESSION_NOT_FOUND'
   | 'AGENT_NOT_INSTALLED'
   | 'CORRUPT_DATA'
   | 'RESUME_NOT_SUPPORTED'
   | 'GENERAL';

// ─── AdapterError ─────────────────────────────────────────────────────────────

/**
 * Структурированная ошибка адаптера.
 * Содержит код, имя агента и подсказку для пользователя.
 */
export class AdapterError extends Error {
   readonly code: AdapterErrorCode;
   readonly agentName: string;
   readonly suggestion: string;

   constructor(options: { code: AdapterErrorCode; message: string; agentName?: string; suggestion?: string }) {
      super(options.message);
      this.name = 'AdapterError';
      this.code = options.code;
      this.agentName = options.agentName ?? '';
      this.suggestion = options.suggestion ?? '';
   }
}

// ─── getExitCode ──────────────────────────────────────────────────────────────

/**
 * Маппинг AdapterErrorCode → exit code процесса
 */
export function getExitCode(error: AdapterError): number {
   switch (error.code) {
      case 'SESSION_NOT_FOUND':
         return EXIT_SESSION_NOT_FOUND;
      case 'AGENT_NOT_INSTALLED':
         return EXIT_AGENT_NOT_INSTALLED;
      case 'CORRUPT_DATA':
         return EXIT_CORRUPT_DATA;
      case 'RESUME_NOT_SUPPORTED':
         return EXIT_GENERAL;
      case 'GENERAL':
         return EXIT_GENERAL;
   }
}

// ─── formatUserError ─────────────────────────────────────────────────────────

/**
 * Форматирует ошибку в трёхчастный вид:
 *   ✘ Error: [что сломалось]
 *     Cause: [почему]
 *     Fix:   [что делать]
 */
export function formatUserError(error: AdapterError | Error): string {
   if (error instanceof AdapterError) {
      const what = t('errorWhat');
      const cause = t('errorCause');
      const fix = t('errorFix');

      let result = `✘ ${what}: ${error.message}`;
      if (error.agentName) {
         result += `\n  ${cause}: ${error.agentName}`;
      }
      if (error.suggestion) {
         result += `\n  ${fix}: ${error.suggestion}`;
      }
      return result;
   }

   // Обычная Error — только message
   return `✘ ${error.message}`;
}

// ─── handleFatalError ────────────────────────────────────────────────────────

/**
 * Финальный обработчик неперехваченной ошибки.
 * Форматирует и выводит ошибку, при --debug показывает stack trace.
 * Завершает процесс с правильным exit code.
 */
export function handleFatalError(error: unknown, debug: boolean): never {
   if (error instanceof AdapterError) {
      process.stderr.write(formatUserError(error) + '\n');
      if (debug && error.stack) {
         process.stderr.write('\n' + error.stack + '\n');
      }
      process.exit(getExitCode(error));
   }

   if (error instanceof Error) {
      process.stderr.write(formatUserError(error) + '\n');
      if (debug && error.stack) {
         process.stderr.write('\n' + error.stack + '\n');
      }
      process.exit(EXIT_GENERAL);
   }

   // Неизвестный тип — строка или объект
   process.stderr.write(`✘ ${String(error)}\n`);
   process.exit(EXIT_GENERAL);
}
