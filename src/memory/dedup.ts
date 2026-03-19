// Memory deduplication: match finding, content merging, candidate resolution
import type { MemoryCandidate, MemoryCategory, MemoryEntry, MemoryIndex, MatchResult, ResolutionResult } from './types.js';

const APPENDABLE = new Set<MemoryCategory>(['profile', 'preferences', 'entities', 'patterns']);
const FUZZY_THRESHOLD = 0.6;
const EXACT_SKIP_THRESHOLD = 0.8;

export function jaccardSimilarity(textA: string, textB: string): number {
   const setA = new Set(textA.toLowerCase().split(/\s+/).filter(Boolean));
   const setB = new Set(textB.toLowerCase().split(/\s+/).filter(Boolean));
   if (setA.size === 0 && setB.size === 0) return 1.0;
   if (setA.size === 0 || setB.size === 0) return 0;
   let intersection = 0;
   for (const w of setA) if (setB.has(w)) intersection++;
   return intersection / (setA.size + setB.size - intersection);
}

export function findMatch(candidate: MemoryCandidate, index: MemoryIndex): MatchResult {
   const exactKey = `${candidate.category}/${candidate.name}`;
   if (index.memories[exactKey]) {
      return { type: 'exact', key: exactKey, existing: index.memories[exactKey] };
   }

   let bestMatch: { key: string; mem: MemoryEntry } | null = null;
   let bestScore = 0;
   for (const [key, mem] of Object.entries(index.memories)) {
      if (mem.category !== candidate.category) continue;
      const sim = jaccardSimilarity(candidate.content || '', mem.content || '');
      if (sim > bestScore) {
         bestScore = sim;
         bestMatch = { key, mem };
      }
   }
   if (bestScore >= FUZZY_THRESHOLD && bestMatch) {
      return { type: 'fuzzy', key: bestMatch.key, existing: bestMatch.mem, similarity: bestScore };
   }
   return { type: 'none' };
}

export function mergeContent(existing: string, incoming: string, category: MemoryCategory): string {
   if (!APPENDABLE.has(category)) return existing;

   const existingLines = existing.split('\n').map((l) => l.trim()).filter(Boolean);
   const incomingLines = incoming.split('\n').map((l) => l.trim()).filter(Boolean);
   const existingSet = new Set(existingLines);
   const newLines = incomingLines.filter((l) => !existingSet.has(l));
   if (newLines.length === 0) return existing;
   return [...existingLines, ...newLines].join('\n');
}

export function resolveCandidate(candidate: MemoryCandidate, index: MemoryIndex): ResolutionResult {
   const match = findMatch(candidate, index);

   if (match.type === 'exact') {
      if (APPENDABLE.has(candidate.category)) {
         return { action: 'merge', key: match.key, content: mergeContent(match.existing.content || '', candidate.content, candidate.category) };
      }
      const sim = jaccardSimilarity(candidate.content || '', match.existing.content || '');
      if (sim > EXACT_SKIP_THRESHOLD) return { action: 'skip' };
      let suffix = 2;
      while (index.memories[`${candidate.category}/${candidate.name}-${suffix}`]) suffix++;
      return { action: 'create', key: `${candidate.category}/${candidate.name}-${suffix}` };
   }

   if (match.type === 'fuzzy') {
      return { action: 'fuzzy', key: match.key, existing: match.existing, similarity: match.similarity };
   }

   return { action: 'create', key: `${candidate.category}/${candidate.name}` };
}
