// Memory subsystem configuration: read and write
import { readFileSync, writeFileSync } from 'node:fs';
import type { MemoryConfig } from './types.js';

const DEFAULTS: MemoryConfig = {
   enabled: false,
   extractionModel: 'haiku',
   maxRetries: 3,
   hotnessPruneThreshold: 0.1,
   maxMemories: 500,
   pruneTarget: 400,
};

export function readMemoryConfig(configPath: string): MemoryConfig {
   try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, 'utf8')) };
   } catch {
      return { ...DEFAULTS };
   }
}

export function writeMemoryConfig(configPath: string, config: Partial<MemoryConfig>): void {
   writeFileSync(configPath, JSON.stringify({ ...DEFAULTS, ...config }, null, 2));
}
