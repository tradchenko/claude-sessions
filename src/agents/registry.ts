/**
 * Agent registry — detection and adapter management
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { MEMORY_DIR } from '../core/config.js';
import type { AgentAdapter, AgentId, AgentInfo, DetectionResult } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { qwenAdapter } from './qwen.js';
import { geminiAdapter } from './gemini.js';
import { companionAdapter } from './companion.js';

/** All registered adapters */
const ALL_ADAPTERS: AgentAdapter[] = [
   claudeAdapter,
   codexAdapter,
   qwenAdapter,
   geminiAdapter,
   companionAdapter,
];

/** Known agents configuration file */
const AGENTS_CONFIG = join(MEMORY_DIR, 'agents.json');

/** Agent configuration structure */
interface AgentsConfig {
   /** Known (previously detected) agents */
   known: AgentId[];
   /** Primary agent for restore */
   primary: AgentId;
   /** Disabled agents (user can hide) */
   disabled: AgentId[];
}

/** Default configuration */
const DEFAULT_CONFIG: AgentsConfig = {
   known: [],
   primary: 'claude',
   disabled: [],
};

/** Reads agent configuration */
export function readAgentsConfig(): AgentsConfig {
   try {
      if (!existsSync(AGENTS_CONFIG)) return { ...DEFAULT_CONFIG };
      const data = JSON.parse(readFileSync(AGENTS_CONFIG, 'utf8')) as Partial<AgentsConfig>;
      return {
         known: data.known ?? [],
         primary: data.primary ?? 'claude',
         disabled: data.disabled ?? [],
      };
   } catch {
      return { ...DEFAULT_CONFIG };
   }
}

/** Saves agent configuration */
export function writeAgentsConfig(config: AgentsConfig): void {
   mkdirSync(dirname(AGENTS_CONFIG), { recursive: true });
   writeFileSync(AGENTS_CONFIG, JSON.stringify(config, null, 2));
}

/** Returns adapter by ID */
export function getAdapter(id: AgentId): AgentAdapter | undefined {
   return ALL_ADAPTERS.find((a) => a.id === id);
}

/** Returns all registered adapters */
export function getAllAdapters(): AgentAdapter[] {
   return ALL_ADAPTERS;
}

/** Cache for detection results (avoid repeated `which` calls) */
let detectionCache: DetectionResult | null = null;

/**
 * Detects installed agents.
 * Compares with previously known — highlights new ones.
 * Results are cached for the lifetime of the process.
 */
export function detectAgents(): DetectionResult {
   if (detectionCache) return detectionCache;

   const config = readAgentsConfig();
   const installed: AgentInfo[] = [];
   const newlyDetected: AgentInfo[] = [];

   for (const adapter of ALL_ADAPTERS) {
      const info = adapter.detect();
      if (!info) continue;

      installed.push(info);

      if (!config.known.includes(adapter.id)) {
         newlyDetected.push(info);
      }
   }

   detectionCache = { installed, newlyDetected };
   return detectionCache;
}

/** Clear detection cache (for testing or re-detection) */
export function clearDetectionCache(): void {
   detectionCache = null;
}

/**
 * Updates the list of known agents after detection.
 * Called after the user has seen the notification about new agents.
 */
export function acknowledgeAgents(agentIds: AgentId[]): void {
   const config = readAgentsConfig();
   for (const id of agentIds) {
      if (!config.known.includes(id)) {
         config.known.push(id);
      }
   }
   writeAgentsConfig(config);
}

/**
 * Returns active (installed and not disabled) adapters.
 */
export function getActiveAdapters(): AgentAdapter[] {
   const config = readAgentsConfig();
   return ALL_ADAPTERS.filter((adapter) => {
      if (config.disabled.includes(adapter.id)) return false;
      return adapter.detect() !== null;
   });
}
