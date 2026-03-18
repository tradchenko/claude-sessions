import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULTS = {
   enabled: false,
   extractionModel: 'haiku',
   maxRetries: 3,
   hotnessPruneThreshold: 0.1,
   maxMemories: 500,
   pruneTarget: 400,
};

export function readMemoryConfig(configPath) {
   try {
      return { ...DEFAULTS, ...JSON.parse(readFileSync(configPath, 'utf8')) };
   } catch {
      return { ...DEFAULTS };
   }
}

export function writeMemoryConfig(configPath, config) {
   writeFileSync(configPath, JSON.stringify({ ...DEFAULTS, ...config }, null, 2));
}
