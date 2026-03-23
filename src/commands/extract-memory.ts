/**
 * Команда extract-memory: end-to-end pipeline извлечения воспоминаний
 *
 * Pipeline: загрузка сессий → L0 extraction → сохранение в index.sessions → L1 extraction
 *
 * Аргументы:
 *   --agent <agentId>    — фильтр по агенту (опционально)
 *   --session <id>       — конкретная сессия (опционально)
 *   --all                — все сессии (включая уже обработанные)
 *   (без флагов)         — только pending (без L0/L1)
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { readIndex, writeIndex } from '../memory/index.js';
import { MEMORY_INDEX, PROJECTS_DIR, findSessionJsonl } from '../core/config.js';
import { checkPendingExtractions } from '../sessions/loader.js';
import { loadSessions } from '../sessions/loader.js';
import { extractL0ForAgent } from '../memory/extract-l0-multi.js';
import type { MemoryIndex, SessionMeta } from '../memory/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Параметры команды */
interface ExtractMemoryOptions {
   agentFilter?: string;
   sessionId?: string;
   all: boolean;
}

/** Результат обработки одной сессии */
interface SessionResult {
   id: string;
   l0Done: boolean;
   l1Queued: boolean;
   error?: string;
}

/**
 * Парсит аргументы командной строки
 */
function parseArgs(args: string[]): ExtractMemoryOptions {
   const opts: ExtractMemoryOptions = { all: false };

   for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--agent' && args[i + 1]) {
         opts.agentFilter = args[i + 1];
         i++;
      } else if (arg === '--session' && args[i + 1]) {
         opts.sessionId = args[i + 1];
         i++;
      } else if (arg === '--all') {
         opts.all = true;
      } else if (arg === '--help' || arg === '-h') {
         printHelp();
         process.exit(0);
      }
   }

   return opts;
}

function printHelp(): void {
   console.log(`
Использование: claude-sessions extract-memory [options]

Опции:
  --agent <agentId>    Фильтр по агенту (claude, codex, qwen, gemini)
  --session <id>       Обработать конкретную сессию
  --all                Все сессии (включая уже обработанные)
  (без флагов)         Только pending (без L0/L1)

Примеры:
  claude-sessions extract-memory
  claude-sessions extract-memory --all
  claude-sessions extract-memory --agent codex
  claude-sessions extract-memory --session abc123
`);
}

/**
 * Читает JSONL-строки сессии с диска
 */
function readSessionLines(sessionId: string): string[] | null {
   const found = findSessionJsonl(sessionId);
   if (!found) return null;
   try {
      return readFileSync(found.path, 'utf8').split('\n').filter(Boolean);
   } catch {
      return null;
   }
}

/**
 * Выполняет L0 extraction для одной сессии и сохраняет в index
 */
function runL0ForSession(sessionId: string, sessionMeta: SessionMeta, index: MemoryIndex): boolean {
   // Определяем агента из метаданных сессии
   const agent = sessionMeta.l0?.agent ?? 'claude';
   const project = sessionMeta.project ?? sessionMeta.l0?.project ?? '';

   const lines = readSessionLines(sessionId);
   if (!lines) return false;

   try {
      const l0 = extractL0ForAgent(agent, lines, project);

      // Обновляем запись в index.sessions
      index.sessions[sessionId] = {
         ...sessionMeta,
         l0,
         project: l0.project || project,
         summary: l0.summary || sessionMeta.summary,
         lastActive: l0.timestamp ?? sessionMeta.lastActive,
      };

      return true;
   } catch {
      return false;
   }
}

/**
 * Спавнит extract-l1 для сессии через spawnSync
 */
function spawnL1(sessionId: string, project: string): boolean {
   const extractScript = join(__dirname, '..', 'memory', 'extract-l1.js');
   const proc = spawnSync(process.execPath, [extractScript, sessionId, project], {
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, MEMORY_DIR: join(MEMORY_INDEX, '..'), PROJECTS_DIR },
   });
   return proc.status === 0;
}

/**
 * Определяет список session IDs для обработки
 */
async function resolveSessionIds(opts: ExtractMemoryOptions, index: MemoryIndex): Promise<string[]> {
   // --session: конкретная сессия
   if (opts.sessionId) return [opts.sessionId];

   // --all: все сессии из index + загружаем свежие
   if (opts.all) {
      const sessions = await loadSessions({
         agentFilter: opts.agentFilter,
         limit: 9999,
      });
      // Объединяем ID из загрузки и из существующего index
      const ids = new Set<string>([
         ...sessions.map((s) => s.id),
         ...Object.keys(index.sessions),
      ]);
      return Array.from(ids);
   }

   // --agent: загружаем сессии агента и берём pending
   if (opts.agentFilter) {
      const sessions = await loadSessions({
         agentFilter: opts.agentFilter,
         limit: 9999,
      });
      // Добавляем сессии агента в index (без L0 — добавляем скелет)
      for (const s of sessions) {
         if (!index.sessions[s.id]) {
            index.sessions[s.id] = {
               summary: s.summary,
               project: s.project,
               lastActive: s.lastTs,
            };
         }
      }
   }

   // По умолчанию — только pending (есть в index, нет L0 или нет L1)
   return checkPendingExtractions(index as unknown as Parameters<typeof checkPendingExtractions>[0]);
}

/**
 * Основной handler команды extract-memory
 */
export default async function extractMemory(args: string[] = []): Promise<void> {
   const opts = parseArgs(args);

   // Читаем текущий index
   const index = readIndex(MEMORY_INDEX);

   // Определяем список сессий для обработки
   const sessionIds = await resolveSessionIds(opts, index);

   if (sessionIds.length === 0) {
      console.log('Нет сессий для обработки. Используйте --all для принудительного запуска.');
      return;
   }

   console.log(`Обработка ${sessionIds.length} сессий...\n`);

   const results: SessionResult[] = [];
   let l0Success = 0;
   let l0Failed = 0;
   let l1Success = 0;
   let l1Failed = 0;
   let memoriesExtracted = 0;

   for (let i = 0; i < sessionIds.length; i++) {
      const id = sessionIds[i];
      if (!id) continue;

      const n = i + 1;
      const m = sessionIds.length;
      process.stdout.write(`[${n}/${m}] Обработка сессии ${id.slice(0, 8)}... `);

      const sessionMeta: SessionMeta = index.sessions[id] ?? {
         summary: '',
         project: '',
         lastActive: Date.now(),
      };

      const result: SessionResult = { id, l0Done: false, l1Queued: false };

      // L0 extraction (если нет или --all)
      const needsL0 = opts.all || !sessionMeta.l0;
      if (needsL0) {
         const l0Ok = runL0ForSession(id, sessionMeta, index);
         result.l0Done = l0Ok;
         if (l0Ok) {
            l0Success++;
         } else {
            l0Failed++;
            result.error = 'L0 failed';
         }
      } else {
         result.l0Done = true; // уже есть
      }

      // Сохраняем index после каждой сессии (атомарная запись)
      try {
         writeIndex(MEMORY_INDEX, index);
      } catch (e) {
         result.error = `index write failed: ${e}`;
      }

      // L1 extraction (если L0 успешно и нет l1_ready)
      const updatedMeta = index.sessions[id];
      const needsL1 = result.l0Done && updatedMeta?.l0 && !updatedMeta?.l1_ready;
      if (needsL1) {
         const project = updatedMeta?.project ?? updatedMeta?.l0?.project ?? '';
         process.stdout.write('L1... ');
         const l1Ok = spawnL1(id, project);
         result.l1Queued = l1Ok;
         if (l1Ok) {
            l1Success++;
            memoriesExtracted++;
         } else {
            l1Failed++;
         }
         console.log(l1Ok ? 'OK' : 'WARN (L1 failed)');
      } else {
         console.log(result.l0Done ? 'OK' : 'SKIP');
      }

      results.push(result);
   }

   // Итоговая статистика
   console.log(`\n--- Итог ---`);
   console.log(`Обработано: ${results.length} сессий`);
   if (l0Success > 0 || l0Failed > 0) {
      console.log(`L0 extraction: ${l0Success} успешно, ${l0Failed} с ошибкой`);
   }
   console.log(`L1 extraction: ${l1Success} успешно, ${l1Failed} с ошибкой`);
   console.log(`Извлечено воспоминаний: ${memoriesExtracted}`);

   // Exit code: 1 только если все сессии провалились
   const totalErrors = l0Failed + l1Failed;
   if (totalErrors > 0 && totalErrors >= results.length) {
      process.exit(1);
   }
}
