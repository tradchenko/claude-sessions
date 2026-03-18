export const CATEGORY_WEIGHTS = {
   profile: 0.5,
   preferences: 0.7,
   entities: 0.4,
   events: 0.3,
   cases: 0.8,
   patterns: 0.6,
};

// Decay constant tau (days). Score drops to ~0.5 at 21 days, ~0.37 at 30 days.
const DECAY_TAU_DAYS = 30;

export function calculateHotness(memory, context) {
   const { lastAccessed = Date.now(), active_count = 0, projects = [], category = 'cases' } = memory;
   const { maxActiveCount = 1, currentProject = '' } = context;

   const daysSince = (Date.now() - lastAccessed) / (1000 * 60 * 60 * 24);
   const recencyScore = Math.exp(-daysSince / DECAY_TAU_DAYS);

   const frequencyScore = maxActiveCount > 0
      ? Math.min(active_count / maxActiveCount, 1.0)
      : 0;

   const projectMatch = projects.includes(currentProject) ? 1.0 : (projects.length === 0 ? 0.3 : 0.0);
   const categoryWeight = CATEGORY_WEIGHTS[category] || 0.5;
   const relevanceScore = projectMatch * 0.6 + categoryWeight * 0.4;

   return recencyScore * 0.3 + frequencyScore * 0.4 + relevanceScore * 0.3;
}

export function recalculateAll(index, currentProject) {
   const memories = Object.values(index.memories);
   const maxActiveCount = Math.max(1, ...memories.map(m => m.active_count || 0));

   for (const [key, mem] of Object.entries(index.memories)) {
      mem.hotness = calculateHotness(mem, { maxActiveCount, currentProject });
   }
   return index;
}
