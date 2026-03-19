// MCP (Model Context Protocol) server for claude-sessions memory system
// STDIO transport: JSON-RPC 2.0 over stdin/stdout, one JSON per line

import { createInterface } from 'node:readline';
import { readIndex } from '../memory/index.js';
import { MEMORY_INDEX } from '../core/config.js';
import type { MemoryIndex, MemoryEntry } from '../memory/types.js';

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
   version: '1.1.1',
};

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
];

// Send a JSON-RPC response to stdout
function sendResponse(response: JsonRpcResponse): void {
   process.stdout.write(JSON.stringify(response) + '\n');
}

// Handle `initialize` request
function handleInitialize(id: number | string): void {
   sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
         protocolVersion: '2024-11-05',
         capabilities: {
            tools: {},
         },
         serverInfo: SERVER_INFO,
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

// Handle `tools/call` request
function handleToolsCall(id: number | string, params: Record<string, unknown>): void {
   const toolName = params.name as string;
   const toolArgs = (params.arguments || {}) as Record<string, unknown>;

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
