/**
 * Interactive TUI session picker.
 * Works in Warp, iTerm2, Terminal.app, VS Code and any terminal.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { execSync, execFileSync } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { loadSessions } from './sessions.mjs';
import { ensureClaudeDir, CLAUDE_DIR, PROJECTS_DIR } from './config.mjs';
import { t } from './i18n.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ESC = '\x1b';
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

function moveCursor(row, col) {
   process.stdout.write(`${ESC}[${row};${col}H`);
}

function clearScreen() {
   process.stdout.write(`${ESC}[2J${ESC}[H`);
}

class SessionPicker {
   constructor(sessions) {
      this.allSessions = sessions;
      this.filtered = [...sessions];
      this.selected = 0;
      this.searchText = '';
      this.scrollOffset = 0;
      this.message = '';
      this.confirmDelete = null;
      this.rows = process.stdout.rows || 30;
      this.cols = process.stdout.columns || 80;
      this.visibleCount = this.rows - 6;
   }

   filter() {
      if (!this.searchText) {
         this.filtered = [...this.allSessions];
      } else {
         const q = this.searchText.toLowerCase();
         this.filtered = this.allSessions.filter((s) => s.searchText.includes(q));
      }
      this.selected = 0;
      this.scrollOffset = 0;
   }

   render() {
      clearScreen();
      const w = this.cols;

      moveCursor(1, 1);
      process.stdout.write(`${BOLD}  ${t('pickerTitle')}${RESET} ${DIM}(${this.filtered.length}/${this.allSessions.length})${RESET}`);

      moveCursor(2, 1);
      process.stdout.write(`${DIM}${'─'.repeat(Math.min(w, 100))}${RESET}`);

      const start = this.scrollOffset;
      const end = Math.min(start + this.visibleCount, this.filtered.length);

      for (let i = start; i < end; i++) {
         const s = this.filtered[i];
         const row = 3 + (i - start);
         const num = String(i + 1).padStart(3);
         const isSelected = i === this.selected;

         moveCursor(row, 1);
         process.stdout.write(CLEAR_LINE);

         if (isSelected) {
            process.stdout.write(` ${INVERSE}${BOLD} ${num}. [${s.dateStr}] ${s.project}${s.cnt}  ${s.summary} ${RESET}`);
         } else {
            process.stdout.write(`  ${DIM}${num}.${RESET} [${CYAN}${s.dateStr}${RESET}] ${BOLD}${s.project}${RESET}${DIM}${s.cnt}${RESET}  ${s.summary}`);
         }
      }

      for (let i = end - start; i < this.visibleCount; i++) {
         moveCursor(3 + i, 1);
         process.stdout.write(CLEAR_LINE);
      }

      const sepRow = 3 + this.visibleCount;
      moveCursor(sepRow, 1);
      process.stdout.write(`${DIM}${'─'.repeat(Math.min(w, 100))}${RESET}`);

      moveCursor(sepRow + 1, 1);
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(`  ${DIM}↑↓${RESET} ${t('navigate')}  ${DIM}Enter${RESET} ${t('open')}  ${DIM}^D${RESET} ${t('delete_')}  ${DIM}^A${RESET} ${t('aiSummary')}  ${DIM}^R${RESET} ${t('refresh')}  ${DIM}Esc${RESET} ${t('quit')}`);

      if (this.message) {
         moveCursor(sepRow + 2, 1);
         process.stdout.write(CLEAR_LINE);
         process.stdout.write(`  ${this.message}`);
      }

      moveCursor(sepRow + 3, 1);
      process.stdout.write(CLEAR_LINE);
      process.stdout.write(`  ${YELLOW}>${RESET} ${this.searchText}${SHOW_CURSOR}`);
   }

   scrollToSelected() {
      if (this.selected < this.scrollOffset) {
         this.scrollOffset = this.selected;
      } else if (this.selected >= this.scrollOffset + this.visibleCount) {
         this.scrollOffset = this.selected - this.visibleCount + 1;
      }
   }

   moveUp() {
      if (this.selected > 0) {
         this.selected--;
      } else {
         this.selected = this.filtered.length - 1;
      }
      this.scrollToSelected();
   }

   moveDown() {
      if (this.selected < this.filtered.length - 1) {
         this.selected++;
      } else {
         this.selected = 0;
      }
      this.scrollToSelected();
   }

   pageUp() {
      this.selected = Math.max(0, this.selected - this.visibleCount);
      this.scrollToSelected();
   }

   pageDown() {
      this.selected = Math.min(this.filtered.length - 1, this.selected + this.visibleCount);
      this.scrollToSelected();
   }

   getSelected() {
      return this.filtered[this.selected] || null;
   }
}

export default async function picker(args = []) {
   ensureClaudeDir();

   // Parse arguments
   let projectFilter = null;
   let searchPreFilter = null;
   let quickPick = null;

   for (let i = 0; i < args.length; i++) {
      if (args[i] === '--project' && args[i + 1]) {
         projectFilter = args[i + 1];
         i++;
      } else if (args[i] === '--search' && args[i + 1]) {
         searchPreFilter = args[i + 1];
         i++;
      } else if (args[i] === '--quick' && args[i + 1]) {
         quickPick = parseInt(args[i + 1]);
         i++;
      }
   }

   const sessions = await loadSessions({ projectFilter, searchQuery: searchPreFilter });

   if (sessions.length === 0) {
      console.log(t('noSessionsFound'));
      process.exit(0);
   }

   // Quick pick
   if (quickPick !== null) {
      const s = sessions[quickPick - 1];
      if (!s) {
         console.log(t('sessionNotFoundNum', quickPick));
         process.exit(1);
      }
      console.log(`\n▶ claude --resume ${s.id}\n`);
      execFileSync('claude', ['--resume', s.id], { stdio: 'inherit' });
      process.exit(0);
   }

   if (!process.stdin.isTTY) {
      console.log(t('errorTTY'));
      process.exit(1);
   }

   const p = new SessionPicker(sessions);

   process.stdin.setRawMode(true);
   process.stdin.resume();
   process.stdin.setEncoding('utf8');

   process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR);
   p.render();

   function cleanup() {
      process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
      process.stdin.setRawMode(false);
   }

   process.on('exit', () => {
      process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
   });

   process.stdout.on('resize', () => {
      p.rows = process.stdout.rows || 30;
      p.cols = process.stdout.columns || 80;
      p.visibleCount = p.rows - 6;
      p.scrollToSelected();
      p.render();
   });

   const summarizePath = join(__dirname, 'summarize.mjs');

   process.stdin.on('data', (key) => {
      // Delete confirmation — FIRST priority
      if (p.confirmDelete) {
         const s = p.confirmDelete;
         p.confirmDelete = null;

         if (key === '\r' || key === '\n' || key === 'y' || key === 'Y') {
            // Deletion — JSON parsing for safety
            try {
               const histPath = join(CLAUDE_DIR, 'history.jsonl');
               if (existsSync(histPath)) {
                  const content = readFileSync(histPath, 'utf8');
                  writeFileSync(
                     histPath,
                     content
                        .split('\n')
                        .filter((l) => {
                           if (!l.trim()) return true;
                           try {
                              return JSON.parse(l).sessionId !== s.id;
                           } catch {
                              return true;
                           }
                        })
                        .join('\n'),
                  );
               }
               const idxPath = join(CLAUDE_DIR, 'session-index.json');
               if (existsSync(idxPath)) {
                  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
                  delete idx[s.id];
                  writeFileSync(idxPath, JSON.stringify(idx, null, 2));
               }
               // Remove session JSONL file from projects/
               if (existsSync(PROJECTS_DIR)) {
                  for (const dir of readdirSync(PROJECTS_DIR)) {
                     const sf = join(PROJECTS_DIR, dir, `${s.id}.jsonl`);
                     if (existsSync(sf)) unlinkSync(sf);
                  }
               }
            } catch {}

            p.allSessions = p.allSessions.filter((x) => x.id !== s.id);
            p.filter();
            if (p.selected >= p.filtered.length) {
               p.selected = Math.max(0, p.filtered.length - 1);
            }
            p.scrollToSelected();
            p.message = `${GREEN}✅ ${t('sessionDeleted')}${RESET}`;
            p.render();
            setTimeout(() => {
               p.message = '';
               p.render();
            }, 1500);
         } else {
            p.message = '';
            p.render();
         }
         return;
      }

      // Esc — quit
      if (key === '\x1b' || key === '\x03') {
         cleanup();
         process.exit(0);
      }

      // Enter — open
      if (key === '\r' || key === '\n') {
         const s = p.getSelected();
         if (s) {
            cleanup();
            // Проверяем доступна ли сессия через claude --resume
            // Claude хранит данные сессий в projects/{dir}/{id}.jsonl
            // Но --resume работает только с "живыми" сессиями
            // Проверяем: если в sessions/ нет файла — сессия "мертва"
            const sessionsDir = join(CLAUDE_DIR, 'sessions');
            let isAlive = false;
            if (existsSync(sessionsDir)) {
               for (const f of readdirSync(sessionsDir)) {
                  if (!f.endsWith('.json')) continue;
                  try {
                     const data = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'));
                     if (data.sessionId === s.id) { isAlive = true; break; }
                  } catch {}
               }
            }

            if (isAlive) {
               console.log(`\n▶ claude --resume ${s.id}\n`);
               try {
                  execFileSync('claude', ['--resume', s.id], { stdio: 'inherit' });
               } catch {}
            } else {
               console.log(`\n${t('sessionNotFound')}\n`);
               try {
                  const restorePath = join(__dirname, 'restore.mjs');
                  execFileSync('node', [restorePath, s.id], { stdio: 'inherit' });
               } catch {}
            }
            process.exit(0);
         }
         return;
      }

      // Ctrl-D — delete
      if (key === '\x04') {
         const s = p.getSelected();
         if (s) {
            p.message = `${RED}⚠️  ${t('confirmDelete', s.dateStr, s.project, s.summary)}${RESET}`;
            p.confirmDelete = s;
            p.render();
         }
         return;
      }

      // Ctrl-R — refresh
      if (key === '\x12') {
         p.message = `${DIM}${t('refreshing')}${RESET}`;
         p.render();
         loadSessions().then((fresh) => {
            p.allSessions = fresh;
            p.filter();
            p.scrollToSelected();
            p.message = `${GREEN}✅ ${t('refreshed', fresh.length)}${RESET}`;
            p.render();
            setTimeout(() => {
               p.message = '';
               p.render();
            }, 1500);
         });
         return;
      }

      // Ctrl-A — AI summaries
      if (key === '\x01') {
         cleanup();
         console.log(`\n${t('launchingAI')}\n`);
         try {
            execFileSync('node', [summarizePath], { stdio: 'inherit' });
         } catch (e) {
            console.error(`\n❌ ${e.message || 'Summarization failed'}`);
         }
         process.exit(0);
      }

      // Arrows
      if (key === '\x1b[A' || key === '\x1bOA') {
         p.moveUp();
         p.render();
         return;
      }
      if (key === '\x1b[B' || key === '\x1bOB') {
         p.moveDown();
         p.render();
         return;
      }
      if (key === '\x1b[5~') {
         p.pageUp();
         p.render();
         return;
      }
      if (key === '\x1b[6~') {
         p.pageDown();
         p.render();
         return;
      }

      // Backspace
      if (key === '\x7f' || key === '\x08') {
         if (p.searchText.length > 0) {
            p.searchText = p.searchText.slice(0, -1);
            p.filter();
            p.render();
         }
         return;
      }

      // Characters — search
      if (key.length === 1 && key >= ' ') {
         p.searchText += key;
         p.filter();
         p.render();
         return;
      }

      // Multibyte characters (unicode)
      if (key.length > 1 && !key.startsWith('\x1b')) {
         p.searchText += key;
         p.filter();
         p.render();
         return;
      }
   });
}
