// L0 extraction: quick metadata extraction from session (files, brief summary)
import type { ChatMessage, L0Data } from './types.js';

// Regex для поиска путей к файлам в тексте (e.g. src/foo.mjs, ./bar/baz.ts, package.json)
const FILE_PATH_RE = /(?:^|[\s`"'(])([.\w/-]+\.\w{1,10})(?=[\s`"'),;:]|$)/gm;
const MAX_SUMMARY_LEN = 120;

// Паттерны для извлечения tool invocations / команд из текста
const TOOL_USE_RE = /```(?:bash|sh|shell)\s*([\s\S]*?)```/gm;
const BASH_CMD_RE = /\$\s+([\w./][\w./-]*(?:\s+[\w./-]+)*)/gm;

// Паттерны для извлечения строк ошибок
const ERROR_RE = /(?:Error|error|ERROR|exception|Exception|FATAL|fatal|failed|Failed|FAILED):\s*(.{10,120})/gm;

export function extractFilePaths(text: string): string[] {
   const matches = new Set<string>();
   for (const m of text.matchAll(FILE_PATH_RE)) {
      const path = m[1];
      if (path && (path.includes('/') || path.includes('.'))) matches.add(path);
   }
   return [...matches].filter((p) => !p.startsWith('http') && !p.startsWith('//'));
}

/** Извлечь команды из bash-блоков и $ ... строк */
export function extractCommands(text: string): string[] {
   const cmds = new Set<string>();
   for (const m of text.matchAll(TOOL_USE_RE)) {
      const block = m[1]?.trim();
      if (block) {
         // Берём первую строку каждого блока как команду
         const firstLine = block.split('\n')[0]?.trim();
         if (firstLine) cmds.add(firstLine.slice(0, 80));
      }
   }
   for (const m of text.matchAll(BASH_CMD_RE)) {
      const cmd = m[1]?.trim();
      if (cmd) cmds.add(cmd.slice(0, 80));
   }
   return [...cmds].slice(0, 20);
}

/** Извлечь строки ошибок из текста */
export function extractErrors(text: string): string[] {
   const errors = new Set<string>();
   for (const m of text.matchAll(ERROR_RE)) {
      const msg = m[1]?.trim();
      if (msg) errors.add(msg.slice(0, 120));
   }
   return [...errors].slice(0, 10);
}

export function extractL0FromMessages(messages: ChatMessage[], project: string, agentId?: string): L0Data {
   if (!messages.length) return { summary: '', project, messageCount: 0, files: [], topics: [], agent: agentId };

   const firstUser = messages.find((m) => m.role === 'user');
   const summary = firstUser ? firstUser.content.replace(/\n/g, ' ').trim().slice(0, MAX_SUMMARY_LEN) : '';

   const files = new Set<string>();
   const commands = new Set<string>();
   const errors = new Set<string>();

   // Для вычисления duration — собираем timestamps (если сообщения имеют ts)
   // Базовый вариант: используем Date.now() как timestamp (перезаписывается парсерами агентов)
   for (const msg of messages) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      for (const f of extractFilePaths(text)) files.add(f);
      for (const c of extractCommands(text)) commands.add(c);
      for (const e of extractErrors(text)) errors.add(e);
   }

   return {
      summary,
      project,
      messageCount: messages.length,
      files: [...files].slice(0, 20),
      timestamp: Date.now(),
      agent: agentId,
      commands: commands.size > 0 ? [...commands] : undefined,
      errors: errors.size > 0 ? [...errors] : undefined,
   };
}

/** Content block from JSONL (text block) */
interface ContentBlock {
   type: string;
   text?: string;
}

/** Event from a session JSONL file */
interface JSONLEvent {
   type: string;
   message?: {
      content: string | ContentBlock[];
   };
}

export function extractL0FromJSONL(lines: string[], project: string): L0Data {
   const messages: ChatMessage[] = [];
   for (const line of lines) {
      try {
         const event = JSON.parse(line) as JSONLEvent;
         if (event.type === 'human' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
            messages.push({ role: 'user', content: text });
         }
         if (event.type === 'assistant' && event.message?.content) {
            const text =
               typeof event.message.content === 'string'
                  ? event.message.content
                  : (event.message.content as ContentBlock[]).filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ');
            messages.push({ role: 'assistant', content: text });
         }
      } catch {
         // Skip malformed lines
      }
   }
   return extractL0FromMessages(messages, project);
}
