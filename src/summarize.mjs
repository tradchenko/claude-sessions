/**
 * AI summarization of sessions without descriptions.
 * Extracts data and runs claude to generate summaries.
 */

import { readFileSync, readdirSync, existsSync, createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { HISTORY_FILE, PROJECTS_DIR, SESSION_INDEX, CLAUDE_DIR, ensureClaudeDir, findClaudeCli } from './config.mjs';
import { t } from './i18n.mjs';

const BAD_SUMMARIES = ['/mcp', '/exit', '/login', '/clear', '/chrome', 'sessions', '/terminal-setup', '/init', '/ide', '/config'];

function needsSummary(sessionId, index) {
   const existing = index[sessionId]?.summary;
   if (!existing) return true;
   if (BAD_SUMMARIES.some((b) => existing.toLowerCase().startsWith(b.toLowerCase()))) return true;
   if (existing.length < 10) return true;
   return false;
}

function extractMessages(projectPath, sessionId) {
   const projectDirName = projectPath.replace(/\//g, '-');
   const projectDir = join(PROJECTS_DIR, projectDirName);
   const sessionFile = join(projectDir, `${sessionId}.jsonl`);
   if (!existsSync(sessionFile)) return null;

   try {
      const content = readFileSync(sessionFile, 'utf8');
      const lines = content.split('\n');
      const messages = [];

      for (const line of lines) {
         if (!line.trim()) continue;
         try {
            const event = JSON.parse(line);
            if (event.type === 'user' && event.message?.content) {
               const text =
                  typeof event.message.content === 'string'
                     ? event.message.content
                     : Array.isArray(event.message.content)
                       ? event.message.content
                            .filter((c) => c.type === 'text')
                            .map((c) => c.text)
                            .join(' ')
                       : '';
               const clean = text
                  .replace(/\n/g, ' ')
                  .replace(/<[^>]+>/g, '')
                  .trim();
               if (clean && clean.length > 5) {
                  messages.push(clean.slice(0, 200));
                  if (messages.length >= 8) break;
               }
            }
         } catch {}
      }
      return messages.length > 0 ? messages : null;
   } catch {
      return null;
   }
}

export default async function summarize(args = []) {
   ensureClaudeDir();

   let limit = 15;
   let targetSession = null;

   for (let i = 0; i < args.length; i++) {
      if (args[i] === '--limit' && args[i + 1]) {
         limit = parseInt(args[i + 1]);
         i++;
      } else if (args[i] === '--session' && args[i + 1]) {
         targetSession = args[i + 1];
         i++;
      }
   }

   // Load index
   let index = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
      } catch {}
   }

   // Load history
   const rl = createInterface({
      input: createReadStream(HISTORY_FILE, { encoding: 'utf8' }),
      crlfDelay: Infinity,
   });

   const sessionsMap = new Map();
   for await (const line of rl) {
      if (!line.trim()) continue;
      try {
         const e = JSON.parse(line);
         if (!e.sessionId) continue;
         if (!sessionsMap.has(e.sessionId)) {
            sessionsMap.set(e.sessionId, { id: e.sessionId, project: e.project || '', ts: e.timestamp });
         } else {
            sessionsMap.get(e.sessionId).ts = Math.max(sessionsMap.get(e.sessionId).ts, e.timestamp);
         }
      } catch {}
   }

   let sessions = Array.from(sessionsMap.values()).sort((a, b) => b.ts - a.ts);

   if (targetSession) {
      sessions = sessions.filter((s) => s.id.startsWith(targetSession));
   } else {
      sessions = sessions.filter((s) => needsSummary(s.id, index));
   }

   sessions = sessions.slice(0, limit);

   if (sessions.length === 0) {
      console.log(`\n✅ ${t('allSummarized')}\n`);
      return;
   }

   // Prepare data for claude
   let sessionsData = `SESSIONS_START\n`;
   let count = 0;

   for (const s of sessions) {
      const messages = extractMessages(s.project, s.id);
      if (!messages) continue;
      const project = s.project.split('/').pop() || 'unknown';
      const date = new Date(s.ts).toLocaleDateString('en-US');
      sessionsData += `---SESSION:${s.id}---\n`;
      sessionsData += `Project: ${project} | Date: ${date}\n`;
      messages.forEach((m, i) => (sessionsData += `${i + 1}. ${m}\n`));
      count++;
   }
   sessionsData += `SESSIONS_END`;

   console.log(`\n📝 ${t('foundForAnalysis', count)}\n`);

   // Check for claude
   const claudePath = findClaudeCli();
   if (!claudePath) {
      console.error(`❌ ${t('claudeNotInstalled')}`);
      console.log(`\n${t('sessionData')}\n`);
      console.log(sessionsData);
      return;
   }

   // Determine path to save-summary script
   const saveSummaryPath = join(CLAUDE_DIR, 'scripts', 'save-summary.mjs');
   const __dirname = dirname(fileURLToPath(import.meta.url));
   const builtinSaveSummary = join(__dirname, 'save-summary-hook.mjs');
   const saveCmd = existsSync(saveSummaryPath) ? `node ${saveSummaryPath}` : `node ${builtinSaveSummary}`;

   console.log(`${t('launchingSummarize')}\n`);

   const prompt = `You are a helper for generating short summaries of Claude Code sessions.

Here is the session data:

${sessionsData}

For EACH session (between ---SESSION:ID--- markers):
1. Read the user messages
2. Determine the essence: what was done, what task was being solved
3. ${t('summaryLangHint')}
4. Save: ${saveCmd} --session "ID" --summary "text"

Good summaries: "Fix NaN channelId in player", "Configure MCP servers", "CSS fixes for Telegram MiniApp"
Bad: "/mcp", "/login", "Short session"

Execute save for EACH session.`;

   try {
      execFileSync('claude', ['-p', prompt], { stdio: 'inherit' });
      console.log(`\n✅ ${t('summarizeComplete', count)}`);
   } catch (e) {
      console.error(`\n❌ ${t('summarizeFailed', e.message || 'unknown error')}`);
   }
}
