/**
 * Session cache — stores pre-loaded sessions on disk for instant startup.
 * Cache is written after each successful session load.
 * On startup, cached data is shown immediately while fresh data loads in background.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { MEMORY_DIR } from '../core/config.js';
import type { Session } from './loader.js';

const CACHE_FILE = `${MEMORY_DIR}/sessions-cache.json`;

/** Max age before cache is considered stale (5 minutes) */
const MAX_AGE_MS = 5 * 60 * 1000;

interface SessionCache {
   timestamp: number;
   sessions: Session[];
}

/** Read cached sessions. Returns null if cache is missing or stale. */
export function readSessionCache(): Session[] | null {
   try {
      if (!existsSync(CACHE_FILE)) return null;
      const data = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as SessionCache;
      if (Date.now() - data.timestamp > MAX_AGE_MS) return null;
      return data.sessions;
   } catch {
      return null;
   }
}

/** Write sessions to cache */
export function writeSessionCache(sessions: Session[]): void {
   try {
      mkdirSync(dirname(CACHE_FILE), { recursive: true });
      const data: SessionCache = { timestamp: Date.now(), sessions };
      writeFileSync(CACHE_FILE, JSON.stringify(data));
   } catch {
      // Cache write failure is not critical
   }
}
