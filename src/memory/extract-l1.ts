// L1 extraction: deep memory extraction via LLM (multi-agent support)
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCandidate } from './dedup.js';
import { serializeMemory } from './format.js';
import { readMemoryConfig } from './config.js';
import type { ChatMessage, MemoryCandidate, MemoryCategory, MemoryEntry } from './types.js';
import { readIndex, writeIndex, acquireLock, releaseLock } from './index.js';

/** Supported agent identifiers for session file discovery */
type AgentId = 'claude' | 'codex' | 'qwen' | 'companion' | 'gemini';

const VALID_CATEGORIES: MemoryCategory[] = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];

// Sanitize LLM-generated names for safe use in paths and keys
function sanitizeName(name: string): string {
   return (
      name
         .replace(/[^a-z0-9-]/gi, '-')
         .replace(/-+/g, '-')
         .replace(/^-|-$/g, '')
         .slice(0, 50) || 'unnamed'
   );
}

const EXTRACTION_TIMEOUT = 60_000;
// HEAD_COUNT + TAIL_COUNT = 50 сообщений — известное ограничение для длинных сессий:
// средина разговора не попадает в extraction. Достаточно для большинства сессий.
const HEAD_COUNT = 15;
const TAIL_COUNT = 35;

export function buildExtractionPrompt(messages: ChatMessage[]): string {
   const conversation = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
   return `Extract structured memories from this Claude Code session conversation.

Return a JSON array of memories. Each memory:
{
  "category": one of: profile, preferences, entities, events, cases, patterns
  "name": kebab-case identifier (e.g. "auth-token-fix")
  "content": 1-3 sentences of useful information to remember
}

Categories:
- profile: user role, expertise, responsibilities
- preferences: coding style, tools, workflow
- entities: projects, services, people, systems
- events: incidents, deployments, decisions (with dates and reasoning)
- cases: problem + solution pairs (IMPORTANT: also extract FAILED approaches — what was tried and why it didn't work, so future sessions don't repeat the same mistakes)
- patterns: recurring approaches, anti-patterns

Pay special attention to:
1. FAILED APPROACHES — if something was tried and didn't work, extract it as a "cases" memory with clear explanation of WHY it failed. This prevents wasting time retrying.
2. DECISIONS — architectural or technical decisions with reasoning (why X was chosen over Y).
3. NEXT STEPS — if work is incomplete, what should be done next.

Only extract information worth remembering in future sessions. Skip trivial exchanges.
If nothing is worth remembering, return an empty array [].

Conversation:
${conversation}

JSON array:`;
}

export function parseLLMResponse(response: string): MemoryCandidate[] {
   // Пустой ответ → пустой массив
   if (!response || !response.trim()) return [];
   try {
      // Ищем JSON-массив объектов: первый '[{' паттерн, избегая markdown [link](url)
      const match = response.match(/\[\s*\{[\s\S]*\]/);
      if (!match) return [];
      const parsed: unknown = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      const result: MemoryCandidate[] = [];
      for (const m of parsed as unknown[]) {
         const obj = m as Record<string, unknown>;
         // Валидация схемы: category и name — непустые строки, content — непустая строка
         if (
            typeof obj.category !== 'string' ||
            !obj.category.trim() ||
            typeof obj.name !== 'string' ||
            !obj.name.trim() ||
            typeof obj.content !== 'string' ||
            !obj.content.trim()
         ) {
            // Невалидный кандидат — пропустить
            continue;
         }
         if (!VALID_CATEGORIES.includes(obj.category as MemoryCategory)) {
            // Неизвестная категория — пропустить
            continue;
         }
         result.push(obj as unknown as MemoryCandidate);
      }
      return result;
   } catch {
      return [];
   }
}

/** Content block from JSONL */
interface ContentBlock {
   type: string;
   text?: string;
}

/** Event from a JSONL file */
interface JSONLEvent {
   type: string;
   message?: {
      content: string | ContentBlock[];
   };
}

function extractMessagesFromJSONL(jsonlPath: string): ChatMessage[] {
   const content = readFileSync(jsonlPath, 'utf8');
   const lines = content.split('\n').filter(Boolean);
   const messages: ChatMessage[] = [];

   for (const line of lines) {
      try {
         const event = JSON.parse(line) as JSONLEvent;
         if (event.type === 'human' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[])
                       .filter((b) => b.type === 'text')
                       .map((b) => b.text ?? '')
                       .join(' ');
            messages.push({ role: 'user', content: text.slice(0, 1000) });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[])
                       .filter((b) => b.type === 'text')
                       .map((b) => b.text ?? '')
                       .join(' ');
            messages.push({ role: 'assistant', content: text.slice(0, 1500) });
         }
      } catch {
         // Skip malformed lines
      }
   }

   // Extract head + tail
   if (messages.length <= HEAD_COUNT + TAIL_COUNT) return messages;
   return [...messages.slice(0, HEAD_COUNT), ...messages.slice(-TAIL_COUNT)];
}

// Search for session JSONL in a flat directory of project subdirs (claude format)
function findClaudeSessionJSONL(projectsDir: string, sessionId: string): string | null {
   try {
      const dirs = readdirSync(projectsDir);
      for (const dir of dirs) {
         const p = join(projectsDir, dir, sessionId + '.jsonl');
         if (existsSync(p)) return p;
      }
   } catch {
      // Directory may not exist
   }
   return null;
}

// Recursively search for files containing sessionId in their name
function findFileRecursive(dir: string, sessionId: string): string | null {
   if (!existsSync(dir)) return null;
   try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
         const fullPath = join(dir, entry.name);
         if (entry.isDirectory()) {
            const found = findFileRecursive(fullPath, sessionId);
            if (found) return found;
         } else if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith('.jsonl')) {
            return fullPath;
         }
      }
   } catch {
      // Permission or read errors
   }
   return null;
}

// Find session JSONL in qwen format: ~/.qwen/projects/{dir}/chats/{sessionId}.jsonl
function findQwenSessionJSONL(sessionId: string): string | null {
   const qwenProjects = join(process.env.HOME || '', '.qwen', 'projects');
   if (!existsSync(qwenProjects)) return null;
   try {
      const dirs = readdirSync(qwenProjects);
      for (const dir of dirs) {
         const p = join(qwenProjects, dir, 'chats', sessionId + '.jsonl');
         if (existsSync(p)) return p;
      }
   } catch {
      // Directory may not exist
   }
   return null;
}

// Find session JSONL for companion: ~/.companion/recordings/{sessionId}*.jsonl
function findCompanionSessionJSONL(sessionId: string): string | null {
   const recordingsDir = join(process.env.HOME || '', '.companion', 'recordings');
   if (!existsSync(recordingsDir)) return null;
   try {
      const files = readdirSync(recordingsDir);
      const match = files.find((f) => f.startsWith(sessionId) && f.endsWith('.jsonl'));
      if (match) return join(recordingsDir, match);
   } catch {
      // Directory may not exist
   }
   return null;
}

/**
 * Find session JSONL file based on agent type.
 * Each agent stores sessions in a different location and format.
 */
function findSessionJSONL(projectsDir: string, sessionId: string, agentId: AgentId = 'claude'): string | null {
   switch (agentId) {
      case 'claude':
         return findClaudeSessionJSONL(projectsDir, sessionId);
      case 'codex': {
         const codexSessions = join(process.env.HOME || '', '.codex', 'sessions');
         return findFileRecursive(codexSessions, sessionId);
      }
      case 'qwen':
         return findQwenSessionJSONL(sessionId);
      case 'companion':
         return findCompanionSessionJSONL(sessionId);
      case 'gemini':
         // Gemini has no JSONL session files
         return null;
      default:
         return null;
   }
}

/** Синхронная пауза в миллисекундах */
function sleepSync(ms: number): void {
   Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function findClaudeCli(): string | null {
   // Check standard locations first
   const candidates = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude'];
   for (const c of candidates) {
      if (existsSync(c)) return c;
   }
   // Fall back to which
   try {
      return execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
   } catch {
      // CLI not found
   }
   return null;
}

// Main extraction function (runs as a separate process)
async function main(): Promise<void> {
   const [, , sessionId, project, rawAgentId] = process.argv;
   if (!sessionId) process.exit(0);
   const agentId: AgentId = (['claude', 'codex', 'qwen', 'companion', 'gemini'] as const).includes(rawAgentId as AgentId) ? (rawAgentId as AgentId) : 'claude';

   // Gemini has no JSONL — записать l1_skipped флаг и завершить extraction
   if (agentId === 'gemini') {
      const memDirG = process.env.MEMORY_DIR || join(process.env.HOME || '', '.claude', 'session-memory');
      const indexPathG = join(memDirG, 'index.json');
      const lockPathG = join(memDirG, 'index.lock');
      if (acquireLock(lockPathG)) {
         try {
            const idx = readIndex(indexPathG);
            if (idx.sessions?.[sessionId]) {
               idx.sessions[sessionId].l1_skipped = true;
               writeIndex(indexPathG, idx);
            }
         } catch {
            // Игнорируем ошибки при записи флага
         } finally {
            releaseLock(lockPathG);
         }
      }
      return;
   }

   const memoryDir = process.env.MEMORY_DIR || join(process.env.HOME || '', '.claude', 'session-memory');
   const indexPath = join(memoryDir, 'index.json');
   const lockPath = join(memoryDir, 'index.lock');
   const memoriesDir = join(memoryDir, 'memories');
   const configPath = join(memoryDir, 'config.json');
   const errorLog = join(memoryDir, 'error.log');
   const projectsDir = process.env.PROJECTS_DIR || join(process.env.HOME || '', '.claude', 'projects');

   if (!acquireLock(lockPath)) process.exit(0);

   try {
      const index = readIndex(indexPath);
      const session = index.sessions?.[sessionId];
      if (!session || session.l1_ready) {
         releaseLock(lockPath);
         return;
      }

      const jsonlPath = findSessionJSONL(projectsDir, sessionId, agentId);
      if (!jsonlPath) {
         releaseLock(lockPath);
         return;
      }

      const messages = extractMessagesFromJSONL(jsonlPath);
      if (messages.length === 0) {
         releaseLock(lockPath);
         return;
      }

      const memConfig = readMemoryConfig(configPath);
      const model = memConfig.extractionModel || 'haiku';

      const claudeCli = findClaudeCli();
      if (!claudeCli) throw new Error('Claude CLI not found');

      const prompt = buildExtractionPrompt(messages);
      const spawnArgs = ['--model', model, '--print', '--output-format', 'text'] as const;
      const spawnOpts = { input: prompt, timeout: EXTRACTION_TIMEOUT, encoding: 'utf8' as const, maxBuffer: 1024 * 1024 };

      let proc = spawnSync(claudeCli, [...spawnArgs], spawnOpts);
      // Retry один раз при ошибке spawnSync (сбой процесса, timeout и т.п.)
      if (proc.error || proc.status !== 0) {
         sleepSync(2000);
         proc = spawnSync(claudeCli, [...spawnArgs], spawnOpts);
      }
      if (proc.error) throw proc.error;
      if (proc.status !== 0) throw new Error(proc.stderr || 'Claude CLI failed');
      const result = proc.stdout;

      const candidates = parseLLMResponse(result);

      for (const candidate of candidates) {
         candidate.name = sanitizeName(candidate.name);
         const resolution = resolveCandidate(candidate, index);
         if (resolution.action === 'skip') continue;
         if (resolution.action === 'fuzzy') continue; // Skip fuzzy in background — safer

         const key = resolution.key;
         const content = resolution.action === 'merge' ? resolution.content : candidate.content;
         const now = new Date().toISOString();
         const existing = index.memories[key] as MemoryEntry | undefined;

         index.memories[key] = {
            ...(existing ?? ({} as MemoryEntry)),
            name: candidate.name,
            category: candidate.category,
            description: candidate.content.slice(0, 80),
            content: content,
            hotness: existing?.hotness ?? 0.5,
            active_count: existing?.active_count ?? 0,
            created: existing?.created ?? now,
            updated: now,
            source_sessions: [...new Set([...(existing?.source_sessions ?? []), sessionId])],
            projects: [...new Set([...(existing?.projects ?? []), project].filter((p): p is string => Boolean(p)))],
         };

         const categoryDir = join(memoriesDir, candidate.category);
         mkdirSync(categoryDir, { recursive: true });
         const memEntry = index.memories[key];
         if (memEntry) {
            writeFileSync(join(categoryDir, candidate.name + '.md'), serializeMemory(memEntry, content));
         }
      }

      const sessionEntry = index.sessions[sessionId];
      if (sessionEntry) {
         sessionEntry.l1_ready = true;
         sessionEntry.extracted_at = new Date().toISOString();
      }
      writeIndex(indexPath, index);
   } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      try {
         appendFileSync(errorLog, `[${new Date().toISOString()}] ${sessionId}: ${errorMessage}\n`);
      } catch {
         // Logging error — ignore
      }
      try {
         const index = readIndex(indexPath);
         if (index.sessions?.[sessionId]) {
            index.sessions[sessionId].extraction_failed = true;
            index.sessions[sessionId].extraction_attempts = (index.sessions[sessionId].extraction_attempts || 0) + 1;
            writeIndex(indexPath, index);
         }
      } catch {
         // Index update error — ignore
      }
   } finally {
      releaseLock(lockPath);
   }
}

if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
   main().catch(() => process.exit(1));
}
