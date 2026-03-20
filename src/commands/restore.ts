/**
 * Восстановление контекста сессии из JSONL-файла.
 * Поддерживает все агенты через registry.
 */

import { readFileSync, writeFileSync, existsSync, createReadStream, renameSync } from 'fs';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';
import { SESSION_INDEX, SNAPSHOTS_DIR, findSessionJsonl } from '../core/config.js';
import { AdapterError } from '../core/errors.js';
import { t } from '../core/i18n/index.js';

/** Сообщение в диалоге */
interface ConversationMessage {
   role: 'user' | 'assistant';
   text: string;
}

/** Длинный диалог: начало + конец */
interface SplitConversation {
   head: ConversationMessage[];
   tail: ConversationMessage[];
   totalSkipped: boolean;
}

/** Событие из JSONL-файла */
interface SessionEvent {
   type?: string;
   message?: {
      content?: string | Array<{ type: string; text?: string }>;
   };
}

/** Параметры извлечения диалога */
interface ExtractOptions {
   headCount?: number;
   tailCount?: number;
}

/**
 * Очищает текст от системных тегов
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
      .trim();
}

function parseMessageFromEvent(event: SessionEvent): ConversationMessage | null {
   if ((event.type === 'user' || event.type === 'assistant') && event.message?.content) {
      const text =
         typeof event.message.content === 'string'
            ? event.message.content
            : Array.isArray(event.message.content)
              ? event.message.content
                   .filter((c) => c.type === 'text')
                   .map((c) => c.text ?? '')
                   .join('\n')
              : '';
      const clean = cleanText(text);
      if (clean && clean.length > 5) {
         return {
            role: event.type === 'user' ? 'user' : 'assistant',
            text: clean.slice(0, event.type === 'user' ? 1000 : 1500),
         };
      }
   }
   return null;
}

/**
 * Извлекает диалог из JSONL: первые N + последние M сообщений (умное окно)
 */
async function extractConversation(filePath: string, { headCount = 15, tailCount = 35 }: ExtractOptions = {}): Promise<ConversationMessage[] | SplitConversation> {
   const headMessages: ConversationMessage[] = [];
   const tailBuffer: ConversationMessage[] = [];
   const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   for await (const line of rl) {
      if (!line.trim()) continue;
      try {
         const event = JSON.parse(line) as SessionEvent;
         const msg = parseMessageFromEvent(event);
         if (!msg) continue;

         if (headMessages.length < headCount) {
            headMessages.push(msg);
         } else {
            tailBuffer.push(msg);
            if (tailBuffer.length > tailCount) tailBuffer.shift();
         }
      } catch {
         // Пропустить некорректные строки
      }
   }

   // Если сообщений мало — вернуть все
   if (tailBuffer.length === 0) return headMessages;

   // Объединить: начало + разделитель + конец
   return { head: headMessages, tail: tailBuffer, totalSkipped: tailBuffer.length > 0 };
}

/**
 * Форматирует сообщения как Markdown
 */
function renderMessages(msgs: ConversationMessage[]): string {
   return msgs.map((msg) => (msg.role === 'user' ? `### ${t('userLabel')}:\n${msg.text}\n` : `### ${t('assistantLabel')}:\n${msg.text}\n`)).join('\n');
}

/**
 * Форматирует контекст восстановления в Markdown с метаданными.
 * Единообразный формат для всех агентов.
 */
export function formatRestoreContext(
   conversation: ConversationMessage[] | SplitConversation | null,
   options: { sessionId: string; agentName: string; projectPath: string; jsonlPath?: string; summary?: string },
): string {
   const { sessionId, agentName, projectPath, jsonlPath, summary } = options;
   const createdAt = new Date().toISOString();
   const projectName = projectPath.replace(/-/g, '/').replace(/^\//, '');

   // Frontmatter с метаданными
   let md = `---\nsession: ${sessionId}\nagent: ${agentName}\nproject: ${projectPath}\ncreated: ${createdAt}\n---\n\n`;

   md += `# ${t('restoredSessionTitle')}\n\n`;
   md += `- **Session:** ${sessionId}\n`;
   md += `- **Agent:** ${agentName}\n`;
   md += `- **${t('projectLabel')}:** ${projectName}\n`;
   if (jsonlPath) md += `- **JSONL:** \`${jsonlPath}\`\n`;
   md += `- **Created:** ${createdAt}\n`;
   if (summary) md += `- **Summary:** ${summary}\n`;
   md += `- **Note:** ${t('restoredNote')}\n\n`;
   md += `---\n\n`;

   if (!conversation) {
      // Нет данных JSONL — минимальный контекст с предупреждением
      md += `> Warning: JSONL data unavailable. Minimal context only.\n\n`;
      md += `Сессия ${sessionId} для агента ${agentName} существует, но данные диалога недоступны.\n`;
      return md;
   }

   if (Array.isArray(conversation)) {
      // Короткая сессия — все сообщения
      md += `## ${t('conversationHistory')}\n\n`;
      md += renderMessages(conversation);
   } else {
      // Длинная сессия — начало + разделитель + конец
      md += `## Beginning of session (first ${conversation.head.length} messages)\n\n`;
      md += renderMessages(conversation.head);
      md += `\n---\n\n> ... (middle messages omitted — use Read tool on JSONL file above for full history) ...\n\n---\n\n`;
      md += `## End of session (last ${conversation.tail.length} messages)\n\n`;
      md += renderMessages(conversation.tail);
   }

   md += `\n---\n\n${t('restoredFooter')}\n`;
   if (jsonlPath) md += `\nIf you need to find something from the middle of the session, read the JSONL file: \`${jsonlPath}\`\n`;
   return md;
}

/**
 * Атомарная запись файла через temp + rename.
 * Предотвращает повреждение при прерывании процесса.
 */
function atomicWrite(targetPath: string, content: string): void {
   const tmpPath = targetPath + '.tmp';
   mkdirSync(dirname(targetPath), { recursive: true });
   writeFileSync(tmpPath, content, { encoding: 'utf8' });
   renameSync(tmpPath, targetPath);
}

/**
 * Проверяет, содержит ли контекстный файл ту же сессию.
 * Возвращает true если файл существует и содержит sessionId.
 */
function isSameSessionContext(contextPath: string, sessionId: string): boolean {
   if (!existsSync(contextPath)) return false;
   try {
      const content = readFileSync(contextPath, 'utf8');
      return content.includes(`session: ${sessionId}`);
   } catch {
      return false;
   }
}

// Автозапуск при запуске как скрипт
const isMain = process.argv[1]?.endsWith('restore.js');
if (isMain && process.argv[2]) {
   restore(process.argv[2]).catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
   });
}

export default async function restore(sessionId: string): Promise<void> {
   // Загрузить все сессии из registry для определения агента
   const { loadSessions } = await import('../sessions/loader.js');
   const { getAdapter } = await import('../agents/registry.js');

   // Найти сессию по id
   const sessions = await loadSessions({ limit: 1000 }).catch(() => []);
   const session = sessions.find((s) => s.id === sessionId);

   // Определить агента: из сессии или fallback на claude
   const agentId = (session?.agent ?? 'claude') as import('../agents/types.js').AgentId;
   const adapter = getAdapter(agentId);

   if (!adapter) {
      // Агент не зарегистрирован → структурированная ошибка
      throw new AdapterError({
         code: 'AGENT_NOT_INSTALLED',
         message: `Agent "${agentId}" is not installed or not recognized`,
         agentName: agentId,
         suggestion: `Убедитесь что агент ${agentId} установлен и доступен в PATH`,
      });
   }

   // Определить путь к контекстному файлу
   const projectPath = session?.projectPath ?? process.cwd();
   const contextFile = join(projectPath, '.restore-context.md');

   // Идемпотентность: переиспользовать если тот же sessionId
   if (isSameSessionContext(contextFile, sessionId)) {
      console.log(`\n${t('contextSaved', contextFile)}`);
      console.log(`   Restore context already exists, reusing\n`);

      // Попробовать запустить агент с существующим контекстом
      await launchAgentWithContext(adapter, sessionId, contextFile, projectPath);
      return;
   }

   const found = findSessionJsonl(sessionId);

   if (!found) {
      // Fallback: проверить snapshot
      const snapshotPath = join(SNAPSHOTS_DIR, `${sessionId}.md`);
      if (existsSync(snapshotPath)) {
         console.log(`\n📋 ${t('jsonlNotFoundSnapshot')}`);
         const snapshotContent = readFileSync(snapshotPath, 'utf8');
         atomicWrite(contextFile, snapshotContent);

         await launchAgentWithContext(adapter, sessionId, contextFile, projectPath);
         return;
      }

      // Ни JSONL, ни snapshot не найден — создать минимальный контекст
      console.log(`\n⚠️  JSONL недоступен — создаём минимальный контекст`);
      const minimalContext = formatRestoreContext(null, {
         sessionId,
         agentName: agentId,
         projectPath,
      });
      atomicWrite(contextFile, minimalContext);

      await launchAgentWithContext(adapter, sessionId, contextFile, projectPath);
      return;
   }

   console.log(`\n📂 ${t('foundFile', found.path)}`);

   const conversation = await extractConversation(found.path);
   const msgCount = Array.isArray(conversation) ? conversation.length : conversation.head.length + conversation.tail.length;
   if (msgCount === 0) {
      console.error(`❌ ${t('sessionEmpty')}\n`);
      process.exit(1);
   }

   console.log(`📝 ${t('extracted', msgCount)}`);

   // Summary из индекса
   let summary = '';
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as Record<string, { summary?: string }>;
         summary = index[sessionId]?.summary ?? '';
      } catch {
         // Игнорировать ошибки парсинга
      }
   }
   if (summary) console.log(`💬 ${t('summary', summary)}`);

   // Сохранить контекст (атомарная запись)
   const markdown = formatRestoreContext(conversation, {
      sessionId,
      agentName: agentId,
      projectPath,
      jsonlPath: found.path,
      summary,
   });
   atomicWrite(contextFile, markdown);

   await launchAgentWithContext(adapter, sessionId, contextFile, projectPath);
}

/**
 * Получает команду запуска агента и выполняет её.
 * Обрабатывает AGENT_NOT_INSTALLED и RESUME_NOT_SUPPORTED.
 */
async function launchAgentWithContext(
   adapter: import('../agents/types.js').AgentAdapter,
   sessionId: string,
   contextFile: string,
   projectPath: string,
): Promise<void> {
   let resumeCmd: string[] | null = null;

   try {
      resumeCmd = adapter.getResumeCommand(sessionId);
   } catch (e) {
      if (e instanceof AdapterError) {
         if (e.code === 'AGENT_NOT_INSTALLED') {
            console.log(`\n${t('contextSaved', contextFile)}`);
            console.log(`   ❌ Агент "${e.agentName}" не установлен. ${e.suggestion}\n`);
            process.exit(0);
         }
         if (e.code === 'RESUME_NOT_SUPPORTED') {
            console.log(`\n${t('contextSaved', contextFile)}`);
            console.log(`   ⚠️  Агент "${e.agentName}" не поддерживает resume. ${e.suggestion}\n`);
            process.exit(0);
         }
      }
      throw e;
   }

   if (!resumeCmd) {
      console.log(`\n${t('contextSaved', contextFile)}`);
      console.log(`   ${t('claudeNotFound')}\n`);
      process.exit(0);
   }

   console.log(`\n${t('startingRestore')}\n`);

   const cwd = existsSync(projectPath) ? projectPath : process.cwd();
   const prompt = `Read the file ${contextFile} — it contains a restored conversation history from a previous session. Review the context and ask the user how to proceed.`;

   try {
      const [cmd, ...cmdArgs] = resumeCmd;
      if (!cmd) throw new Error('resumeCmd is empty');
      execFileSync(cmd, [...cmdArgs, prompt], { stdio: 'inherit', cwd });
   } catch (e: unknown) {
      // Код выхода != 0 при штатном завершении — не ошибка
      const isExitError = e instanceof Error && 'status' in e;
      if (!isExitError) {
         const msg = e instanceof Error ? e.message : String(e);
         console.error(`\n❌ ${t('restoreCliError', msg)}\n`);
      }
   }
}
