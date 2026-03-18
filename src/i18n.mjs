/**
 * Internationalization module.
 * Auto-detects system language, falls back to English.
 * Supported: en, ru, es, fr, de, zh, ja, ko, pt, tr
 */

import { platform } from 'os';
import { execSync } from 'child_process';

const translations = {
   en: {
      today: 'today',
      yesterday: 'yesterday',
      daysAgo: (n) => `${n} days ago`,
      noDescription: '(no description)',
      msgs: (n) => `(${n} msgs)`,
      noSessionsFound: 'No sessions found.',
      recentSessions: (n) => `Recent Claude Code sessions (${n})`,
      searchResults: (q, n) => `Search results for "${q}" (${n})`,
      commands: 'Commands:',
      interactivePicker: 'interactive picker',
      searchByContent: 'search by content',
      filterByProject: 'filter by project',
      showMore: 'show more',
      aiSummaries: 'AI summaries',
      // TUI
      navigate: 'navigate',
      open: 'open',
      delete_: 'delete',
      aiSummary: 'AI summary',
      refresh: 'refresh',
      quit: 'quit',
      confirmDelete: (date, project, summary) => `Delete [${date}] ${project} — ${summary}? (Y/n)`,
      sessionDeleted: 'Session deleted',
      refreshing: 'Refreshing...',
      refreshed: (n) => `Refreshed (${n})`,
      launchingAI: 'Launching AI session analysis...',
      sessionNotFound: 'Session not found via --resume. Restoring from JSONL...',
      errorTTY: 'Error: interactive terminal required.',
      sessionNotFoundNum: (n) => `Session #${n} not found.`,
      // Install
      installing: 'Installing claude-sessions...',
      terminal: 'Terminal',
      warpNote: 'Warp: TUI picker uses Node.js (not fzf) for compatibility',
      companionNote: 'The Companion detected — /sessions will work via WebSocket',
      slashCommands: 'Slash commands:',
      scripts: 'Scripts:',
      hooks: 'Hooks:',
      existingSessions: 'Existing sessions:',
      alreadyExists: 'already exists, skipping',
      alreadyInstalled: 'already installed',
      settingsNotFound: 'settings.json not found — hook not installed',
      failedSettings: (e) => `Failed to update settings.json: ${e}`,
      historyEmpty: 'Session history is empty. Run Claude Code to create your first sessions.',
      noSessionsInstall: 'No sessions found.',
      sessionsFound: (n) => `Sessions found: ${n}`,
      projects: (n, list) => `Projects: ${n} (${list})`,
      period: (from, to) => `Period: ${from} — ${to}`,
      withSummary: (n, total) => `With AI summary: ${n}/${total}`,
      withoutDesc: (n) => `${n} sessions without description.`,
      runSummarize: 'Run: claude-sessions summarize',
      installComplete: 'Installation complete!',
      usage: 'Usage:',
      // Delete
      deleting: (id) => `Deleting session ${id}...`,
      invalidId: (id) => `Invalid session ID: ${id}`,
      expectedUUID: 'Expected UUID format (e.g., 836a4e7d-bddc-41ce-a8fb-7856d7aa392c)',
      historyCleaned: 'history.jsonl cleaned',
      indexCleaned: 'session-index.json cleaned',
      removed: (f) => `Removed ${f}`,
      sessionDeletedFull: (id) => `Session ${id} deleted`,
      // Restore
      fileNotFound: (id) => `Session file ${id} not found in projects.`,
      noDataRestore: 'No data available for restoration.',
      foundFile: (p) => `Found file: ${p}`,
      extracted: (n) => `Extracted ${n} messages`,
      summary: (s) => `Summary: ${s}`,
      sessionEmpty: 'Session is empty.',
      contextSaved: (f) => `Context saved: ${f}`,
      claudeNotFound: 'Claude CLI not found. Open this file manually in a new session.',
      startingRestore: 'Starting new session with restored context...',
      // Summarize
      allSummarized: 'All sessions already have meaningful AI summaries!',
      foundForAnalysis: (n) => `Found ${n} sessions for AI analysis.`,
      claudeNotInstalled: 'Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code',
      sessionData: 'Session data:',
      launchingSummarize: 'Launching Claude for summary generation...',
      // Summarize prompt language hint
      summaryLangHint: 'Generate a short summary in English (1 line, up to 70 characters)',
      // Uninstall
      removing: 'Removing claude-sessions...',
      removedCommand: (f) => `Removed command: ${f}`,
      removedScript: (f) => `Removed script: ${f}`,
      removedHook: 'Removed Stop hook',
      indexPreserved: (f) => `session-index.json preserved: ${f}`,
      removalComplete: 'Removal complete.',
      // Config errors
      claudeDirNotFound: 'Claude Code directory not found.',
      checked: (p) => `Checked: ${p}`,
      installClaudeCode: 'Make sure Claude Code is installed: https://docs.anthropic.com/en/docs/claude-code',
      historyNotFound: 'history.jsonl file not found.',
      runClaudeOnce: 'Run Claude Code at least once to create the session history.',
      // Install details
      cmdSessionsDesc: '/sessions — session list',
      cmdSummarizeDesc: '/session-summarize — AI summaries',
      cmdMemoryRecallDesc: '/memory-recall — search memories',
      cmdMemoryStatusDesc: '/memory-status — memory system status',
      memoryMigrated: (n, l0) => `Migrated ${n} sessions, generated L0 for ${l0}`,
      memoryEnabled: 'Memory integration enabled',
      memoryDisabled: 'Memory integration disabled',
      memoryStatus: 'Memory Status',
      memoryTotal: (n) => `Total memories: ${n}`,
      memorySessions: (n) => `Sessions: ${n}`,
      memoryExtractingBg: (n) => `Extracting memories from ${n} recent sessions in background...`,
      memoryPrompt: 'Would you like to enable Claude memory integration?',
      memoryEnableLater: 'You can enable it later with: claude-sessions enable-memory',
      memoryNoResults: (q) => `No memories found for "${q}"`,
      memoryFound: (n) => `Found ${n} memories:`,
      memoryPendingL1: (n) => `Pending L1 extraction: ${n} sessions`,
      saveSummaryCopied: 'save-summary.mjs copied',
      stopHookInstalled: 'Stop hook for auto-saving metadata',
      saveSessionSummaryCopied: 'save-session-summary.mjs copied',
      usagePicker: 'claude-sessions     — interactive TUI picker (arrows + search)',
      usageAlias: 'cs                  — short alias',
      usageQuick: 'cs 3                — quick launch session #3',
      usageSearch: 'cs --search miniapp — search by content',
      usageSessions: '/sessions           — inside Claude Code',
      usageSummarize: '/session-summarize  — AI summaries inside Claude Code',
      // Picker
      pickerTitle: 'Claude Code Sessions',
      // Save summary
      saveSummaryUsage: 'Usage: node save-summary.mjs --session ID --summary "text"',
      summarySaved: (id, summary) => `Summary saved: [${id}] ${summary}`,
      // Restore markdown
      restoredSessionTitle: 'Restored session',
      projectLabel: 'Project',
      idLabel: 'ID',
      restoredNote: 'Original session is unavailable via --resume, context restored from JSONL.',
      conversationHistory: 'Conversation history',
      userLabel: 'User',
      assistantLabel: 'Assistant',
      restoredFooter: 'Above is the restored history. Continue working with this context.',
   },
   ru: {
      today: 'сегодня',
      yesterday: 'вчера',
      daysAgo: (n) => `${n} дн. назад`,
      noDescription: '(нет описания)',
      msgs: (n) => `(${n} сообщ.)`,
      noSessionsFound: 'Сессий не найдено.',
      recentSessions: (n) => `Последние сессии Claude Code (${n})`,
      searchResults: (q, n) => `Результаты поиска "${q}" (${n})`,
      commands: 'Команды:',
      interactivePicker: 'интерактивный пикер',
      searchByContent: 'поиск по содержимому',
      filterByProject: 'фильтр по проекту',
      showMore: 'показать больше',
      aiSummaries: 'AI-резюме',
      navigate: 'навигация',
      open: 'открыть',
      delete_: 'удалить',
      aiSummary: 'AI-резюме',
      refresh: 'обновить',
      quit: 'выход',
      confirmDelete: (date, project, summary) => `Удалить [${date}] ${project} — ${summary}? (Y/n)`,
      sessionDeleted: 'Сессия удалена',
      refreshing: 'Обновляю...',
      refreshed: (n) => `Обновлено (${n})`,
      launchingAI: 'Запуск AI-анализа сессий...',
      sessionNotFound: 'Сессия не найдена через --resume. Восстановление из JSONL...',
      errorTTY: 'Ошибка: требуется интерактивный терминал.',
      sessionNotFoundNum: (n) => `Сессия #${n} не найдена.`,
      installing: 'Установка claude-sessions...',
      terminal: 'Терминал',
      warpNote: 'Warp: TUI пикер использует Node.js (не fzf) для совместимости',
      companionNote: 'Обнаружен The Companion — /sessions будет работать через WebSocket',
      slashCommands: 'Slash-команды:',
      scripts: 'Скрипты:',
      hooks: 'Hooks:',
      existingSessions: 'Существующие сессии:',
      alreadyExists: 'уже существует, пропускаю',
      alreadyInstalled: 'уже установлен',
      settingsNotFound: 'settings.json не найден — hook не установлен',
      failedSettings: (e) => `Не удалось обновить settings.json: ${e}`,
      historyEmpty: 'История сессий пуста. Запусти Claude Code чтобы создать первые сессии.',
      noSessionsInstall: 'Сессий не найдено.',
      sessionsFound: (n) => `Найдено сессий: ${n}`,
      projects: (n, list) => `Проектов: ${n} (${list})`,
      period: (from, to) => `Период: ${from} — ${to}`,
      withSummary: (n, total) => `С AI-резюме: ${n}/${total}`,
      withoutDesc: (n) => `${n} сессий без описания.`,
      runSummarize: 'Запусти: claude-sessions summarize',
      installComplete: 'Установка завершена!',
      usage: 'Использование:',
      deleting: (id) => `Удаление сессии ${id}...`,
      invalidId: (id) => `Невалидный ID сессии: ${id}`,
      expectedUUID: 'Ожидается формат UUID (напр. 836a4e7d-bddc-41ce-a8fb-7856d7aa392c)',
      historyCleaned: 'history.jsonl очищен',
      indexCleaned: 'session-index.json очищен',
      removed: (f) => `Удалён ${f}`,
      sessionDeletedFull: (id) => `Сессия ${id} удалена`,
      fileNotFound: (id) => `Файл сессии ${id} не найден в проектах.`,
      noDataRestore: 'Нет данных для восстановления.',
      foundFile: (p) => `Найден файл: ${p}`,
      extracted: (n) => `Извлечено ${n} сообщений`,
      summary: (s) => `Резюме: ${s}`,
      sessionEmpty: 'Сессия пуста.',
      contextSaved: (f) => `Контекст сохранён: ${f}`,
      claudeNotFound: 'Claude CLI не найден. Открой файл вручную в новой сессии.',
      startingRestore: 'Запуск новой сессии с восстановленным контекстом...',
      allSummarized: 'Все сессии уже имеют осмысленные AI-резюме!',
      foundForAnalysis: (n) => `Найдено ${n} сессий для AI-анализа.`,
      claudeNotInstalled: 'Claude CLI не найден. Установи: https://docs.anthropic.com/en/docs/claude-code',
      sessionData: 'Данные сессий:',
      launchingSummarize: 'Запускаю Claude для генерации резюме...',
      summaryLangHint: 'Сгенерируй краткое резюме на русском (1 строка, до 70 символов)',
      removing: 'Удаление claude-sessions...',
      removedCommand: (f) => `Удалена команда: ${f}`,
      removedScript: (f) => `Удалён скрипт: ${f}`,
      removedHook: 'Удалён Stop hook',
      indexPreserved: (f) => `session-index.json сохранён: ${f}`,
      removalComplete: 'Удаление завершено.',
      // Config errors
      claudeDirNotFound: 'Директория Claude Code не найдена.',
      checked: (p) => `Проверено: ${p}`,
      installClaudeCode: 'Убедись что Claude Code установлен: https://docs.anthropic.com/en/docs/claude-code',
      historyNotFound: 'Файл history.jsonl не найден.',
      runClaudeOnce: 'Запусти Claude Code хотя бы один раз чтобы создать историю сессий.',
      // Install details
      cmdSessionsDesc: '/sessions — список сессий',
      cmdSummarizeDesc: '/session-summarize — AI-резюме',
      cmdMemoryRecallDesc: '/memory-recall — поиск воспоминаний',
      cmdMemoryStatusDesc: '/memory-status — статус системы памяти',
      memoryMigrated: (n, l0) => `Мигрировано ${n} сессий, L0 сгенерирован для ${l0}`,
      memoryEnabled: 'Интеграция памяти включена',
      memoryDisabled: 'Интеграция памяти отключена',
      memoryStatus: 'Статус памяти',
      memoryTotal: (n) => `Всего воспоминаний: ${n}`,
      memorySessions: (n) => `Сессий: ${n}`,
      memoryExtractingBg: (n) => `Извлечение памяти из ${n} последних сессий в фоне...`,
      memoryPrompt: 'Хотите включить интеграцию памяти с Claude?',
      memoryEnableLater: 'Можно включить позже: claude-sessions enable-memory',
      memoryNoResults: (q) => `Не найдено воспоминаний по запросу "${q}"`,
      memoryFound: (n) => `Найдено ${n} воспоминаний:`,
      memoryPendingL1: (n) => `Ожидает извлечения L1: ${n} сессий`,
      saveSummaryCopied: 'save-summary.mjs скопирован',
      stopHookInstalled: 'Stop hook для автосохранения метаданных',
      saveSessionSummaryCopied: 'save-session-summary.mjs скопирован',
      usagePicker: 'claude-sessions     — интерактивный TUI пикер (стрелки + поиск)',
      usageAlias: 'cs                  — короткий алиас',
      usageQuick: 'cs 3                — быстрый запуск сессии #3',
      usageSearch: 'cs --search miniapp — поиск по содержимому',
      usageSessions: '/sessions           — внутри Claude Code',
      usageSummarize: '/session-summarize  — AI-резюме внутри Claude Code',
      // Picker
      pickerTitle: 'Сессии Claude Code',
      // Save summary
      saveSummaryUsage: 'Использование: node save-summary.mjs --session ID --summary "текст"',
      summarySaved: (id, summary) => `Резюме сохранено: [${id}] ${summary}`,
      // Restore markdown
      restoredSessionTitle: 'Восстановленная сессия',
      projectLabel: 'Проект',
      idLabel: 'ID',
      restoredNote: 'Оригинальная сессия недоступна через --resume, контекст восстановлен из JSONL.',
      conversationHistory: 'История переписки',
      userLabel: 'Пользователь',
      assistantLabel: 'Ассистент',
      restoredFooter: 'Выше — восстановленная история. Продолжай работу с учётом этого контекста.',
   },
};

/**
 * Detects system language from environment
 */
function detectLanguage() {
   // Check CLAUDE_SESSIONS_LANG env var first (user override)
   const override = process.env.CLAUDE_SESSIONS_LANG;
   if (override && translations[override]) return override;

   // Check LANG, LC_ALL, LANGUAGE env vars
   const langEnv = process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || '';
   const code = langEnv.split(/[._@]/)[0]?.toLowerCase();

   if (code && translations[code]) return code;

   // macOS: try defaults read
   if (platform() === 'darwin') {
      try {
         const locale = execSync('defaults read -g AppleLocale 2>/dev/null', { encoding: 'utf8' }).trim();
         const macCode = locale.split('_')[0]?.toLowerCase();
         if (macCode && translations[macCode]) return macCode;
      } catch {}
   }

   return 'en';
}

export const currentLang = detectLanguage();

/**
 * Get translation for key. Falls back to English.
 */
export function t(key, ...args) {
   const val = translations[currentLang]?.[key] ?? translations.en[key];
   if (typeof val === 'function') return val(...args);
   return val ?? key;
}

/**
 * Get locale string for date formatting
 */
export function getLocale() {
   const localeMap = {
      en: 'en-US',
      ru: 'ru-RU',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      zh: 'zh-CN',
      ja: 'ja-JP',
      ko: 'ko-KR',
      pt: 'pt-BR',
      tr: 'tr-TR',
   };
   return localeMap[currentLang] || 'en-US';
}
