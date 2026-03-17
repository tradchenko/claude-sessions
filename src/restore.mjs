/**
 * Restore session context from JSONL file
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
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
 * Extracts conversation from JSONL file
 */
function extractConversation(filePath, maxMessages = 50) {
   const content = readFileSync(filePath, 'utf8');
   const lines = content.split('\n');
   const messages = [];

   for (const line of lines) {
      if (!line.trim()) continue;
      try {
         const event = JSON.parse(line);
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

            // Clean up system tags
            const clean = text
               .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
               .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
               .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
               .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
               .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
               .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
               .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '')
               .trim();

            if (clean && clean.length > 5) {
               messages.push({
                  role: event.type === 'user' ? 'user' : 'assistant',
                  text: clean.slice(0, event.type === 'user' ? 1000 : 1500),
               });
            }
         }
      } catch {}
   }

   return messages.slice(0, maxMessages);
}

/**
 * Formats conversation as markdown
 */
function formatAsMarkdown(messages, projectDir, sessionId) {
   const projectName = projectDir.replace(/-/g, '/').replace(/^\//, '');

   let md = `# ${t('restoredSessionTitle')}\n\n`;
   md += `- **${t('projectLabel')}:** ${projectName}\n`;
   md += `- **${t('idLabel')}:** ${sessionId}\n`;
   md += `- **Note:** ${t('restoredNote')}\n\n`;
   md += `---\n\n`;
   md += `## ${t('conversationHistory')}\n\n`;

   for (const msg of messages) {
      md += msg.role === 'user' ? `### ${t('userLabel')}:\n${msg.text}\n\n` : `### ${t('assistantLabel')}:\n${msg.text}\n\n`;
   }

   md += `---\n\n${t('restoredFooter')}\n`;
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

   const messages = extractConversation(found.path);
   if (messages.length === 0) {
      console.error(`❌ ${t('sessionEmpty')}\n`);
      process.exit(1);
   }

   console.log(`📝 ${t('extracted', messages.length)}`);

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
   const markdown = formatAsMarkdown(messages, found.projectDir, sessionId);
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
      execFileSync('claude', ['-p', prompt], { stdio: 'inherit', cwd });
   } catch {}
}
