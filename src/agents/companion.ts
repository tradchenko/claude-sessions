/**
 * Companion adapter — desktop wrapper for AI agents.
 * Companion is not an agent itself — it's a launcher utility.
 * Sessions are attributed to the actual agent (Claude, Codex, etc.)
 * with viaCompanion: true flag.
 */

import { existsSync, readdirSync, readFileSync, createReadStream } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';

import type { AgentAdapter, AgentInfo, AgentLoadOptions } from './types.js';
import type { Session } from '../sessions/loader.js';
import { HOME, formatDate, shortProjectName, SNAPSHOTS_DIR } from '../core/config.js';
import { readSessionIndex } from '../sessions/loader.js';

/** Companion home directory */
const COMPANION_DIR = join(HOME, '.companion');

/** Recordings directory */
const RECORDINGS_DIR = join(COMPANION_DIR, 'recordings');

/** Session names file */
const SESSION_NAMES_FILE = join(COMPANION_DIR, 'session-names.json');

/** Path to fork repository */
const FORK_PATH = join(HOME, 'companion');

/** Recording header in jsonl */
interface RecordingHeader {
   _header: true;
   version: number;
   session_id: string;
   backend_type: string;
   started_at: number | string;
   cwd: string;
}

/** Mapping session_id → human-readable name */
type SessionNamesMap = Record<string, string>;

/** Resolves actual agent from session name and backend_type */
function resolveAgent(sessionName: string, backendType: string): string {
   const nameLower = sessionName.toLowerCase();
   if (nameLower.startsWith('codex')) return 'codex';
   if (nameLower.startsWith('claude')) return 'claude';
   if (nameLower.startsWith('gemini')) return 'gemini';
   if (nameLower.startsWith('qwen')) return 'qwen';

   // By backend_type
   if (backendType === 'acp') return 'claude';
   if (backendType === 'codex') return 'codex';

   return 'claude'; // Default
}

function isForkDetected(): boolean {
   return existsSync(join(FORK_PATH, '.git'));
}

function isCompanionDetected(): boolean {
   if (existsSync(COMPANION_DIR)) return true;
   if (process.env.COMPANION_AUTH_TOKEN) return true;
   if (process.env.SDK_URL) return true;
   if (isForkDetected()) return true;
   return false;
}

function loadSessionNames(): SessionNamesMap {
   try {
      if (!existsSync(SESSION_NAMES_FILE)) return {};
      return JSON.parse(readFileSync(SESSION_NAMES_FILE, 'utf8')) as SessionNamesMap;
   } catch {
      return {};
   }
}

async function readRecordingHeader(filePath: string): Promise<RecordingHeader | null> {
   try {
      const rl = createInterface({
         input: createReadStream(filePath, { encoding: 'utf8' }),
         crlfDelay: Infinity,
      });

      for await (const line of rl) {
         if (!line.trim()) continue;
         try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (parsed._header === true) {
               rl.close();
               return parsed as unknown as RecordingHeader;
            }
         } catch {
            // Invalid JSON
         }
         rl.close();
         return null;
      }
      return null;
   } catch {
      return null;
   }
}

/** Порт Companion API */
function getCompanionPort(): string {
   return process.env.COMPANION_PORT || '3456';
}

/**
 * Открывает любую Claude-сессию в Companion UI через API.
 * Создаёт wrapper-сессию и открывает её в браузере.
 */
export async function openInCompanionViaApi(sessionId: string, cwd: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
   const port = getCompanionPort();
   const apiUrl = `http://localhost:${port}/api/sessions/create`;

   try {
      const res = await fetch(apiUrl, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ resumeSessionAt: sessionId, cwd: cwd || process.cwd(), backend: 'claude' }),
      });

      if (!res.ok) {
         const text = await res.text().catch(() => '');
         return { ok: false, error: `Companion API вернул ${res.status}: ${text}` };
      }

      const data = (await res.json()) as { sessionId?: string };
      if (!data.sessionId) return { ok: false, error: 'Companion API не вернул sessionId' };

      const url = `http://localhost:${port}/#/session/${data.sessionId}`;
      // Открываем в браузере (macOS)
      const { execFileSync } = await import('child_process');
      execFileSync('open', [url], { stdio: 'ignore' });

      return { ok: true, url };
   } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Скорее всего Companion не запущен
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
         return { ok: false, error: 'Companion не запущен (не удалось подключиться)' };
      }
      return { ok: false, error: msg };
   }
}

export const companionAdapter: AgentAdapter = {
   id: 'companion',
   name: isForkDetected() ? 'Companion (fork)' : 'Companion',
   icon: '⬡',

   detect(): AgentInfo | null {
      if (!isCompanionDetected()) return null;

      return {
         id: 'companion',
         name: isForkDetected() ? 'Companion (fork)' : 'Companion',
         icon: '⬡',
         homeDir: COMPANION_DIR,
         cliBin: null,
         instructionsFile: '',
         hooksSupport: false,
         resumeSupport: false,
      };
   },

   /**
    * Loads Companion sessions, attributing them to actual agents.
    * Each session gets agent = actual agent + viaCompanion = true.
    */
   async loadSessions(options?: AgentLoadOptions): Promise<Session[]> {
      if (!existsSync(RECORDINGS_DIR)) return [];

      const { projectFilter, searchQuery, limit = 100 } = options || {};
      const sessionNames = loadSessionNames();
      // Читаем AI-generated summary из session-index
      const sessionIndex = readSessionIndex();
      const files = readdirSync(RECORDINGS_DIR).filter((f) => f.endsWith('.jsonl'));

      // Fast path: parse session_id and timestamp from filenames
      // Format: {session_id}_{backend}_{ISO_timestamp}_{hash}.jsonl
      const filenameParsed = new Map<string, { sessionId: string; backendType: string; timestamp: number; file: string }>();
      for (const file of files) {
         const match = file.match(/^([0-9a-f-]{36})_([a-z]+)_(\d{4}-\d{2}-\d{2}T[\d-]+\.\d+Z)_/);
         if (!match) continue;
         const [, sessionId, backendType, tsStr] = match;
         // match[1..3] гарантированно не undefined — regex требует захваты
         if (!sessionId || !backendType || !tsStr) continue;
         const timestamp = new Date(tsStr.replace(/-(?=\d{2}T)/g, '-').replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3')).getTime();
         const existing = filenameParsed.get(sessionId);
         if (!existing || timestamp > existing.timestamp) {
            filenameParsed.set(sessionId, { sessionId, backendType, timestamp, file });
         }
      }

      // Only read headers for unique sessions that need cwd (much fewer files)
      const sessionsById = new Map<string, RecordingHeader>();
      for (const [sessionId, parsed] of filenameParsed) {
         const header = await readRecordingHeader(join(RECORDINGS_DIR, parsed.file));
         if (header) {
            sessionsById.set(sessionId, header);
         } else {
            // Fallback: construct minimal header from filename
            sessionsById.set(sessionId, {
               _header: true,
               version: 1,
               session_id: sessionId,
               backend_type: parsed.backendType,
               started_at: parsed.timestamp,
               cwd: '',
            });
         }
      }

      // Convert to Session[]
      const result: Session[] = [];
      for (const [sessionId, header] of sessionsById) {
         const ts = typeof header.started_at === 'number' ? header.started_at : new Date(header.started_at).getTime();
         const lastTs = ts < 1e12 ? ts * 1000 : ts;
         const project = shortProjectName(header.cwd);
         const sessionName = sessionNames[sessionId] || '';
         const agent = resolveAgent(sessionName, header.backend_type);
         // AI summary из index имеет приоритет, затем имя сессии, затем проект
         const summary = sessionIndex[sessionId]?.summary || sessionName || project || '';
         const dateStr = formatDate(lastTs);

         // Companion recording существует — но restore работает через JSONL реального агента
         // hasJsonl = undefined (не проверяем — дорого), индикатор [!] не показывается
         const hasSnapshot = existsSync(join(SNAPSHOTS_DIR, `${sessionId}.md`));

         const session: Session = {
            id: sessionId,
            project,
            projectPath: header.cwd,
            summary: summary.replace(/\n/g, ' ').trim().slice(0, 65),
            dateStr,
            cnt: '',
            lastTs,
            count: 1,
            searchText: `${dateStr} ${project} ${summary} companion`.toLowerCase(),
            agent,
            viaCompanion: true,
            hasSnapshot,
         };

         // Filtering
         if (projectFilter && !project.toLowerCase().includes(projectFilter.toLowerCase())) continue;
         if (searchQuery && !session.searchText.includes(searchQuery.toLowerCase())) continue;

         result.push(session);
      }

      result.sort((a, b) => b.lastTs - a.lastTs);
      return result.slice(0, limit);
   },

   getResumeCommand(): string[] | null {
      return null;
   },

   isSessionAlive(_sessionId: string): boolean {
      return false; // Companion sessions are attributed to real agents
   },

   getInstructionsPath(): string | null {
      return null;
   },

   /**
    * Формирует команду для открытия сессии в веб-интерфейсе Companion.
    * Использует `open` на macOS для открытия URL в браузере по умолчанию.
    */
   getOpenInUiCommand(sessionId: string): string[] | null {
      if (!isCompanionDetected()) return null;
      // Порт: 3456 для production, 3457 для dev
      const port = process.env.COMPANION_PORT || '3456';
      const url = `http://localhost:${port}/#/session/${sessionId}`;
      return ['open', url];
   },
};
