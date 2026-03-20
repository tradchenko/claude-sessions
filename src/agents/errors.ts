/**
 * Структурированные ошибки адаптеров агентов с DI
 */

import { readFile, readdir, stat } from 'fs/promises';

/** Коды ошибок адаптера */
export enum AdapterErrorCode {
   SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
   AGENT_NOT_INSTALLED = 'AGENT_NOT_INSTALLED',
   CORRUPT_DATA = 'CORRUPT_DATA',
   RESUME_NOT_SUPPORTED = 'RESUME_NOT_SUPPORTED',
   UNKNOWN = 'UNKNOWN',
}

/** Структурированная ошибка адаптера агента */
export class AdapterError extends Error {
   readonly agentName: string;
   readonly code: AdapterErrorCode;
   readonly suggestion: string;

   constructor(message: string, agentName: string, code: AdapterErrorCode, suggestion: string) {
      super(message);
      this.name = 'AdapterError';
      this.agentName = agentName;
      this.code = code;
      this.suggestion = suggestion;
   }

   /** Сессия не найдена */
   static sessionNotFound(agentName: string, sessionId: string): AdapterError {
      return new AdapterError(
         `Session "${sessionId}" not found for agent "${agentName}"`,
         agentName,
         AdapterErrorCode.SESSION_NOT_FOUND,
         `Убедитесь что сессия существует: cs list --agent ${agentName}`,
      );
   }

   /** Агент не установлен */
   static agentNotInstalled(agentName: string): AdapterError {
      return new AdapterError(
         `Agent "${agentName}" is not installed`,
         agentName,
         AdapterErrorCode.AGENT_NOT_INSTALLED,
         `Установите ${agentName} и убедитесь что бинарник доступен в PATH`,
      );
   }

   /** Повреждённые данные */
   static corruptData(agentName: string, filePath: string): AdapterError {
      return new AdapterError(
         `Corrupt data for agent "${agentName}" at "${filePath}"`,
         agentName,
         AdapterErrorCode.CORRUPT_DATA,
         `Проверьте файл ${filePath} на корректность JSON/JSONL`,
      );
   }

   /** Resume не поддерживается */
   static resumeNotSupported(agentName: string): AdapterError {
      return new AdapterError(
         `Agent "${agentName}" does not support session resume`,
         agentName,
         AdapterErrorCode.RESUME_NOT_SUPPORTED,
         `Агент ${agentName} не поддерживает восстановление сессий`,
      );
   }
}

/** Реальные зависимости fs/promises для production */
export function defaultFsDeps(): import('./types.js').FsDeps {
   return {
      readFile: (path, encoding) => readFile(path, encoding),
      readdir: (path, options) => readdir(path, options) as Promise<import('fs').Dirent[]>,
      stat: (path) => stat(path),
   };
}
