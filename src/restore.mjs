/**
 * Восстановление контекста сессии из JSONL файла
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PROJECTS_DIR, SESSION_INDEX, CLAUDE_DIR, findClaudeCli } from './config.mjs';

/**
 * Ищет JSONL файл сессии во всех проектах
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
 * Извлекает переписку из JSONL файла
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

            // Очищаем системные теги
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
 * Форматирует переписку в markdown
 */
function formatAsMarkdown(messages, projectDir, sessionId) {
   const projectName = projectDir.replace(/-/g, '/').replace(/^\//, '');

   let md = `# Восстановленная сессия\n\n`;
   md += `- **Проект:** ${projectName}\n`;
   md += `- **ID:** ${sessionId}\n`;
   md += `- **Примечание:** Оригинальная сессия недоступна через --resume, контекст восстановлен из JSONL.\n\n`;
   md += `---\n\n`;
   md += `## История переписки\n\n`;

   for (const msg of messages) {
      md += msg.role === 'user' ? `### Пользователь:\n${msg.text}\n\n` : `### Ассистент:\n${msg.text}\n\n`;
   }

   md += `---\n\nВыше — восстановленная история. Продолжай работу с учётом этого контекста.\n`;
   return md;
}

export default async function restore(sessionId) {
   const found = findSessionFile(sessionId);

   if (!found) {
      console.error(`\n❌ Файл сессии ${sessionId} не найден в проектах.`);
      console.error('   Нет данных для восстановления.\n');
      process.exit(1);
   }

   console.log(`\n📂 Найден файл: ${found.path}`);

   const messages = extractConversation(found.path);
   if (messages.length === 0) {
      console.error('❌ Сессия пуста.\n');
      process.exit(1);
   }

   console.log(`📝 Извлечено ${messages.length} сообщений`);

   // Резюме
   let summary = '';
   if (existsSync(SESSION_INDEX)) {
      try {
         const index = JSON.parse(readFileSync(SESSION_INDEX, 'utf8'));
         summary = index[sessionId]?.summary || '';
      } catch {}
   }
   if (summary) console.log(`💬 Резюме: ${summary}`);

   // Сохраняем контекст
   const contextFile = join(CLAUDE_DIR, 'scripts', '.restore-context.md');
   const markdown = formatAsMarkdown(messages, found.projectDir, sessionId);
   writeFileSync(contextFile, markdown);

   // Проверяем наличие claude CLI
   const claudePath = findClaudeCli();
   if (!claudePath) {
      console.log(`\n📄 Контекст сохранён: ${contextFile}`);
      console.log('   Claude CLI не найден. Открой файл вручную в новой сессии.\n');
      process.exit(0);
   }

   console.log(`\n▶ Запускаю новую сессию с восстановленным контекстом...\n`);

   // Рабочая директория
   const projectPath = '/' + found.projectDir.replace(/^-/, '').replace(/-/g, '/');
   const cwd = existsSync(projectPath) ? projectPath : process.cwd();

   const prompt = `Прочитай файл ${contextFile} — это восстановленная история предыдущей сессии. Ознакомься с контекстом и спроси пользователя, чем помочь дальше.`;

   try {
      execSync(`claude -p "${prompt}"`, { stdio: 'inherit', cwd });
   } catch {}
}
