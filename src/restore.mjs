/**
 * Restore session context from JSONL file
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline';
import { PROJECTS_DIR, SESSION_INDEX, CLAUDE_DIR, findClaudeCli } from './config.mjs';
import { t } from './i18n.mjs';

/**
 * Finds session JSONL file across all projects
 */
function findSessionFile(sessionId) {
   if (!existsSync(PROJECTS_DIR)) return null;
   for (const dir of readdirSync(PROJECTS_DIR)) {
      const filePath = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
      if (existsSync(filePath)) return { path: filePath, projectDir: dir };
   }
   return null;
}

/**
 * Extracts conversation from JSONL file (streaming, memory-safe)
 */
function cleanText(text) {
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

function parseMessageFromEvent(event) {
   if ((event.type === 'user' || event.type === 'assistant') && event.message?.content) {
      const text =
         typeof event.message.content === 'string'
            ? event.message.content
            : Array.isArray(event.message.content)
              ? event.message.content
                   .filter((c) => c.type === 'text')
                   .map((c) => c.text)
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
 * Extracts conversation from JSONL: first N + last M messages (smart window)
 */
async function extractConversation(filePath, { headCount = 15, tailCount = 35 } = {}) {
   const headMessages = [];
   const tailBuffer = [];
   const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   for await (const line of rl) {
      if (!line.trim()) continue;
      try {
         const event = JSON.parse(line);
         const msg = parseMessageFromEvent(event);
         if (!msg) continue;

         if (headMessages.length < headCount) {
            headMessages.push(msg);
         } else {
            tailBuffer.push(msg);
            if (tailBuffer.length > tailCount) tailBuffer.shift();
         }
      } catch {}
   }

   // Если сообщений мало — просто всё
   if (tailBuffer.length === 0) return headMessages;

   // Объединяем: начало + разделитель + конец
   return { head: headMessages, tail: tailBuffer, totalSkipped: tailBuffer.length > 0 };
}

/**
 * Formats conversation as markdown
 */
function renderMessages(msgs) {
   return msgs.map((msg) => (msg.role === 'user' ? `### ${t('userLabel')}:\n${msg.text}\n` : `### ${t('assistantLabel')}:\n${msg.text}\n`)).join('\n');
}

function formatAsMarkdown(conversation, projectDir, sessionId, jsonlPath) {
   const projectName = projectDir.replace(/-/g, '/').replace(/^\//, '');

   let md = `# ${t('restoredSessionTitle')}\n\n`;
   md += `- **${t('projectLabel')}:** ${projectName}\n`;
   md += `- **${t('idLabel')}:** ${sessionId}\n`;
   md += `- **JSONL:** \`${jsonlPath}\`\n`;
   md += `- **Note:** ${t('restoredNote')}\n\n`;
   md += `---\n\n`;

   if (Array.isArray(conversation)) {
      // Short session — all messages
      md += `## ${t('conversationHistory')}\n\n`;
      md += renderMessages(conversation);
   } else {
      // Long session — head + gap + tail
      md += `## Beginning of session (first ${conversation.head.length} messages)\n\n`;
      md += renderMessages(conversation.head);
      md += `\n---\n\n> ... (middle messages omitted — use Read tool on JSONL file above for full history) ...\n\n---\n\n`;
      md += `## End of session (last ${conversation.tail.length} messages)\n\n`;
      md += renderMessages(conversation.tail);
   }

   md += `\n---\n\n${t('restoredFooter')}\n`;
   md += `\nIf you need to find something from the middle of the session, read the JSONL file: \`${jsonlPath}\`\n`;
   return md;
}

export default async function restore(sessionId) {
   const found = findSessionFile(sessionId);

   if (!found) {
      console.error(`\n❌ ${t('fileNotFound', sessionId)}`);
      console.error(`   ${t('noDataRestore')}\n`);
      process.exit(1);
   }

   console.log(`\n📂 ${t('foundFile', found.path)}`);

   const conversation = await extractConversation(found.path);
   const msgCount = Array.isArray(conversation) ? conversation.length : conversation.head.length + conversation.tail.length;
   if (msgCount === 0) {
      console.error(`❌ ${t('sessionEmpty')}\n`);
      process.exit(1);
   }

   console.log(`📝 ${t('extracted', msgCount)}`);

   // Summary
   let summary = '';
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         summary = index[sessionId]?.summary || '';
      } catch {}
   }
   if (summary) console.log(`💬 ${t('summary', summary)}`);

   // Save context
   const contextFile = join(CLAUDE_DIR, 'scripts', '.restore-context.md');
   const markdown = formatAsMarkdown(conversation, found.projectDir, sessionId, found.path);
   writeFileSync(contextFile, markdown);

   // Check for claude CLI
   const claudePath = findClaudeCli();
   if (!claudePath) {
      console.log(`\n${t('contextSaved', contextFile)}`);
      console.log(`   ${t('claudeNotFound')}\n`);
      process.exit(0);
   }

   console.log(`\n${t('startingRestore')}\n`);

   // Working directory
   const projectPath = '/' + found.projectDir.replace(/^-/, '').replace(/-/g, '/');
   const cwd = existsSync(projectPath) ? projectPath : process.cwd();

   const prompt = `Read the file ${contextFile} — it contains a restored conversation history from a previous session. Review the context and ask the user how to proceed.`;

   try {
      execFileSync('claude', [prompt], { stdio: 'inherit', cwd });
   } catch {}
}

// Auto-run when called directly: node restore.mjs <sessionId>
const directRun = process.argv[1]?.endsWith('restore.mjs');
if (directRun && process.argv[2]) {
   restore(process.argv[2]).catch((e) => {
      console.error(e.message);
      process.exit(1);
   });
}
