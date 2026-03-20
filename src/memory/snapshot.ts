/**
 * Сохранение conversation snapshot при завершении сессии.
 * Snapshot содержит первые 15 + последние 35 сообщений в markdown формате.
 * Используется для восстановления сессии если JSONL файл будет удалён.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/** Сообщение из JSONL */
interface ConversationMessage {
   role: 'user' | 'assistant';
   text: string;
}

/** Content block из JSONL event */
interface ContentBlock {
   type: string;
   text?: string;
}

/** Event из JSONL файла сессии */
interface SessionEvent {
   type?: string;
   message?: {
      content?: string | ContentBlock[];
   };
}

/** Количество сообщений для snapshot */
const HEAD_COUNT = 15;
const TAIL_COUNT = 35;

/**
 * Очищает текст от системных тегов (system-reminder и пр.)
 */
function cleanText(text: string): string {
   return text
      .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
      .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
      .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
      .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
      .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
      .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
      .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
      .replace(/<context_window_protection>[\s\S]*?<\/context_window_protection>/g, '')
      .replace(/<context_guidance>[\s\S]*?<\/context_guidance>/g, '')
      .trim();
}

/**
 * Извлекает текст из content поля event
 */
function extractText(content: string | ContentBlock[]): string {
   if (typeof content === 'string') return content;
   if (Array.isArray(content)) {
      return content
         .filter((b) => b.type === 'text')
         .map((b) => b.text ?? '')
         .join('\n');
   }
   return '';
}

/**
 * Парсит сообщение из JSONL event
 */
function parseMessage(event: SessionEvent): ConversationMessage | null {
   const isHuman = event.type === 'human' || event.type === 'user';
   const isAssistant = event.type === 'assistant';
   if (!isHuman && !isAssistant) return null;
   if (!event.message?.content) return null;

   const raw = extractText(event.message.content);
   const text = cleanText(raw);
   if (!text || text.length < 5) return null;

   // Ограничиваем длину сообщения
   const maxLen = isHuman ? 1000 : 1500;
   return {
      role: isHuman ? 'user' : 'assistant',
      text: text.slice(0, maxLen),
   };
}

/**
 * Парсит JSONL файл и извлекает сообщения (head + tail)
 */
function extractMessages(jsonlPath: string): { head: ConversationMessage[]; tail: ConversationMessage[]; totalCount: number } {
   const content = readFileSync(jsonlPath, 'utf8');
   const lines = content.split('\n').filter(Boolean);

   const head: ConversationMessage[] = [];
   const tailBuffer: ConversationMessage[] = [];
   let totalCount = 0;

   for (const line of lines) {
      try {
         const event = JSON.parse(line) as SessionEvent;
         const msg = parseMessage(event);
         if (!msg) continue;

         totalCount++;
         if (head.length < HEAD_COUNT) {
            head.push(msg);
         } else {
            tailBuffer.push(msg);
            if (tailBuffer.length > TAIL_COUNT) tailBuffer.shift();
         }
      } catch {
         // Пропускаем невалидные строки
      }
   }

   return { head, tail: tailBuffer, totalCount };
}

/**
 * Рендерит массив сообщений в markdown
 */
function renderMessages(msgs: ConversationMessage[]): string {
   return msgs.map((msg) => `### ${msg.role === 'user' ? 'User' : 'Assistant'}:\n${msg.text}\n`).join('\n');
}

/**
 * Формирует markdown snapshot
 */
function formatSnapshot(sessionId: string, projectDir: string, head: ConversationMessage[], tail: ConversationMessage[], totalCount: number): string {
   const skipped = totalCount - head.length - tail.length;
   let md = `# Snapshot: ${sessionId}\n`;
   md += `- Project: ${projectDir}\n`;
   md += `- Date: ${new Date().toISOString()}\n`;
   md += `- Messages: ${totalCount}\n\n`;

   if (tail.length === 0) {
      // Короткая сессия — все сообщения в head
      md += `## Conversation\n\n`;
      md += renderMessages(head);
   } else {
      md += `## First ${head.length} messages\n\n`;
      md += renderMessages(head);

      if (skipped > 0) {
         md += `\n---\n> ... (${skipped} messages omitted) ...\n---\n\n`;
      } else {
         md += `\n---\n\n`;
      }

      md += `## Last ${tail.length} messages\n\n`;
      md += renderMessages(tail);
   }

   return md;
}

/**
 * Сохраняет conversation snapshot для указанной сессии.
 * Вызывается из stop hook после L0 extraction.
 */
export function saveSessionSnapshot(sessionId: string, jsonlPath: string, projectDir: string): void {
   if (!existsSync(jsonlPath)) return;

   const { head, tail, totalCount } = extractMessages(jsonlPath);
   if (totalCount === 0) return;

   const markdown = formatSnapshot(sessionId, projectDir, head, tail, totalCount);

   // Создаём директорию snapshots если не существует
   const snapshotsDir = join(homedir(), '.claude', 'session-memory', 'snapshots');
   if (!existsSync(snapshotsDir)) {
      mkdirSync(snapshotsDir, { recursive: true });
   }

   const snapshotPath = join(snapshotsDir, `${sessionId}.md`);
   writeFileSync(snapshotPath, markdown);
}
