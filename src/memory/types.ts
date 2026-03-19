// Common types for the memory subsystem

/** Memory categories */
export type MemoryCategory = 'profile' | 'preferences' | 'entities' | 'events' | 'cases' | 'patterns';

/** Memory entry in the index */
export interface MemoryEntry {
   name: string;
   category: MemoryCategory;
   description: string;
   content: string;
   hotness: number;
   active_count: number;
   created: string;
   updated: string;
   source_sessions: string[];
   projects: string[];
}

/** Session metadata in the index */
export interface SessionMeta {
   summary: string;
   project: string;
   lastActive: number;
   l0?: L0Data;
   l1_ready?: boolean;
   extracted_at?: string;
   extraction_failed?: boolean;
   extraction_attempts?: number;
}

/** L0 extraction data */
export interface L0Data {
   summary: string;
   project: string;
   messageCount: number;
   files: string[];
   timestamp?: number;
   topics?: string[];
}

/** Memory index — root structure of index.json */
export interface MemoryIndex {
   version?: number;
   sessions: Record<string, SessionMeta>;
   memories: Record<string, MemoryEntry>;
}

/** Memory subsystem configuration */
export interface MemoryConfig {
   enabled: boolean;
   extractionModel: string;
   maxRetries: number;
   hotnessPruneThreshold: number;
   maxMemories: number;
   pruneTarget: number;
}

/** Chat message */
export interface ChatMessage {
   role: 'user' | 'assistant';
   content: string;
}

/** Memory candidate from LLM */
export interface MemoryCandidate {
   category: MemoryCategory;
   name: string;
   content: string;
}

/** Match result during deduplication */
export type MatchResult =
   | { type: 'exact'; key: string; existing: MemoryEntry }
   | { type: 'fuzzy'; key: string; existing: MemoryEntry; similarity: number }
   | { type: 'none' };

/** Candidate resolution result during deduplication */
export type ResolutionResult =
   | { action: 'create'; key: string }
   | { action: 'merge'; key: string; content: string }
   | { action: 'skip' }
   | { action: 'fuzzy'; key: string; existing: MemoryEntry; similarity: number };

/** Parsed memory file result */
export interface ParsedMemory {
   meta: MemoryEntry | null;
   content: string;
}
