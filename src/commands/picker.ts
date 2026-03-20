/**
 * Interactive TUI session picker.
 * Works in Warp, iTerm2, Terminal.app, VS Code and any terminal.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import type { Session } from "../sessions/loader.js";
import { loadSessions } from "../sessions/loader.js";
import { readSessionCache, writeSessionCache } from "../sessions/cache.js";
import {
  ensureClaudeDir,
  CLAUDE_DIR,
  findSessionJsonl,
} from "../core/config.js";
import { t } from "../core/i18n.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** ANSI escape sequences */
const ESC = "\x1b";
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_LINE = `${ESC}[2K`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const INVERSE = `${ESC}[7m`;
const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const RED = `${ESC}[31m`;
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
// Включение/выключение mouse reporting (SGR mode для корректных wheel events)
const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const MOUSE_OFF = `${ESC}[?1000l${ESC}[?1006l`;

function moveCursor(row: number, col: number): void {
  process.stdout.write(`${ESC}[${row};${col}H`);
}

function clearScreen(): void {
  process.stdout.write(`${ESC}[2J${ESC}[H`);
}

/** Short agent labels for picker display */
const AGENT_LABELS: Record<string, string> = {
  claude: "CLD",
  codex: "CDX",
  qwen: "QWN",
  gemini: "GEM",
};

/** Agent colors */
const AGENT_COLORS: Record<string, string> = {
  claude: `${ESC}[35m`, // magenta
  codex: `${ESC}[32m`, // green
  qwen: `${ESC}[36m`, // cyan
  gemini: `${ESC}[33m`, // yellow
};

class SessionPicker {
  allSessions: Session[];
  filtered: Session[];
  selected: number;
  searchText: string;
  scrollOffset: number;
  message: string;
  confirmDelete: Session | null;
  rows: number;
  cols: number;
  visibleCount: number;
  /** Loading status for status bar */
  statusText: string;
  /** Current agent filter index (0 = all) */
  agentFilterIndex: number;
  /** Unique agents in loaded sessions */
  availableAgents: string[];
  /** Скрывать недоступные сессии (нет JSONL и нет snapshot) */
  hideOrphaned: boolean;

  constructor(sessions: Session[]) {
    this.allSessions = sessions;
    this.filtered = [...sessions];
    this.selected = 0;
    this.searchText = "";
    this.scrollOffset = 0;
    this.message = "";
    this.confirmDelete = null;
    this.rows = process.stdout.rows || 30;
    this.cols = process.stdout.columns || 80;
    this.visibleCount = this.rows - 7;
    this.agentFilterIndex = 0;
    this.statusText = "";
    this.hideOrphaned = true;
    // Determine available agents from loaded sessions
    this.availableAgents = [...new Set(sessions.map((s) => s.agent))];
  }

  /** Cycle agent filter (Tab) */
  cycleAgentFilter(): void {
    // Build list: all + actually available agents
    const filters = ["all", ...this.availableAgents];
    this.agentFilterIndex = (this.agentFilterIndex + 1) % filters.length;
    this.filter();
  }

  /** Current agent filter */
  get currentAgentFilter(): string {
    const filters = ["all", ...this.availableAgents];
    return filters[this.agentFilterIndex] || "all";
  }

  /** Переключить видимость недоступных сессий */
  toggleOrphaned(): void {
    this.hideOrphaned = !this.hideOrphaned;
    this.filter();
  }

  filter(): void {
    let base = this.allSessions;

    // Скрыть недоступные сессии (нет JSONL и нет snapshot)
    if (this.hideOrphaned) {
      base = base.filter((s) => s.hasJsonl !== false || s.hasSnapshot);
    }

    // Filter by agent
    const af = this.currentAgentFilter;
    if (af !== "all") {
      base = base.filter((s) => s.agent === af);
    }

    // Filter by search text
    if (this.searchText) {
      const q = this.searchText.toLowerCase();
      base = base.filter((s) => s.searchText.includes(q));
    }

    this.filtered = base;
    this.selected = 0;
    this.scrollOffset = 0;
  }

  render(): void {
    // Buffer all output and write at once to prevent flickering
    const buf: string[] = [];
    const w = this.cols;
    // Build entire frame in buffer, write once to prevent flickering
    const agentLabel =
      this.currentAgentFilter === "all" ? "" : ` [${this.currentAgentFilter}]`;
    buf.push(
      `${ESC}[1;1H${CLEAR_LINE}${BOLD}  ${t("pickerTitle")}${RESET} ${DIM}(${this.filtered.length}/${this.allSessions.length})${agentLabel}${RESET}`,
    );
    buf.push(
      `${ESC}[2;1H${CLEAR_LINE}${DIM}${"─".repeat(Math.min(w, 100))}${RESET}`,
    );

    const start = this.scrollOffset;
    const end = Math.min(start + this.visibleCount, this.filtered.length);

    for (let i = start; i < end; i++) {
      const s = this.filtered[i];
      const row = 3 + (i - start);
      const num = String(i + 1).padStart(3);
      const isSelected = i === this.selected;
      const label = AGENT_LABELS[s.agent] || s.agent.slice(0, 3).toUpperCase();
      const color = AGENT_COLORS[s.agent] || DIM;
      const via = s.viaCompanion ? " [C]" : "";
      // Индикатор целостности: ⚠ нет JSONL и snapshot, [S] только snapshot
      const integrity =
        s.agent === "claude" && !s.hasJsonl && !s.hasSnapshot
          ? ` ${RED}[!]${RESET}`
          : s.agent === "claude" && !s.hasJsonl && s.hasSnapshot
            ? ` ${YELLOW}[S]${RESET}`
            : "";
      // Длина без ANSI-кодов для расчёта ширины
      const integrityLen = integrity ? 4 : 0;
      // 5 for label+space, 8 for num+brackets, rest for date+project+summary
      const prefixLen =
        5 + 8 + s.dateStr.length + s.project.length + s.cnt.length + via.length + integrityLen;
      const maxSummary = Math.max(20, w - prefixLen - 4);
      const truncSummary =
        s.summary.length > maxSummary
          ? s.summary.slice(0, maxSummary - 1) + "…"
          : s.summary;

      if (isSelected) {
        buf.push(
          `${ESC}[${row};1H${CLEAR_LINE} ${INVERSE}${BOLD} ${label} ${num}. [${s.dateStr}] ${s.project}${s.cnt}  ${truncSummary}${via} ${RESET}${integrity}`,
        );
      } else {
        buf.push(
          `${ESC}[${row};1H${CLEAR_LINE}  ${color}${label}${RESET} ${DIM}${num}.${RESET} [${CYAN}${s.dateStr}${RESET}] ${BOLD}${s.project}${RESET}${DIM}${s.cnt}${RESET}  ${truncSummary}${DIM}${via}${RESET}${integrity}`,
        );
      }
    }

    for (let i = end - start; i < this.visibleCount; i++) {
      buf.push(`${ESC}[${3 + i};1H${CLEAR_LINE}`);
    }

    const sepRow = 3 + this.visibleCount;
    buf.push(
      `${ESC}[${sepRow};1H${CLEAR_LINE}${DIM}${"─".repeat(Math.min(w, 100))}${RESET}`,
    );
    const orphanHint = this.hideOrphaned ? 'show [!]' : 'hide [!]';
    buf.push(
      `${ESC}[${sepRow + 1};1H${CLEAR_LINE}  ${DIM}↑↓${RESET} ${t("navigate")}  ${DIM}Tab${RESET} agent  ${DIM}Enter${RESET} ${t("open")}  ${DIM}^O${RESET} companion  ${DIM}^H${RESET} ${orphanHint}  ${DIM}^D${RESET} ${t("delete_")}  ${DIM}^A${RESET} ${t("aiSummary")}  ${DIM}^R${RESET} ${t("refresh")}  ${DIM}Esc${RESET} ${t("quit")}`,
    );

    if (this.message) {
      buf.push(`${ESC}[${sepRow + 2};1H${CLEAR_LINE}  ${this.message}`);
    } else {
      buf.push(`${ESC}[${sepRow + 2};1H${CLEAR_LINE}`);
    }

    // Status bar
    if (this.statusText) {
      buf.push(
        `${ESC}[${sepRow + 3};1H${CLEAR_LINE}  ${DIM}${this.statusText}${RESET}`,
      );
    } else {
      buf.push(`${ESC}[${sepRow + 3};1H${CLEAR_LINE}`);
    }

    buf.push(
      `${ESC}[${sepRow + 4};1H${CLEAR_LINE}  ${YELLOW}>${RESET} ${this.searchText}${SHOW_CURSOR}`,
    );

    // Single write — no flickering
    process.stdout.write(buf.join(""));
  }

  scrollToSelected(): void {
    if (this.selected < this.scrollOffset) {
      this.scrollOffset = this.selected;
    } else if (this.selected >= this.scrollOffset + this.visibleCount) {
      this.scrollOffset = this.selected - this.visibleCount + 1;
    }
  }

  moveUp(): void {
    if (this.selected > 0) {
      this.selected--;
    } else {
      this.selected = this.filtered.length - 1;
    }
    this.scrollToSelected();
  }

  moveDown(): void {
    if (this.selected < this.filtered.length - 1) {
      this.selected++;
    } else {
      this.selected = 0;
    }
    this.scrollToSelected();
  }

  pageUp(): void {
    this.selected = Math.max(0, this.selected - this.visibleCount);
    this.scrollToSelected();
  }

  pageDown(): void {
    this.selected = Math.min(
      this.filtered.length - 1,
      this.selected + this.visibleCount,
    );
    this.scrollToSelected();
  }

  goHome(): void {
    this.selected = 0;
    this.scrollToSelected();
  }

  goEnd(): void {
    this.selected = Math.max(0, this.filtered.length - 1);
    this.scrollToSelected();
  }

  getSelected(): Session | null {
    return this.filtered[this.selected] || null;
  }
}

export default async function picker(args: string[] = []): Promise<void> {
  ensureClaudeDir();

  // Parse arguments
  let projectFilter: string | undefined;
  let searchPreFilter: string | undefined;
  let quickPick: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      projectFilter = args[i + 1];
      i++;
    } else if (args[i] === "--search" && args[i + 1]) {
      searchPreFilter = args[i + 1];
      i++;
    } else if (args[i] === "--quick" && args[i + 1]) {
      quickPick = parseInt(args[i + 1]);
      i++;
    }
  }

  // Instant start: try cache first, then Claude-only, then full load in background
  const cached = readSessionCache();
  let sessions: Session[];
  if (cached && cached.length > 0 && !projectFilter && !searchPreFilter) {
    sessions = cached;
  } else {
    sessions = await loadSessions({
      projectFilter,
      searchQuery: searchPreFilter,
      agentFilter: "claude",
    });
  }

  if (sessions.length === 0) {
    // No cache, no Claude — try full load
    sessions = await loadSessions({
      projectFilter,
      searchQuery: searchPreFilter,
    });
  }

  if (sessions.length === 0) {
    console.log(t("noSessionsFound"));
    process.exit(0);
  }

  // Quick pick
  if (quickPick !== undefined) {
    const s = sessions[quickPick - 1];
    if (!s) {
      console.log(t("sessionNotFoundNum", quickPick));
      process.exit(1);
    }
    const { getAdapter } = await import("../agents/registry.js");
    const adapter = getAdapter(s.agent as import("../agents/types.js").AgentId);
    const resumeCmd = adapter?.getResumeCommand(s.id);
    if (!resumeCmd || resumeCmd.length === 0) {
      console.error(
        `\n❌ ${t("pickerCliNotFound", s.agent)}\n`,
      );
      process.exit(1);
    }
    const [cmd, ...cmdArgs] = resumeCmd;
    console.log(`\n▶ ${resumeCmd.join(" ")}\n`);
    try {
      execFileSync(cmd, cmdArgs, { stdio: "inherit" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n❌ ${t("pickerLaunchError", msg)}\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  if (!process.stdin.isTTY) {
    console.log(t("errorTTY"));
    process.exit(1);
  }

  const p = new SessionPicker(sessions);
  // Применить фильтр orphaned при старте
  p.filter();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR + MOUSE_ON);
  p.render();

  // Background: lazy L0 extraction для агентов без hooks (Codex, Qwen)
  import("../memory/lazy-extract.js")
    .then(({ lazyExtractForNonHookAgents }) => {
      lazyExtractForNonHookAgents().catch(() => {
        // Ошибки lazy extraction не критичны
      });
    })
    .catch(() => {
      // Модуль недоступен — пропускаем
    });

  // Background: load all agent sessions, merge, and update cache
  p.statusText = `⏳ ${t("pickerLoadingAgents")}`;
  loadSessions({ projectFilter, searchQuery: searchPreFilter, limit: 500 })
    .then((allSessions) => {
      const existingIds = new Set(p.allSessions.map((s) => s.id));
      const newSessions = allSessions.filter((s) => !existingIds.has(s.id));
      if (newSessions.length > 0) {
        p.allSessions = [...p.allSessions, ...newSessions].sort(
          (a, b) => b.lastTs - a.lastTs,
        );
        p.availableAgents = [...new Set(p.allSessions.map((s) => s.agent))];
        p.filter();
      }
      // Update cache for next instant start
      writeSessionCache(p.allSessions);
      p.statusText = "";
      p.render();
    })
    .catch(() => {
      p.statusText = "";
      p.render();
    });

  function cleanup(): void {
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
    process.stdin.setRawMode(false);
  }

  process.on("exit", () => {
    process.stdout.write(MOUSE_OFF + SHOW_CURSOR + ALT_SCREEN_OFF);
  });

  process.stdout.on("resize", () => {
    p.rows = process.stdout.rows || 30;
    p.cols = process.stdout.columns || 80;
    p.visibleCount = p.rows - 7;
    p.scrollToSelected();
    p.render();
  });

  process.stdin.on("data", (key: string) => {
    // Delete confirmation — FIRST priority
    if (p.confirmDelete) {
      const s = p.confirmDelete;
      p.confirmDelete = null;

      if (key === "\r" || key === "\n" || key === "y" || key === "Y") {
        // Deletion — JSON parsing for safety
        try {
          const histPath = join(CLAUDE_DIR, "history.jsonl");
          if (existsSync(histPath)) {
            const content = readFileSync(histPath, "utf8");
            writeFileSync(
              histPath,
              content
                .split("\n")
                .filter((l) => {
                  if (!l.trim()) return true;
                  try {
                    return JSON.parse(l).sessionId !== s.id;
                  } catch {
                    return true;
                  }
                })
                .join("\n"),
            );
          }
          const idxPath = join(CLAUDE_DIR, "session-index.json");
          if (existsSync(idxPath)) {
            const idx = JSON.parse(readFileSync(idxPath, "utf8")) as Record<
              string,
              unknown
            >;
            delete idx[s.id];
            writeFileSync(idxPath, JSON.stringify(idx, null, 2));
          }
          // Удаление JSONL-файла сессии из projects/
          const sf = findSessionJsonl(s.id);
          if (sf) unlinkSync(sf.path);
        } catch {
          // Ignore deletion errors
        }

        p.allSessions = p.allSessions.filter((x) => x.id !== s.id);
        p.filter();
        if (p.selected >= p.filtered.length) {
          p.selected = Math.max(0, p.filtered.length - 1);
        }
        p.scrollToSelected();
        p.message = `${GREEN}✅ ${t("sessionDeleted")}${RESET}`;
        p.render();
        setTimeout(() => {
          p.message = "";
          p.render();
        }, 1500);
      } else {
        p.message = "";
        p.render();
      }
      return;
    }

    // Esc — exit
    if (key === "\x1b" || key === "\x03") {
      cleanup();
      process.exit(0);
    }

    // Enter — open
    if (key === "\r" || key === "\n") {
      const s = p.getSelected();
      if (!s) return;

      cleanup();

      // Get adapter and check if session is alive
      import("../agents/registry.js").then(({ getAdapter }) => {
        const adapter = getAdapter(
          s.agent as import("../agents/types.js").AgentId,
        );
        const resumeCmd = adapter?.getResumeCommand(s.id);
        const alive = adapter?.isSessionAlive(s.id) ?? false;

        if (alive && resumeCmd && resumeCmd.length > 0) {
          // Сессия жива — возобновляем напрямую
          const [cmd, ...cmdArgs] = resumeCmd;
          console.log(`\n▶ ${resumeCmd.join(" ")}\n`);
          try {
            execFileSync(cmd, cmdArgs, { stdio: "inherit" });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`\n❌ ${t("pickerResumeError", msg)}\n`);
          }
        } else if (s.agent === "claude") {
          // Мёртвая Claude-сессия — восстанавливаем из JSONL
          console.log(`\n${t("sessionNotFound")}\n`);
          const restorePath = join(__dirname, "restore.js");
          if (!existsSync(restorePath)) {
            console.error(`\n❌ ${t("pickerRestoreNotFound", restorePath)}\n`);
          } else {
            try {
              execFileSync("node", [restorePath, s.id], { stdio: "inherit" });
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              console.error(`\n❌ ${t("pickerRestoreError", msg)}\n`);
            }
          }
        } else if (resumeCmd && resumeCmd.length > 0) {
          // Другой агент — пробуем возобновить
          const [cmd, ...cmdArgs] = resumeCmd;
          console.log(`\n▶ ${resumeCmd.join(" ")}\n`);
          try {
            execFileSync(cmd, cmdArgs, { stdio: "inherit" });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(
              `\n❌ ${t("pickerResumeAgentError", s.agent, msg)}\n`,
            );
          }
        } else {
          console.log(
            `\n${t("pickerResumeNotAvailable", s.agent, s.id)}\n`,
          );
        }
        process.exit(0);
      });
      return;
    }

    // Ctrl-D — delete
    if (key === "\x04") {
      const s = p.getSelected();
      if (s) {
        p.message = `${RED}⚠️  ${t("confirmDelete", s.dateStr, s.project, s.summary)}${RESET}`;
        p.confirmDelete = s;
        p.render();
      }
      return;
    }

    // Ctrl-O — открыть в Companion UI
    if (key === "\x0f") {
      const s = p.getSelected();
      if (!s) return;

      // Сессия уже из Companion — открываем напрямую по URL
      if (s.viaCompanion) {
        import("../agents/companion.js").then(({ companionAdapter }) => {
          const cmd = companionAdapter.getOpenInUiCommand?.(s.id);
          if (!cmd || cmd.length === 0) {
            p.message = `${RED}${t("pickerCompanionNotDetected")}${RESET}`;
            p.render();
            setTimeout(() => {
              p.message = "";
              p.render();
            }, 1500);
            return;
          }
          const [bin, ...binArgs] = cmd;
          try {
            execFileSync(bin, binArgs, { stdio: "ignore" });
            p.message = `${GREEN}${t("pickerOpenedCompanion")}${RESET}`;
          } catch {
            p.message = `${RED}${t("pickerCompanionOpenError")}${RESET}`;
          }
          p.render();
          setTimeout(() => {
            p.message = "";
            p.render();
          }, 1500);
        });
        return;
      }

      // Claude-сессия — создаём wrapper через Companion API
      if (s.agent === "claude") {
        p.message = `${DIM}${t("pickerOpeningCompanion")}${RESET}`;
        p.render();
        import("../agents/companion.js").then(({ openInCompanionViaApi }) => {
          openInCompanionViaApi(s.id, s.projectPath).then((result) => {
            if (result.ok) {
              p.message = `${GREEN}${t("pickerOpenedCompanion")}${RESET}`;
            } else {
              p.message = `${RED}${result.error}${RESET}`;
            }
            p.render();
            setTimeout(() => {
              p.message = "";
              p.render();
            }, 2000);
          });
        });
        return;
      }

      // Другой агент — не поддерживается
      p.message = `${RED}${t("pickerCompanionNotSupported", s.agent)}${RESET}`;
      p.render();
      setTimeout(() => {
        p.message = "";
        p.render();
      }, 1500);
      return;
    }

    // Ctrl-R — refresh
    if (key === "\x12") {
      p.message = `${DIM}${t("refreshing")}${RESET}`;
      p.render();
      loadSessions().then((fresh) => {
        p.allSessions = fresh;
        p.filter();
        p.scrollToSelected();
        p.message = `${GREEN}✅ ${t("refreshed", fresh.length)}${RESET}`;
        p.render();
        setTimeout(() => {
          p.message = "";
          p.render();
        }, 1500);
      });
      return;
    }

    // Ctrl-A — AI summarization
    if (key === "\x01") {
      cleanup();
      process.stdin.removeAllListeners("data");
      process.stdin.pause();
      console.log(`\n${t("launchingAI")}\n`);
      import("./summarize.js")
        .then(({ default: summarize }) => summarize([]))
        .catch((e: unknown) => {
          const message =
            e instanceof Error ? e.message : t("pickerSummarizeFailed");
          console.error(`\n❌ ${message}`);
        })
        .finally(() => {
          // Wait for user to see the result before returning to picker
          console.log(`\n${t("pickerPressEnter")}`);
          process.stdin.resume();
          process.stdin.setRawMode(true);
          process.stdin.once("data", () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            // Invalidate cache and restart picker
            writeSessionCache([]);
            picker(args).catch(() => process.exit(1));
          });
        });
      return;
    }

    // SGR mouse wheel: \x1b[<64;x;yM (scroll up) \x1b[<65;x;yM (scroll down)
    if (key.startsWith('\x1b[<')) {
      const match = key.match(/\x1b\[<(\d+);/);
      if (match) {
        const btn = parseInt(match[1]);
        if (btn === 64) { p.moveUp(); p.render(); }
        if (btn === 65) { p.moveDown(); p.render(); }
      }
      return;
    }

    // Arrow keys
    if (key === "\x1b[A" || key === "\x1bOA") {
      p.moveUp();
      p.render();
      return;
    }
    if (key === "\x1b[B" || key === "\x1bOB") {
      p.moveDown();
      p.render();
      return;
    }
    if (key === "\x1b[5~") {
      p.pageUp();
      p.render();
      return;
    }
    if (key === "\x1b[6~") {
      p.pageDown();
      p.render();
      return;
    }
    // Home
    if (key === "\x1b[H" || key === "\x1b[1~") {
      p.goHome();
      p.render();
      return;
    }
    // End
    if (key === "\x1b[F" || key === "\x1b[4~") {
      p.goEnd();
      p.render();
      return;
    }

    // Tab — toggle agent filter
    if (key === "\t") {
      p.cycleAgentFilter();
      p.render();
      return;
    }

    // Ctrl-H — переключить видимость недоступных сессий
    if (key === '\x08') {
      p.toggleOrphaned();
      p.message = p.hideOrphaned
        ? `${DIM}${t("pickerOrphanedHidden")}${RESET}`
        : `${DIM}${t("pickerOrphanedShown")}${RESET}`;
      p.render();
      setTimeout(() => {
        p.message = '';
        p.render();
      }, 1500);
      return;
    }

    // Backspace
    if (key === '\x7f') {
      if (p.searchText.length > 0) {
        p.searchText = p.searchText.slice(0, -1);
        p.filter();
        p.render();
      }
      return;
    }

    // Игнорировать нераспознанные escape последовательности (mouse events и пр.)
    if (key.startsWith('\x1b[') || key.startsWith('\x1bO')) {
      return;
    }

    // Characters — search
    if (key.length === 1 && key >= " ") {
      p.searchText += key;
      p.filter();
      p.render();
      return;
    }

    // Multi-byte characters (unicode)
    if (key.length > 1 && !key.startsWith("\x1b")) {
      p.searchText += key;
      p.filter();
      p.render();
      return;
    }
  });
}
