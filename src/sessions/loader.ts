/**
 * Session data loading and processing
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { safeReadJson } from '../utils/index.js';
import {
   SESSION_INDEX,
   MEMORY_INDEX,
} from '../core/config.js';

/** Session interface for UI display */
export interface Session {
   id: string;
   project: string;
   projectPath: string;
   summary: string;
   dateStr: string;
   cnt: string;
   lastTs: number;
   count: number;
   searchText: string;
   /** Actual agent (claude, codex, qwen, gemini) */
   agent: string;
   /** Session launched via Companion */
   viaCompanion?: boolean;
   /** JSONL файл доступен для полного restore */
   hasJsonl?: boolean;
   /** Snapshot доступен как fallback */
   hasSnapshot?: boolean;
}

/** Summary index entry */
interface SessionIndexEntry {
   summary?: string;
   lastActive?: number;
   [key: string]: unknown;
}

/** Session summary index */
type SessionIndex = Record<string, SessionIndexEntry>;

/** Unified memory index */
interface MemoryIndex {
   sessions?: SessionIndex;
   [key: string]: unknown;
}

/** Session loading parameters */
export interface LoadSessionsOptions {
   projectFilter?: string;
   searchQuery?: string;
   limit?: number;
   /** Filter by specific agent (if not set — all active) */
   agentFilter?: string;
}

/**
 * Loads sessions from all active agents.
 * Merges, sorts chronologically, applies filters.
 */
export async function loadSessions({
   projectFilter,
   searchQuery,
   limit = 500,
   agentFilter,
}: LoadSessionsOptions = {}): Promise<Session[]> {
   // Lazy import of registry (avoid circular dependencies)
   const { getActiveAdapters, getAdapter } = await import('../agents/registry.js');

   let adapters = agentFilter
      ? [getAdapter(agentFilter as import('../agents/types.js').AgentId)].filter(Boolean) as import('../agents/types.js').AgentAdapter[]
      : getActiveAdapters();

   // If no active adapters — fallback to loading only Claude
   if (adapters.length === 0) {
      const { claudeAdapter } = await import('../agents/claude.js');
      adapters = [claudeAdapter];
   }

   // Load sessions from all adapters in parallel
   const results = await Promise.allSettled(
      adapters.map((adapter) =>
         adapter.loadSessions({ projectFilter, searchQuery, limit }),
      ),
   );

   // Merge results
   const allSessions: Session[] = [];
   for (const result of results) {
      if (result.status === 'fulfilled') {
         allSessions.push(...result.value);
      }
      // Ошибки отдельных адаптеров не прерывают общую загрузку
   }

   // Кросс-адаптерная дедупликация: ключ = id + ':' + project
   // Нативный адаптер (viaCompanion !== true) имеет приоритет над Companion
   const deduped = new Map<string, Session>();
   let removedDuplicates = 0;

   for (const session of allSessions) {
      const key = `${session.id}:${session.project}`;
      const existing = deduped.get(key);

      if (!existing) {
         deduped.set(key, session);
         continue;
      }

      // При коллизии: нативный адаптер вытесняет Companion-версию
      const existingIsCompanion = existing.viaCompanion === true;
      const currentIsCompanion = session.viaCompanion === true;

      if (existingIsCompanion && !currentIsCompanion) {
         // Текущая — нативная, заменяем Companion-версию
         deduped.set(key, session);
         removedDuplicates++;
      } else if (!existingIsCompanion && currentIsCompanion) {
         // Существующая — нативная, пропускаем Companion-версию
         removedDuplicates++;
      } else {
         // Оба нативные или оба Companion — оставляем первую (по времени)
         removedDuplicates++;
      }
   }

   if (removedDuplicates > 0 && process.env.DEBUG_SESSIONS) {
      process.stderr.write(`[loader] Дедупликация: удалено ${removedDuplicates} дублей\n`);
   }

   // Сортировка по времени (новые первыми)
   const sorted = Array.from(deduped.values()).sort((a, b) => b.lastTs - a.lastTs);

   return sorted.slice(0, limit);
}

// Кеш для readSessionIndex — избегаем повторных readFileSync + JSON.parse
let _cachedIndex: SessionIndex | null = null;
let _cachedMtime: number = 0;

/**
 * Читает индекс сессий (unified → legacy fallback).
 * Результат кешируется по mtime файла — повторные вызовы не перечитывают диск.
 * Использует safeReadJson из shared utils.
 */
export function readSessionIndex(): SessionIndex {
   // Проверяем mtime основного индекса
   try {
      const mtime = statSync(MEMORY_INDEX).mtimeMs;
      if (_cachedIndex && mtime === _cachedMtime) return _cachedIndex;

      const result = safeReadJson<MemoryIndex>(MEMORY_INDEX);
      if (result.ok) {
         _cachedIndex = result.data.sessions ?? {};
         _cachedMtime = mtime;
         return _cachedIndex;
      }
   } catch { /* файл недоступен */ }

   // Fallback к старому session-index.json
   try {
      const mtime = statSync(SESSION_INDEX).mtimeMs;
      if (_cachedIndex && mtime === _cachedMtime) return _cachedIndex;

      const result = safeReadJson<SessionIndex>(SESSION_INDEX);
      if (result.ok) {
         _cachedIndex = result.data;
         _cachedMtime = mtime;
         return _cachedIndex;
      }
   } catch { /* файл недоступен */ }

   return {};
}

/** Entry in unified index for pending check */
interface UnifiedSessionEntry {
   l0?: unknown;
   l1_ready?: boolean;
   extraction_failed?: boolean;
   extraction_attempts?: number;
   [key: string]: unknown;
}

/** Unified index with sections */
interface UnifiedIndex {
   sessions?: Record<string, UnifiedSessionEntry>;
   [key: string]: unknown;
}

/**
 * Returns list of session IDs that need L1 extraction
 */
export function checkPendingExtractions(index: UnifiedIndex): string[] {
   const MAX_ATTEMPTS = 3;
   return Object.entries(index.sessions || {})
      .filter(([_id, s]) => {
         if (!s.l0 || s.l1_ready) return false;
         if (s.extraction_failed && (s.extraction_attempts || 0) >= MAX_ATTEMPTS) return false;
         return true;
      })
      .map(([id]) => id);
}

/**
 * Write summary index (limited to 200 entries)
 */
export function writeSessionIndex(index: SessionIndex): void {
   // Limit to 200 entries
   const entries = Object.entries(index);
   let trimmedIndex = index;
   if (entries.length > 200) {
      entries.sort((a, b) => (b[1].lastActive || 0) - (a[1].lastActive || 0));
      trimmedIndex = Object.fromEntries(entries.slice(0, 200));
   }

   // Write to legacy SESSION_INDEX for backward compatibility
   writeFileSync(SESSION_INDEX, JSON.stringify(trimmedIndex, null, 2));

   // Update sessions section in MEMORY_INDEX (if exists)
   if (existsSync(MEMORY_INDEX)) {
      try {
         const unified = JSON.parse(readFileSync(MEMORY_INDEX, 'utf8')) as MemoryIndex;
         unified.sessions = { ...unified.sessions, ...trimmedIndex };
         writeFileSync(MEMORY_INDEX, JSON.stringify(unified, null, 2));
      } catch {
         // Unified update error — not critical
      }
   }
}
