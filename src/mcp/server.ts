// MCP (Model Context Protocol) server for claude-sessions memory system
// STDIO transport: JSON-RPC 2.0 over stdin/stdout, one JSON per line

import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readIndex, writeIndex, acquireLock, releaseLock, enforceMemoryLimit } from '../memory/index.js';
import { MEMORY_INDEX, MEMORY_LOCK, MEMORIES_DIR, SNAPSHOTS_DIR } from '../core/config.js';
import type { MemoryIndex, MemoryEntry, MemoryCategory } from '../memory/types.js';

// JSON-RPC 2.0 types
interface JsonRpcRequest {
   jsonrpc: '2.0';
   id: number | string;
   method: string;
   params?: Record<string, unknown>;
}

interface JsonRpcResponse {
   jsonrpc: '2.0';
   id: number | string | null;
   result?: unknown;
   error?: { code: number; message: string; data?: unknown };
}

// MCP tool definition
interface McpToolDef {
   name: string;
   description: string;
   inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
   };
}

// MCP content block
interface McpTextContent {
   type: 'text';
   text: string;
}

const SERVER_INFO = {
   name: 'claude-sessions-memory',
   version: '2.1.0',
};

// Отслеживание активной сессии для сохранения при завершении
let _currentSessionId: string | null = null;
let _toolCallCount = 0;

const TOOLS: McpToolDef[] = [
   {
      name: 'memory-recall',
      description: 'Search memories by keyword query. Returns matching memories sorted by hotness score.',
      inputSchema: {
         type: 'object',
         properties: {
            query: { type: 'string', description: 'Search query (keyword match against name, description, content)' },
         },
         required: ['query'],
      },
   },
   {
      name: 'memory-status',
      description: 'Show memory system statistics: total memories, sessions count, categories breakdown, top hot memories.',
      inputSchema: {
         type: 'object',
         properties: {},
      },
   },
   {
      name: 'memory-save',
      description: 'Save a new memory or insight. Agent can proactively save important facts, decisions, or patterns discovered during the session.',
      inputSchema: {
         type: 'object',
         properties: {
            name: { type: 'string', description: 'Memory name (kebab-case, e.g. "auth-flow-refactor")' },
            category: { type: 'string', description: 'Category: cases, patterns, entities, events, preferences', enum: ['cases', 'patterns', 'entities', 'events', 'preferences'] },
            description: { type: 'string', description: 'One-line description' },
            content: { type: 'string', description: 'Full memory content (markdown)' },
         },
         required: ['name', 'category', 'description', 'content'],
      },
   },
   {
      name: 'save-snapshot',
      description: 'Save a session conversation snapshot for future restore. Call this before ending a session to preserve context.',
      inputSchema: {
         type: 'object',
         properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            summary: { type: 'string', description: 'Brief session summary' },
            messages: {
               type: 'array',
               description: 'Key messages from the session (user/assistant pairs)',
               items: {
                  type: 'object',
                  properties: {
                     role: { type: 'string', enum: ['user', 'assistant'] },
                     text: { type: 'string' },
                  },
               },
            },
         },
         required: ['sessionId', 'summary'],
      },
   },
];

// Send a JSON-RPC response to stdout
function sendResponse(response: JsonRpcResponse): void {
   process.stdout.write(JSON.stringify(response) + '\n');
}

// Формирует строку с топ-20 hot memories для instructions
function getHotMemories(index: MemoryIndex): string {
   const memories = Object.values(index.memories);
   if (memories.length === 0) return '';

   const top = [...memories].sort((a, b) => (b.hotness || 0) - (a.hotness || 0)).slice(0, 20);

   const rows = top.map((m) => {
      const desc = (m.description || '').slice(0, 80);
      return `| ${m.name} | ${m.category} | ${(m.hotness || 0).toFixed(2)} | ${desc} |`;
   });

   return ['# Session Memory (auto-loaded)', '', '## Hot Memories', '| name | category | hotness | description |', '|------|----------|---------|-------------|', ...rows].join('\n');
}

// Handle `initialize` request — возвращаем hot memories в instructions
function handleInitialize(id: number | string): void {
   const index = readIndex(MEMORY_INDEX);
   const hotMemories = getHotMemories(index);

   sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
         protocolVersion: '2024-11-05',
         capabilities: {
            tools: {},
         },
         serverInfo: SERVER_INFO,
         instructions: hotMemories,
      },
   });
}

// Handle `tools/list` request
function handleToolsList(id: number | string): void {
   sendResponse({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
   });
}

// Search memories by keyword (same logic as memory-search command)
function searchMemories(index: MemoryIndex, query: string): MemoryEntry[] {
   const q = query.toLowerCase();
   return Object.values(index.memories)
      .filter((m) => {
         const searchText = [m.name, m.category, m.description, m.content].filter(Boolean).join(' ').toLowerCase();
         return searchText.includes(q);
      })
      .sort((a, b) => (b.hotness || 0) - (a.hotness || 0));
}

// Format memory status (same logic as memory-status command)
function formatStatus(index: MemoryIndex): string {
   const memories = Object.values(index.memories);
   const sessions = Object.keys(index.sessions);

   const byCategory: Record<string, number> = {};
   for (const m of memories) {
      byCategory[m.category] = (byCategory[m.category] || 0) + 1;
   }

   const lines: string[] = [`Memory System Status`, `─────────────`, `Total memories: ${memories.length}`, `Sessions: ${sessions.length}`, ``, `By category:`];
   for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${cat}: ${count}`);
   }

   if (memories.length > 0) {
      lines.push('', 'Top 10 by hotness:');
      const top = [...memories].sort((a, b) => (b.hotness || 0) - (a.hotness || 0)).slice(0, 10);
      for (const m of top) {
         lines.push(`  ${(m.hotness || 0).toFixed(2)} ${m.category}/${m.name} — ${(m.description || '').slice(0, 50)}`);
      }
   }

   return lines.join('\n');
}

// Execute memory-recall tool
function executeMemoryRecall(query: string): McpTextContent[] {
   const index = readIndex(MEMORY_INDEX);
   const results = searchMemories(index, query);

   if (results.length === 0) {
      return [{ type: 'text', text: `No memories found for query: "${query}"` }];
   }

   const lines = results.map((m) => {
      const hotness = (m.hotness || 0).toFixed(2);
      const desc = m.description || m.content?.slice(0, 120) || '';
      return `[${hotness}] ${m.category}/${m.name}\n  ${desc}`;
   });

   return [{ type: 'text', text: `Found ${results.length} memories:\n\n${lines.join('\n\n')}` }];
}

// Execute memory-status tool
function executeMemoryStatus(): McpTextContent[] {
   const index = readIndex(MEMORY_INDEX);
   const statusText = formatStatus(index);
   return [{ type: 'text', text: statusText }];
}

// Сохраняет новую memory в файл и обновляет index
function executeMemorySave(name: string, category: MemoryCategory, description: string, content: string): McpTextContent[] {
   const key = `${category}/${name}`;
   const now = new Date().toISOString();

   // Создаём директорию категории если не существует
   const categoryDir = join(MEMORIES_DIR, category);
   if (!existsSync(categoryDir)) {
      mkdirSync(categoryDir, { recursive: true });
   }

   // Формируем frontmatter + content для файла
   const fileContent = [`---`, `name: ${name}`, `category: ${category}`, `description: ${description}`, `created: ${now}`, `updated: ${now}`, `---`, '', content].join('\n');

   const filePath = join(categoryDir, `${name}.md`);
   writeFileSync(filePath, fileContent, 'utf8');

   // Обновляем index с блокировкой
   if (!acquireLock(MEMORY_LOCK)) {
      return [{ type: 'text', text: `Memory file saved to ${filePath}, but index lock is held — index not updated.` }];
   }

   try {
      let index = readIndex(MEMORY_INDEX);
      index.memories[key] = {
         name,
         category,
         description,
         content: content.slice(0, 500),
         hotness: 0.5,
         active_count: 1,
         created: now,
         updated: now,
         source_sessions: [],
         projects: [],
      };
      index = enforceMemoryLimit(index);
      writeIndex(MEMORY_INDEX, index);
   } finally {
      releaseLock(MEMORY_LOCK);
   }

   return [{ type: 'text', text: `Memory saved: ${key}\nFile: ${filePath}` }];
}

// Сохраняет snapshot сессии из данных агента
function executeSaveSnapshot(sessionId: string, summary: string, messages?: Array<{ role: string; text: string }>): McpTextContent[] {
   if (!existsSync(SNAPSHOTS_DIR)) {
      mkdirSync(SNAPSHOTS_DIR, { recursive: true });
   }

   const lines: string[] = [`# Snapshot: ${sessionId}`, `- Date: ${new Date().toISOString()}`, `- Summary: ${summary}`, ''];

   if (messages && messages.length > 0) {
      lines.push('## Conversation', '');
      for (const msg of messages) {
         lines.push(`### ${msg.role === 'user' ? 'User' : 'Assistant'}:`, msg.text, '');
      }
   }

   const snapshotPath = join(SNAPSHOTS_DIR, `${sessionId}.md`);
   writeFileSync(snapshotPath, lines.join('\n'), 'utf8');

   return [{ type: 'text', text: `Snapshot saved: ${snapshotPath}` }];
}

// Handle `tools/call` request
function handleToolsCall(id: number | string, params: Record<string, unknown>): void {
   const toolName = params.name as string;
   const toolArgs = (params.arguments || {}) as Record<string, unknown>;

   // Обновляем счётчик вызовов для отслеживания активности
   _toolCallCount++;

   let content: McpTextContent[];

   switch (toolName) {
      case 'memory-recall': {
         const query = toolArgs.query as string;
         if (!query) {
            sendResponse({
               jsonrpc: '2.0',
               id,
               error: { code: -32602, message: 'Missing required parameter: query' },
            });
            return;
         }
         content = executeMemoryRecall(query);
         break;
      }

      case 'memory-status': {
         content = executeMemoryStatus();
         break;
      }

      case 'memory-save': {
         const name = toolArgs.name as string;
         const category = toolArgs.category as MemoryCategory;
         const description = toolArgs.description as string;
         const memContent = toolArgs.content as string;
         if (!name || !category || !description || !memContent) {
            sendResponse({
               jsonrpc: '2.0',
               id,
               error: { code: -32602, message: 'Missing required parameters: name, category, description, content' },
            });
            return;
         }
         content = executeMemorySave(name, category, description, memContent);
         break;
      }

      case 'save-snapshot': {
         const sessionId = toolArgs.sessionId as string;
         const summary = toolArgs.summary as string;
         const messages = toolArgs.messages as Array<{ role: string; text: string }> | undefined;
         // Запоминаем sessionId для обновления lastActive при завершении
         if (sessionId) _currentSessionId = sessionId;
         if (!sessionId || !summary) {
            sendResponse({
               jsonrpc: '2.0',
               id,
               error: { code: -32602, message: 'Missing required parameters: sessionId, summary' },
            });
            return;
         }
         content = executeSaveSnapshot(sessionId, summary, messages);
         break;
      }

      default: {
         sendResponse({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${toolName}` },
         });
         return;
      }
   }

   sendResponse({
      jsonrpc: '2.0',
      id,
      result: { content },
   });
}

// Handle `notifications/initialized` (no response needed)
function handleNotification(_method: string): void {
   // Notifications do not require a response
}

// Route incoming JSON-RPC request to the appropriate handler
function handleRequest(request: JsonRpcRequest): void {
   const { method, id, params } = request;

   // Notifications have no id
   if (id === undefined || id === null) {
      handleNotification(method);
      return;
   }

   switch (method) {
      case 'initialize':
         handleInitialize(id);
         break;

      case 'tools/list':
         handleToolsList(id);
         break;

      case 'tools/call':
         handleToolsCall(id, (params || {}) as Record<string, unknown>);
         break;

      default:
         sendResponse({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
         });
   }
}

// Обработчик завершения — сохраняет lastActive при SIGTERM/SIGINT
function handleShutdown(): void {
   // Если были вызовы инструментов и известен sessionId — обновляем lastActive
   if (_toolCallCount > 0 && _currentSessionId) {
      try {
         const index = readIndex(MEMORY_INDEX);
         const sessEntry = index.sessions[_currentSessionId];
         if (sessEntry) {
            sessEntry.lastActive = Date.now();
            writeFileSync(MEMORY_INDEX, JSON.stringify(index, null, 2));
         }
      } catch {
         // Не критично — молча игнорируем ошибки при завершении
      }
   }
   process.exit(0);
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// Start the MCP server: read stdin line by line, parse JSON-RPC, route to handlers
export async function startMcpServer(): Promise<void> {
   const rl = createInterface({ input: process.stdin, terminal: false });

   rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
         const request = JSON.parse(trimmed) as JsonRpcRequest;
         handleRequest(request);
      } catch {
         // Malformed JSON — send parse error if possible
         sendResponse({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error: invalid JSON' },
         });
      }
   });

   // Keep the process alive until stdin closes
   await new Promise<void>((resolve) => {
      rl.on('close', resolve);
   });
}
