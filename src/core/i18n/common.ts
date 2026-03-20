/**
 * i18n/common.ts — общие строки: даты, описания, форматирование.
 * Домен: today, yesterday, daysAgo, noDescription, msgs, getLocale.
 *
 * Маппинг ключей → домен:
 *   common: today, yesterday, daysAgo, noDescription, msgs
 *   sessions: noSessionsFound, recentSessions, searchResults, sessionsFound, projects, period,
 *             withSummary, withoutDesc, runSummarize, historyEmpty, noSessionsInstall,
 *             noSessionsHint, noSessionsMatchFilter, sessionDeleted, sessionDeletedFull,
 *             sessionNotFound, sessionNotFoundNum, sessionEmpty, sessionData
 *   agents: errSessionNotFound, errAgentNotInstalled, errCorruptData, errResumeNotSupported,
 *           errSuggestionCheckId, errSuggestionInstallAgent, errSuggestionRestore,
 *           errResumeNotSupported, launchingAI, claudeNotFound, claudeNotInstalled,
 *           startingRestore, qwenHooksRemoved, codexMcpRemoved, qwenMcpRemoved, mcpError,
 *           codexMcpAlreadyRegistered, codexMcpRegistered, qwenMcpAlreadyRegistered, qwenMcpRegistered
 *   cli: usage, usagePicker, usageAlias, usageQuick, usageSearch, usageSessions, usageSummarize,
 *        commands, interactivePicker, searchByContent, filterByProject, showMore, aiSummaries,
 *        navigate, open, delete_, aiSummary, refresh, quit, installing, terminal, warpNote,
 *        companionNote, slashCommands, scripts, hooks, existingSessions, alreadyExists,
 *        alreadyInstalled, settingsNotFound, failedSettings, installComplete, installClaudeCode,
 *        historyNotFound, runClaudeOnce, removing, removedCommand, removedScript, removedHook,
 *        indexPreserved, removalComplete, claudeDirNotFound, checked, cmdSessionsDesc,
 *        cmdSummarizeDesc, cmdMemoryRecallDesc, cmdMemoryStatusDesc
 *   memory: memoryMigrated, memoryEnabled, memoryDisabled, memoryStatus, memoryTotal,
 *           memorySessions, memoryExtractingBg, memoryPrompt, memoryEnableLater, memoryWillDo,
 *           memoryInjectInstructions, memoryInstallHooks, memoryEnablePrompt, noAgentsFound,
 *           detectedAgents, withHooks, noHooks, memoryNoResults, memoryFound, memoryPendingL1
 */
export { t, getLocale, currentLang } from './index.js';
export type { TranslationKey } from './index.js';
