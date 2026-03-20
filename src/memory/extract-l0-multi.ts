// Multi-format L0 extraction for various AI agent session formats
import type { ChatMessage, L0Data } from './types.js';
import { extractL0FromMessages } from './extract-l0.js';

// Supported agent identifiers
type AgentId = 'codex' | 'codex-session' | 'qwen' | 'gemini' | 'companion';

// --- Codex history format ---
// {session_id, ts, text} — all entries are user messages
interface CodexHistoryEntry {
   session_id: string;
   ts: number;
   text: string;
}

// --- Codex session format ---
// {timestamp, type: "session_meta"|"response_item", payload: {...}}
interface CodexSessionMeta {
   timestamp: string;
   type: 'session_meta';
   payload: { id: string; cwd: string; model_provider?: string };
}

interface CodexSessionResponseItem {
   timestamp: string;
   type: 'response_item';
   payload: {
      type: 'message';
      role: 'user' | 'developer' | 'assistant';
      content: Array<{ type: string; text?: string }>;
   };
}

type CodexSessionLine = CodexSessionMeta | CodexSessionResponseItem | { type: string; [key: string]: unknown };

// --- Qwen format ---
// {type: "user"|"assistant"|"system"|"tool_result", message?: {role, parts: [{text, thought?, functionCall?}]}}
interface QwenPart {
   text?: string;
   thought?: boolean;
   functionCall?: Record<string, unknown>;
}

interface QwenEntry {
   type: string;
   subtype?: string;
   message?: { role: string; parts?: QwenPart[] };
}

// --- Companion format ---
// {_header: true, session_id, backend_type, started_at, cwd}
// {ts, dir: "out"|"in", raw: "JSON string", ch: "cli"|"browser"}
interface CompanionHeader {
   _header: true;
   session_id: string;
   backend_type: string;
   started_at: number;
   cwd: string;
}

interface CompanionMessage {
   ts: number;
   dir: 'out' | 'in';
   raw: string;
   ch: 'cli' | 'browser';
}

type CompanionLine = CompanionHeader | CompanionMessage;

// --- Parsers ---

function parseCodexHistory(lines: string[], project: string): L0Data {
   const messages: ChatMessage[] = [];
   let firstTs = 0;
   let latestTs = 0;

   for (const line of lines) {
      try {
         const entry = JSON.parse(line) as CodexHistoryEntry;
         if (entry.text) {
            messages.push({ role: 'user', content: entry.text });
            if (entry.ts) {
               const tsMs = entry.ts * 1000;
               if (firstTs === 0) firstTs = tsMs;
               if (tsMs > latestTs) latestTs = tsMs;
            }
         }
      } catch {
         // Skip malformed lines
      }
   }

   const result = extractL0FromMessages(messages, project, 'codex');
   if (latestTs > 0) result.timestamp = latestTs;
   if (firstTs > 0 && latestTs > 0 && latestTs > firstTs) result.duration = latestTs - firstTs;
   return result;
}

function parseCodexSession(lines: string[], project: string): L0Data {
   const messages: ChatMessage[] = [];
   let firstTs = 0;
   let latestTs = 0;

   for (const line of lines) {
      try {
         const entry = JSON.parse(line) as CodexSessionLine;

         if (entry.type === 'response_item') {
            const item = entry as CodexSessionResponseItem;
            const payload = item.payload;
            if (payload?.type !== 'message') continue;

            // Skip developer (system) messages — they are internal prompts
            if (payload.role === 'developer') continue;

            const role: 'user' | 'assistant' = payload.role === 'assistant' ? 'assistant' : 'user';
            const text = (payload.content ?? [])
               .filter((b) => b.type === 'input_text' || b.type === 'output_text')
               .map((b) => b.text ?? '')
               .join(' ')
               .trim();

            if (text) messages.push({ role, content: text });
         }

         // Extract timestamp from session_meta or response_item
         if ('timestamp' in entry && typeof entry.timestamp === 'string') {
            const ts = new Date(entry.timestamp as string).getTime();
            if (!isNaN(ts)) {
               if (firstTs === 0) firstTs = ts;
               if (ts > latestTs) latestTs = ts;
            }
         }
      } catch {
         // Skip malformed lines
      }
   }

   const result = extractL0FromMessages(messages, project, 'codex-session');
   if (latestTs > 0) result.timestamp = latestTs;
   if (firstTs > 0 && latestTs > 0 && latestTs > firstTs) result.duration = latestTs - firstTs;
   return result;
}

function parseQwen(lines: string[], project: string): L0Data {
   const messages: ChatMessage[] = [];
   let firstTs = 0;
   let latestTs = 0;

   for (const line of lines) {
      try {
         const entry = JSON.parse(line) as QwenEntry & { timestamp?: string };

         // Skip system and tool_result entries
         if (entry.type === 'system' || entry.type === 'tool_result') continue;

         if ((entry.type === 'user' || entry.type === 'assistant') && entry.message?.parts) {
            const role: 'user' | 'assistant' = entry.type === 'user' ? 'user' : 'assistant';

            // Filter out thought parts and function calls, keep only visible text
            const text = entry.message.parts
               .filter((p) => p.text && !p.thought && !p.functionCall)
               .map((p) => p.text ?? '')
               .join(' ')
               .trim();

            if (text) messages.push({ role, content: text });
         }

         // Extract timestamp if present
         if (entry.timestamp) {
            const ts = new Date(entry.timestamp).getTime();
            if (!isNaN(ts)) {
               if (firstTs === 0) firstTs = ts;
               if (ts > latestTs) latestTs = ts;
            }
         }
      } catch {
         // Skip malformed lines
      }
   }

   const result = extractL0FromMessages(messages, project, 'qwen');
   if (latestTs > 0) result.timestamp = latestTs;
   if (firstTs > 0 && latestTs > 0 && latestTs > firstTs) result.duration = latestTs - firstTs;
   return result;
}

function parseGemini(_lines: string[], project: string): L0Data {
   // Gemini — git-based, JSONL контент недоступен.
   // Возвращаем минимальный L0 с project и agent.
   return {
      summary: `Gemini session for ${project}`,
      project,
      messageCount: 0,
      files: [],
      timestamp: Date.now(),
      agent: 'gemini',
   };
}

/** Extract text content from a parsed ACP JSON-RPC message */
function extractTextFromAcpMessage(msg: Record<string, unknown>): { role: 'user' | 'assistant'; text: string } | null {
   // ACP protocol: look for conversation messages in various shapes
   // Common patterns: {method: "conversation/message", params: {role, content}}
   // or {type: "message", role: "user"|"assistant", content: [...]}
   const method = msg.method as string | undefined;
   const params = msg.params as Record<string, unknown> | undefined;
   const type = msg.type as string | undefined;

   // JSON-RPC style: {method: "conversation/message", params: {role, content: [{type: "text", text: "..."}]}}
   if (method === 'conversation/message' && params) {
      const role = params.role as string;
      const content = params.content;
      if ((role === 'user' || role === 'assistant') && Array.isArray(content)) {
         const text = (content as Array<{ type?: string; text?: string }>)
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text ?? '')
            .join(' ')
            .trim();
         if (text) return { role: role as 'user' | 'assistant', text };
      }
   }

   // Direct message style: {type: "message", role: "...", content: "..."}
   if (type === 'message') {
      const role = msg.role as string;
      if (role === 'user' || role === 'assistant') {
         const content = msg.content;
         if (typeof content === 'string' && content.trim()) {
            return { role: role as 'user' | 'assistant', text: content.trim() };
         }
         if (Array.isArray(content)) {
            const text = (content as Array<{ type?: string; text?: string }>)
               .filter((c) => c.type === 'text' && c.text)
               .map((c) => c.text ?? '')
               .join(' ')
               .trim();
            if (text) return { role: role as 'user' | 'assistant', text };
         }
      }
   }

   // Sampling request: {method: "sampling/createMessage", params: {messages: [...]}}
   if (method === 'sampling/createMessage' && params?.messages && Array.isArray(params.messages)) {
      const msgs = params.messages as Array<{ role?: string; content?: { type?: string; text?: string } }>;
      const userMsg = msgs.find((m) => m.role === 'user');
      if (userMsg?.content?.text) {
         return { role: 'user', text: userMsg.content.text };
      }
   }

   return null;
}

function parseCompanion(lines: string[], project: string): L0Data {
   const messages: ChatMessage[] = [];
   let firstTs = 0;
   let latestTs = 0;
   let headerCwd = '';

   for (const line of lines) {
      try {
         const entry = JSON.parse(line) as CompanionLine;

         // Extract cwd from header
         if ('_header' in entry && entry._header) {
            const header = entry as CompanionHeader;
            headerCwd = header.cwd ?? '';
            if (header.started_at) {
               if (firstTs === 0) firstTs = header.started_at;
               if (header.started_at > latestTs) latestTs = header.started_at;
            }
            continue;
         }

         const msg = entry as CompanionMessage;
         if (!msg.raw) continue;

         // Track first and latest timestamp
         if (msg.ts) {
            if (firstTs === 0) firstTs = msg.ts;
            if (msg.ts > latestTs) latestTs = msg.ts;
         }

         // Parse the raw JSON-RPC / ACP message
         try {
            const rawParsed = JSON.parse(msg.raw) as Record<string, unknown>;
            const extracted = extractTextFromAcpMessage(rawParsed);
            if (extracted) {
               messages.push({ role: extracted.role, content: extracted.text });
            }
         } catch {
            // Skip unparseable raw messages
         }
      } catch {
         // Skip malformed lines
      }
   }

   const effectiveProject = project || headerCwd || 'unknown';
   const result = extractL0FromMessages(messages, effectiveProject, 'companion');
   if (latestTs > 0) result.timestamp = latestTs;
   // duration: разница между первым и последним ts (companion хранит epoch в мс)
   if (firstTs > 0 && latestTs > 0 && latestTs > firstTs) result.duration = latestTs - firstTs;
   return result;
}

// --- Main export ---

const PARSERS: Record<AgentId, (lines: string[], project: string) => L0Data> = {
   codex: parseCodexHistory,
   'codex-session': parseCodexSession,
   qwen: parseQwen,
   gemini: parseGemini,
   companion: parseCompanion,
};

/**
 * Extract L0 metadata from a session for any supported agent format.
 * @param agentId - One of: codex, codex-session, qwen, gemini, companion
 * @param lines - Raw JSONL lines from the session file
 * @param project - Project name / path
 */
export function extractL0ForAgent(agentId: string, lines: string[], project: string): L0Data {
   const parser = PARSERS[agentId as AgentId];
   if (!parser) {
      return {
         summary: `Unknown agent: ${agentId}`,
         project,
         messageCount: 0,
         files: [],
         timestamp: Date.now(),
         agent: agentId,
      };
   }
   return parser(lines, project);
}
