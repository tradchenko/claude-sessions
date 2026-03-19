/**
 * Types for the agent system
 */

import type { Session } from '../sessions/loader.js';

/** Supported agents */
export type AgentId = 'claude' | 'codex' | 'qwen' | 'gemini' | 'companion';

/** Installed agent information */
export interface AgentInfo {
   id: AgentId;
   name: string;
   icon: string;
   /** Path to agent home directory (~/.claude, ~/.codex, etc.) */
   homeDir: string;
   /** Path to CLI binary */
   cliBin: string | null;
   /** Instructions file (CLAUDE.md, AGENTS.md, QWEN.md, GEMINI.md) */
   instructionsFile: string;
   /** Hooks support */
   hooksSupport: boolean;
   /** Resume support */
   resumeSupport: boolean;
}

/** Agent adapter interface */
export interface AgentAdapter {
   /** Agent identifier */
   readonly id: AgentId;
   /** Display name */
   readonly name: string;
   /** Icon for the picker */
   readonly icon: string;

   /** Checks if the agent is installed on the system */
   detect(): AgentInfo | null;

   /** Loads agent sessions */
   loadSessions(options?: AgentLoadOptions): Promise<Session[]>;

   /** Returns command for session resume */
   getResumeCommand(sessionId: string): string[] | null;

   /** Checks if a session is alive (can be resumed). Returns false if session is dead/archived. */
   isSessionAlive(sessionId: string): boolean;

   /** Returns path to instructions file for memory injection */
   getInstructionsPath(): string | null;
}

/** Session loading options */
export interface AgentLoadOptions {
   projectFilter?: string;
   searchQuery?: string;
   limit?: number;
}

/** Agent detection result */
export interface DetectionResult {
   installed: AgentInfo[];
   newlyDetected: AgentInfo[];
}
