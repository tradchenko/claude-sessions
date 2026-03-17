/**
 * AI-суммаризация сессий без описания.
 * Извлекает данные и запускает claude для генерации резюме.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';
import { execSync } from 'child_process';
import { HISTORY_FILE, PROJECTS_DIR, SESSION_INDEX, CLAUDE_DIR, ensureClaudeDir, findClaudeCli } from './config.mjs';

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

   // Загружаем индекс
   let index = {};
   if (existsSync(SESSION_INDEX)) {
      try {
         index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
      } catch {}
   }

   // Загружаем историю
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
      console.log('\n✅ Все сессии уже имеют осмысленные AI-резюме!\n');
      return;
   }

   // Формируем данные для claude
   let sessionsData = `SESSIONS_START\n`;
   let count = 0;

   for (const s of sessions) {
      const messages = extractMessages(s.project, s.id);
      if (!messages) continue;
      const project = s.project.split('/').pop() || 'unknown';
      const date = new Date(s.ts).toLocaleDateString('ru-RU');
      sessionsData += `---SESSION:${s.id}---\n`;
      sessionsData += `Проект: ${project} | Дата: ${date}\n`;
      messages.forEach((m, i) => (sessionsData += `${i + 1}. ${m}\n`));
      count++;
   }
   sessionsData += `SESSIONS_END`;

   console.log(`\n📝 Найдено ${count} сессий для AI-анализа.\n`);

   // Проверяем наличие claude
   const claudePath = findClaudeCli();
   if (!claudePath) {
      console.error('❌ Claude CLI не найден. Установи: https://docs.anthropic.com/en/docs/claude-code');
      console.log('\nДанные сессий:\n');
      console.log(sessionsData);
      return;
   }

   // Определяем путь к save-summary скрипту
   const saveSummaryPath = join(CLAUDE_DIR, 'scripts', 'save-summary.mjs');
   // Если скрипт не установлен — используем встроенный
   const saveCmd = existsSync(saveSummaryPath)
      ? `node ${saveSummaryPath}`
      : `node ${join(new URL('.', import.meta.url).pathname, 'save-summary-inline.mjs')}`;

   console.log('Запускаю Claude для генерации резюме...\n');

   const prompt = `Ты — помощник для генерации кратких резюме сессий Claude Code.

Вот данные сессий:

${sessionsData}

Для КАЖДОЙ сессии (между маркерами ---SESSION:ID---):
1. Прочитай сообщения пользователя
2. Определи суть: что делали, какую задачу решали
3. Сгенерируй краткое резюме на русском (1 строка, до 70 символов)
4. Сохрани: ${saveCmd} --session "ID" --summary "текст"

Хорошие резюме: "Фикс NaN channelId в плеере", "Настройка MCP серверов", "CSS фиксы для Telegram MiniApp"
Плохие: "/mcp", "/login", "Короткая сессия"

Выполни сохранение для КАЖДОЙ сессии.`;

   try {
      execSync(`claude -p "${prompt.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
   } catch {}
}
