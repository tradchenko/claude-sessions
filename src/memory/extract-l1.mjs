import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readIndex, writeIndex, acquireLock, releaseLock } from './index.mjs';
import { resolveCandidate } from './dedup.mjs';
import { serializeMemory } from './format.mjs';
import { readMemoryConfig } from './config.mjs';

const VALID_CATEGORIES = ['profile', 'preferences', 'entities', 'events', 'cases', 'patterns'];
const EXTRACTION_TIMEOUT = 60_000;
const HEAD_COUNT = 15;
const TAIL_COUNT = 35;

export function buildExtractionPrompt(messages) {
   const conversation = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
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
- events: incidents, deployments, decisions (with dates)
- cases: problem + solution pairs
- patterns: recurring approaches, anti-patterns

Only extract information worth remembering in future sessions. Skip trivial exchanges.
If nothing is worth remembering, return an empty array [].

Conversation:
${conversation}

JSON array:`;
}

export function parseLLMResponse(response) {
   try {
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(m =>
         m.category && m.name && m.content &&
         VALID_CATEGORIES.includes(m.category)
      );
   } catch {
      return [];
   }
}

function extractMessagesFromJSONL(jsonlPath) {
   const content = readFileSync(jsonlPath, 'utf8');
   const lines = content.split('\n').filter(Boolean);
   const messages = [];

   for (const line of lines) {
      try {
         const event = JSON.parse(line);
         if (event.type === 'human' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'user', content: text.slice(0, 1000) });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text = typeof event.message.content === 'string'
               ? event.message.content
               : event.message.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
            messages.push({ role: 'assistant', content: text.slice(0, 1500) });
         }
      } catch {}
   }

   // Head + tail extraction
   if (messages.length <= HEAD_COUNT + TAIL_COUNT) return messages;
   return [...messages.slice(0, HEAD_COUNT), ...messages.slice(-TAIL_COUNT)];
}

function findSessionJSONL(projectsDir, sessionId) {
   try {
      const dirs = readdirSync(projectsDir);
      for (const dir of dirs) {
         const p = join(projectsDir, dir, sessionId + '.jsonl');
         if (existsSync(p)) return p;
      }
   } catch {}
   return null;
}

function findClaudeCli() {
   // Try common locations first
   const candidates = ['/usr/local/bin/claude', '/opt/homebrew/bin/claude'];
   for (const c of candidates) {
      if (existsSync(c)) return c;
   }
   // Fall back to which
   try {
      return execFileSync('which', ['claude'], { encoding: 'utf8' }).trim();
   } catch {}
   return null;
}

// Main extraction function (runs as detached process)
async function main() {
   const [,, sessionId, project] = process.argv;
   if (!sessionId) process.exit(0);

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
      if (!session || session.l1_ready) { releaseLock(lockPath); return; }

      const jsonlPath = findSessionJSONL(projectsDir, sessionId);
      if (!jsonlPath) { releaseLock(lockPath); return; }

      const messages = extractMessagesFromJSONL(jsonlPath);
      if (messages.length === 0) { releaseLock(lockPath); return; }

      const memConfig = readMemoryConfig(configPath);
      const model = memConfig.extractionModel || 'haiku';

      const claudeCli = findClaudeCli();
      if (!claudeCli) throw new Error('Claude CLI not found');

      const prompt = buildExtractionPrompt(messages);
      const result = execFileSync(claudeCli, ['--model', model, '--print', '--output-format', 'text', prompt], {
         timeout: EXTRACTION_TIMEOUT,
         encoding: 'utf8',
         maxBuffer: 1024 * 1024,
      });

      const candidates = parseLLMResponse(result);

      for (const candidate of candidates) {
         const resolution = resolveCandidate(candidate, index);
         if (resolution.action === 'skip') continue;
         if (resolution.action === 'fuzzy') continue; // Skip fuzzy in background — safer

         const key = resolution.key;
         const content = resolution.action === 'merge' ? resolution.content : candidate.content;
         const now = new Date().toISOString();

         index.memories[key] = {
            ...index.memories[key],
            name: candidate.name,
            category: candidate.category,
            description: candidate.content.slice(0, 80),
            content: content,
            hotness: index.memories[key]?.hotness || 0.5,
            active_count: index.memories[key]?.active_count || 0,
            created: index.memories[key]?.created || now,
            updated: now,
            source_sessions: [...new Set([...(index.memories[key]?.source_sessions || []), sessionId])],
            projects: [...new Set([...(index.memories[key]?.projects || []), project].filter(Boolean))],
         };

         const categoryDir = join(memoriesDir, candidate.category);
         mkdirSync(categoryDir, { recursive: true });
         writeFileSync(join(categoryDir, candidate.name + '.md'), serializeMemory(index.memories[key], content));
      }

      index.sessions[sessionId].l1_ready = true;
      index.sessions[sessionId].extracted_at = new Date().toISOString();
      writeIndex(indexPath, index);
   } catch (err) {
      try { appendFileSync(errorLog, `[${new Date().toISOString()}] ${sessionId}: ${err.message}\n`); } catch {}
      try {
         const index = readIndex(indexPath);
         if (index.sessions?.[sessionId]) {
            index.sessions[sessionId].extraction_failed = true;
            index.sessions[sessionId].extraction_attempts = (index.sessions[sessionId].extraction_attempts || 0) + 1;
            writeIndex(indexPath, index);
         }
      } catch {}
   } finally {
      releaseLock(lockPath);
   }
}

if (process.argv[1] && process.argv[1] === new URL(import.meta.url).pathname) {
   main().catch(() => process.exit(1));
}
