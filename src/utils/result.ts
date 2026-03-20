/**
 * Result type для безопасной обработки ошибок без исключений.
 * Функциональный подход: ok() и err() вместо try/catch.
 */

/** Успешный результат */
export type Ok<T> = { ok: true; data: T };

/** Результат с ошибкой */
export type Err = { ok: false; error: string };

/** Объединение результатов */
export type Result<T> = Ok<T> | Err;

/** Создать успешный результат */
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/** Создать результат с ошибкой */
export const err = (error: string): Err => ({ ok: false, error });
