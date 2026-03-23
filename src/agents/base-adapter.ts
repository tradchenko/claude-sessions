/**
 * Абстрактный базовый класс для адаптеров агентов с DI файловой системы
 */

import type { Session } from '../sessions/loader.js';
import type { AgentAdapter, AgentId, AgentInfo, AgentLoadOptions, FsDeps } from './types.js';
import { AdapterError, AdapterErrorCode, defaultFsDeps } from './errors.js';

/** Абстрактный базовый адаптер агента с DI зависимостями */
export abstract class BaseAgentAdapter implements AgentAdapter {
   /** Зависимости файловой системы (инжектируются для тестов) */
   protected readonly fs: FsDeps;

   constructor(fsDeps?: FsDeps) {
      this.fs = fsDeps ?? defaultFsDeps();
   }

   /** Идентификатор агента */
   abstract readonly id: AgentId;
   /** Отображаемое имя */
   abstract readonly name: string;
   /** Иконка */
   abstract readonly icon: string;

   /** Проверяет установлен ли агент */
   abstract detect(): AgentInfo | null;

   /** Загружает сессии агента */
   abstract loadSessions(options?: AgentLoadOptions): Promise<Session[]>;

   /** Возвращает команду для восстановления сессии */
   abstract getResumeCommand(sessionId: string): string[] | null;

   /** Возвращает путь к файлу инструкций */
   abstract getInstructionsPath(): string | null;

   /**
    * Проверяет живость сессии.
    * По умолчанию возвращает false — переопределяется в потомках при необходимости.
    */
   isSessionAlive(_sessionId: string): boolean {
      return false;
   }

   /**
    * Оборачивает любую ошибку в AdapterError.
    * Используется в блоках catch потомков.
    */
   protected wrapError(e: unknown): AdapterError {
      if (e instanceof AdapterError) return e;

      const message = e instanceof Error ? e.message : String(e);
      return new AdapterError(message, this.name, AdapterErrorCode.UNKNOWN, 'Проверьте логи для подробностей');
   }
}
