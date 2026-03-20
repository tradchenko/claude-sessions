#!/usr/bin/env node

/**
 * Альтернативная точка входа для новых тестов (JSONL edge cases + data resilience).
 * Основной способ запуска: npm test (через node --test tests/**\/*.test.mjs)
 * Этот файл остаётся как дополнительный entry point.
 */

await import('./jsonl-parser.test.mjs');
await import('./data-resilience.test.mjs');
