/**
 * Lazy L0 extraction для агентов без hooks (Codex, Qwen).
 * Запускается в background при открытии picker.
 * Проверяет наличие новых сессий без L0 и извлекает метаданные.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { MEMORY_DIR } from "../core/config.js";
import { readSessionIndex, writeSessionIndex } from "../sessions/loader.js";
import { extractL0ForAgent } from "./extract-l0-multi.js";
import type { SessionMeta } from "./types.js";

/** Агенты без hooks, для которых нужна lazy extraction */
const NON_HOOK_AGENTS: Array<{
  id: string;
  /** Формат агента для extract-l0-multi */
  extractId: string;
  /** Функция получения файлов сессий: возвращает [sessionId, filePath, project][] */
  getSessionFiles: () => Array<[string, string, string]>;
}> = [
  {
    id: "codex",
    extractId: "codex",
    getSessionFiles: getCodexSessionFiles,
  },
  {
    id: "qwen",
    extractId: "qwen",
    getSessionFiles: getQwenSessionFiles,
  },
];

/**
 * Собирает файлы сессий Codex из history.jsonl.
 * Группирует записи по session_id — каждая группа = одна сессия.
 * Возвращает [sessionId, historyPath, 'codex'][]
 */
function getCodexSessionFiles(): Array<[string, string, string]> {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const codexDir = join(home, ".codex");
  const historyPath = join(codexDir, "history.jsonl");

  if (!existsSync(historyPath)) return [];

  // Из history.jsonl извлекаем уникальные session_id
  try {
    const content = readFileSync(historyPath, "utf8");
    const sessionIds = new Set<string>();

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as { session_id?: string };
        if (entry.session_id) sessionIds.add(entry.session_id);
      } catch {
        // Пропускаем невалидные строки
      }
    }

    // Возвращаем каждую сессию с путём к history.jsonl
    return [...sessionIds].map((sid) => [sid, historyPath, "codex"]);
  } catch {
    return [];
  }
}

/**
 * Собирает файлы сессий Qwen из ~/.qwen/projects/{project}/chats/*.jsonl
 */
function getQwenSessionFiles(): Array<[string, string, string]> {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const qwenProjects = join(home, ".qwen", "projects");

  if (!existsSync(qwenProjects)) return [];

  const results: Array<[string, string, string]> = [];

  try {
    const projectDirs = readdirSync(qwenProjects, {
      withFileTypes: true,
    }).filter((d) => d.isDirectory());

    for (const projDir of projectDirs) {
      const chatsDir = join(qwenProjects, projDir.name, "chats");
      if (!existsSync(chatsDir)) continue;

      // Преобразуем имя директории в путь проекта
      const projectPath = projDir.name.startsWith("-")
        ? projDir.name.replace(/-/g, "/")
        : projDir.name;

      try {
        const chatFiles = readdirSync(chatsDir).filter((f) =>
          f.endsWith(".jsonl"),
        );
        for (const chatFile of chatFiles) {
          // sessionId из имени файла (без .jsonl)
          const sessionId = chatFile.replace(".jsonl", "");
          results.push([sessionId, join(chatsDir, chatFile), projectPath]);
        }
      } catch {
        // Пропускаем ошибки чтения директории
      }
    }
  } catch {
    return [];
  }

  return results;
}

/**
 * Читает строки сессии из файла.
 * Для Codex history.jsonl — фильтрует по session_id.
 * Для остальных — возвращает все строки файла.
 */
function readSessionLines(
  filePath: string,
  sessionId: string,
  agentId: string,
): string[] {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());

    // Codex history.jsonl содержит все сессии — фильтруем по ID
    if (agentId === "codex" && filePath.endsWith("history.jsonl")) {
      return lines.filter((line) => {
        try {
          const entry = JSON.parse(line) as { session_id?: string };
          return entry.session_id === sessionId;
        } catch {
          return false;
        }
      });
    }

    return lines;
  } catch {
    return [];
  }
}

/**
 * Главная функция: lazy L0 extraction для агентов без hooks.
 * НЕ блокирует — предназначена для запуска через .then() в background.
 * Возвращает количество обработанных сессий.
 */
export async function lazyExtractForNonHookAgents(): Promise<number> {
  // Проверяем, что memory включена
  if (!existsSync(MEMORY_DIR)) return 0;

  const index = readSessionIndex();
  let processedCount = 0;

  for (const agent of NON_HOOK_AGENTS) {
    let sessionFiles: Array<[string, string, string]>;
    try {
      sessionFiles = agent.getSessionFiles();
    } catch {
      continue;
    }

    for (const [sessionId, filePath, project] of sessionFiles) {
      // Пропускаем сессии, для которых уже есть L0
      if (index[sessionId]?.l0) continue;

      // Читаем строки сессии
      const lines = readSessionLines(filePath, sessionId, agent.id);
      if (lines.length === 0) continue;

      // Извлекаем L0 метаданные
      try {
        const l0 = extractL0ForAgent(agent.extractId, lines, project);
        if (!l0.summary && l0.messageCount === 0) continue;

        // Обновляем индекс
        const existing = index[sessionId] || ({} as SessionMeta);
        index[sessionId] = {
          ...existing,
          summary: existing.summary || l0.summary,
          project: l0.project || project,
          lastActive: l0.timestamp || Date.now(),
          l0,
          extracted_at: new Date().toISOString(),
        };

        processedCount++;
      } catch {
        // Ошибка extraction — пропускаем, попробуем в следующий раз
      }
    }
  }

  // Записываем обновлённый индекс, если были изменения
  if (processedCount > 0) {
    writeSessionIndex(index);
  }

  return processedCount;
}
