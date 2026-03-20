/**
 * AI summarization of sessions without descriptions.
 * Uses any available LLM CLI (claude, codex, qwen, gemini) to generate summaries.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { SESSION_INDEX, PROJECTS_DIR, ensureClaudeDir, findClaudeCli } from '../core/config.js';
import { t } from '../core/i18n.js';
import { loadSessions, writeSessionIndex } from '../sessions/loader.js';
import { writeSessionCache } from '../sessions/cache.js';

/** "Bad" summaries — indicating no real description */
const BAD_SUMMARIES = ['/mcp', '/exit', '/login', '/clear', '/chrome', 'sessions', '/terminal-setup', '/init', '/ide', '/config'];

/** Session index entry structure */
interface SessionIndexEntry {
   sessionId?: string;
   summary?: string;
   lastActive?: number;
   [key: string]: unknown;
}

/** Summarization result */
interface SummaryResult {
   id: string;
   summary: string;
}

/** LLM CLI configuration for different agents */
interface LlmCliConfig {
   name: string;
   bin: string;
   args: string[];
}

/** Find any available LLM CLI for summarization */
function findAvailableLlm(): LlmCliConfig | null {
   // Priority: claude > codex > qwen > gemini
   const claudeBin = findClaudeCli();
   if (claudeBin) {
      return { name: 'Claude', bin: claudeBin, args: ['--print', '--output-format', 'text', '--model', 'haiku'] };
   }

   // Codex
   const codexCandidates = ['/usr/local/bin/codex', '/opt/homebrew/bin/codex'];
   for (const c of codexCandidates) {
      if (existsSync(c)) return { name: 'Codex', bin: c, args: ['--print', '--model', 'gpt-4o-mini'] };
   }

   // Qwen
   const qwenCandidates = ['/usr/local/bin/qwen', '/opt/homebrew/bin/qwen'];
   for (const c of qwenCandidates) {
      if (existsSync(c)) return { name: 'Qwen', bin: c, args: ['--print'] };
   }

   // Gemini
   const geminiCandidates = ['/usr/local/bin/gemini', '/opt/homebrew/bin/gemini'];
   for (const c of geminiCandidates) {
      if (existsSync(c)) return { name: 'Gemini', bin: c, args: ['--print'] };
   }

   return null;
}

/** Event from a session JSONL file */
interface SessionEvent {
   type?: string;
   message?: {
      content?: string | Array<{ type: string; text?: string }>;
   };
}

/** Extract user messages from a Claude-format JSONL file */
function extractClaudeMessages(projectPath: string, sessionId: string): string[] | null {
   const projectDirName = projectPath.replace(/\//g, '-');
   const projectDir = join(PROJECTS_DIR, projectDirName);
   const sessionFile = join(projectDir, `${sessionId}.jsonl`);
   if (!existsSync(sessionFile)) return null;

   try {
      const content = readFileSync(sessionFile, 'utf8');
      const lines = content.split('\n');
      const messages: string[] = [];

      for (const line of lines) {
         if (!line.trim()) continue;
         try {
            const event = JSON.parse(line) as SessionEvent;
            if ((event.type === 'user' || event.type === 'human') && event.message?.content) {
               const text =
                  typeof event.message.content === 'string'
                     ? event.message.content
                     : Array.isArray(event.message.content)
                       ? event.message.content
                            .filter((c) => c.type === 'text')
                            .map((c) => c.text ?? '')
                            .join(' ')
                       : '';
               const clean = text.replace(/\n/g, ' ').replace(/<[^>]+>/g, '').trim();
               if (clean && clean.length > 5) {
                  messages.push(clean.slice(0, 200));
                  if (messages.length >= 8) break;
               }
            }
         } catch {
            // Skip invalid lines
         }
      }
      return messages.length > 0 ? messages : null;
   } catch {
      return null;
   }
}

function needsSummary(sessionId: string, index: Record<string, SessionIndexEntry>): boolean {
   const entry = index[sessionId];
   if (!entry) return true;

   // Если ранее помечена как неанализируемая — пропускаем
   if (entry.summary === '__no_data__') return false;

   const existing = entry.summary;
   if (!existing) return true;
   if (BAD_SUMMARIES.some((b) => existing.toLowerCase().startsWith(b.toLowerCase()))) return true;
   if (existing.length < 10) return true;
   return false;
}

export default async function summarize(args: string[] = []): Promise<void> {
   ensureClaudeDir();

   let limit = 15;
   let targetSession: string | null = null;

   for (let i = 0; i < args.length; i++) {
      if (args[i] === '--limit' && args[i + 1] !== undefined) {
         limit = parseInt(args[i + 1] ?? '');
         i++;
      } else if (args[i] === '--session' && args[i + 1] !== undefined) {
         targetSession = args[i + 1] ?? null;
         i++;
      }
   }

   // Load index
   let index: Record<string, SessionIndexEntry> = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8')) as Record<string, SessionIndexEntry>;
      } catch {
         // Ignore parse errors
      }
   }

   // Load sessions from ALL agents
   const allSessions = await loadSessions({ limit: 500 });

   let sessions = targetSession
      ? allSessions.filter((s) => s.id.startsWith(targetSession!))
      : allSessions.filter((s) => needsSummary(s.id, index));

   sessions = sessions.slice(0, limit);

   if (sessions.length === 0) {
      console.log(`\n✅ ${t('allSummarized')}\n`);
      return;
   }

   // Prepare data — use summary from session loader as fallback context
   let sessionsData = 'SESSIONS_START\n';
   let count = 0;

   // Множество реальных ID для валидации ответа LLM
   const validIds = new Set<string>();

   for (const s of sessions) {
      // Извлекаем сообщения из JSONL (работает для Claude-сессий)
      const messages = s.projectPath ? extractClaudeMessages(s.projectPath, s.id) : null;
      const project = s.project || 'unknown';
      const date = s.dateStr;

      // Если нет ни JSONL-сообщений, ни осмысленного summary — помечаем как неанализируемую
      const hasMeaningfulSummary =
         s.summary && s.summary.length > 5 && !BAD_SUMMARIES.some((b) => s.summary.toLowerCase().startsWith(b.toLowerCase()));
      if (!messages && !hasMeaningfulSummary) {
         index[s.id] = {
            ...index[s.id],
            sessionId: s.id,
            summary: '__no_data__',
            lastActive: index[s.id]?.lastActive || Date.now(),
         };
         continue;
      }

      sessionsData += `---SESSION:${s.id}---\n`;
      sessionsData += `Agent: ${s.agent} | Project: ${project} | Date: ${date}\n`;

      if (messages) {
         messages.forEach((m, i) => (sessionsData += `${i + 1}. ${m}\n`));
      } else if (hasMeaningfulSummary) {
         // Используем первое сообщение из загрузчика как контекст
         sessionsData += `1. ${s.summary}\n`;
      }
      validIds.add(s.id);
      count++;
   }
   sessionsData += 'SESSIONS_END';

   if (count === 0) {
      // Сохраняем index с пометками __no_data__ даже если нечего отправлять в LLM
      writeSessionIndex(index);
      console.log(`\n✅ ${t('allSummarized')}\n`);
      return;
   }

   console.log(`\n📝 ${t('foundForAnalysis', count)}\n`);

   // Find any available LLM CLI
   const llm = findAvailableLlm();
   if (!llm) {
      console.error(`❌ ${t('claudeNotInstalled')}`);
      console.log(`   ${t('summarizeLlmNotFound')}`);
      console.log(`\n${t('sessionData')}\n`);
      console.log(sessionsData);
      return;
   }

   console.log(`${t('launchingSummarize')} (${llm.name})\n`);

   const prompt = `You are a helper for generating short summaries of AI coding sessions.

Here is the session data:

${sessionsData}

For EACH session (between ---SESSION:ID--- markers):
1. Read the user messages
2. Determine the essence: what was done, what task was being solved
3. ${t('summaryLangHint')}

IMPORTANT: Return the EXACT full session ID from the ---SESSION:ID--- marker. Do NOT truncate or modify the ID.

Return ONLY a JSON array, no other text:
[{"id": "session-id", "summary": "short summary"}]

Good summaries: "Fix NaN channelId in player", "Configure MCP servers", "CSS fixes for Telegram MiniApp"
Bad: "/mcp", "/login", "Short session"`;

   try {
      const proc = spawnSync(llm.bin, [...llm.args], {
         input: prompt,
         encoding: 'utf8',
         timeout: 120_000,
         maxBuffer: 1024 * 1024,
      });

      if (proc.error) throw proc.error;
      if (proc.status !== 0) throw new Error(proc.stderr || `${llm.name} CLI failed`);

      const output = proc.stdout || '';

      // Parse JSON array from response
      const match = output.match(/\[[\s\S]*\]/);
      if (!match) {
         console.error(`❌ ${t('summarizeFailed', `Could not parse ${llm.name} response`)}`);
         return;
      }

      const summaries = JSON.parse(match[0]) as SummaryResult[];
      if (!Array.isArray(summaries)) throw new Error('Response is not an array');

      // Резолвим ID из ответа LLM — точное совпадение или prefix-match
      const resolveId = (rawId: string): string | null => {
         if (validIds.has(rawId)) return rawId;
         // LLM мог обрезать ID — ищем по префиксу (минимум 8 символов)
         if (rawId.length >= 8) {
            for (const vid of validIds) {
               if (vid.startsWith(rawId) || rawId.startsWith(vid)) return vid;
            }
         }
         return null;
      };

      // Сохраняем summary в index
      let saved = 0;
      let skipped = 0;
      for (const s of summaries) {
         if (!s.id || !s.summary) continue;
         const resolvedId = resolveId(s.id);
         if (!resolvedId) {
            skipped++;
            continue;
         }
         const summary = s.summary.replace(/\n/g, ' ').trim().slice(0, 65);
         if (summary.length < 5) continue;
         index[resolvedId] = {
            ...index[resolvedId],
            sessionId: resolvedId,
            summary,
            lastActive: index[resolvedId]?.lastActive || Date.now(),
         };
         // Убираем из validIds чтобы отследить непокрытые сессии
         validIds.delete(resolvedId);
         saved++;
         console.log(`   ✅ ${resolvedId.slice(0, 8)}: ${summary}`);
      }

      // Сессии, для которых LLM не вернул summary — помечаем чтобы не повторять
      for (const missedId of validIds) {
         if (!index[missedId]?.summary || index[missedId]?.summary === '__no_data__') {
            index[missedId] = {
               ...index[missedId],
               sessionId: missedId,
               summary: '__no_data__',
               lastActive: index[missedId]?.lastActive || Date.now(),
            };
         }
      }

      if (skipped > 0) {
         console.log(`   ⚠️  ${t('summarizeIdMismatch', skipped)}`);
      }

      // Сохраняем в оба индекса (legacy + unified)
      writeSessionIndex(index);

      // Invalidate session cache so next list/picker picks up new summaries
      writeSessionCache([]);

      console.log(`\n✅ ${t('summarizeComplete', saved)}`);
   } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown error';
      console.error(`\n❌ ${t('summarizeFailed', message)}`);
   }
}
