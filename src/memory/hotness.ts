// Memory hotness calculation: recency, frequency, relevance
import type { MemoryCategory, MemoryIndex } from './types.js';

export const CATEGORY_WEIGHTS: Record<MemoryCategory, number> = {
   profile: 0.5,
   preferences: 0.7,
   entities: 0.4,
   events: 0.3,
   cases: 0.8,
   patterns: 0.6,
};

// Decay constant tau (in days). Score drops to ~0.5 in 21 days, ~0.37 in 30 days.
const DECAY_TAU_DAYS = 30;

interface HotnessMemoryInput {
   lastAccessed?: number;
   active_count?: number;
   projects?: string[];
   category?: MemoryCategory;
}

interface HotnessContext {
   maxActiveCount?: number;
   currentProject?: string;
}

export function calculateHotness(memory: HotnessMemoryInput, context: HotnessContext): number {
   const { lastAccessed = Date.now(), active_count = 0, projects = [], category = 'cases' } = memory;
   const { maxActiveCount = 1, currentProject = '' } = context;

   const daysSince = (Date.now() - lastAccessed) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.exp(-daysSince / DECAY_TAU_DAYS);

   const frequencyScore = maxActiveCount > 0 ? Math.min(active_count / maxActiveCount, 1.0) : 0;

   const projectMatch = projects.includes(currentProject) ? 1.0 : projects.length === 0 ? 0.3 : 0.0;
   const categoryWeight = CATEGORY_WEIGHTS[category] || 0.5;
   const relevanceScore = projectMatch * 0.6 + categoryWeight * 0.4;

   return recencyScore * 0.3 + frequencyScore * 0.4 + relevanceScore * 0.3;
}

export function recalculateAll(index: MemoryIndex, currentProject: string): MemoryIndex {
   const memories = Object.values(index.memories);
   const maxActiveCount = Math.max(1, ...memories.map((m) => m.active_count || 0));

   for (const mem of Object.values(index.memories)) {
      mem.hotness = calculateHotness(mem, { maxActiveCount, currentProject });
   }
   return index;
}
