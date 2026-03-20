#!/usr/bin/env node

/**
 * Альтернативная точка входа для всех тестов фазы 01.
 * Основной способ запуска: npm test (через node --test tests/**\/*.test.mjs)
 * Этот файл остаётся как дополнительный entry point.
 */

// Plan 01-02: edge cases JSONL парсера и resilience
await import('./jsonl-parser.test.mjs');
await import('./data-resilience.test.mjs');

// Plan 01-03: session identity тесты и fixture-based матрица
await import('./session-identity.test.mjs');
await import('./fixture-matrix.test.mjs');
