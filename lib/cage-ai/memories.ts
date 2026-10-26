import type { CageAiContextPurpose } from "./contracts.ts";

export const CAGE_AI_MEMORY_TYPES = [
  "training_goal",
  "playing_strength",
  "weakness",
  "training_preference",
  "progress",
  "personal_preference",
  "conversation_summary",
] as const;

export type CageAiMemoryType = (typeof CAGE_AI_MEMORY_TYPES)[number];

export type CageAiMemoryDraft = {
  memoryType: CageAiMemoryType;
  content: string;
};

export type CageAiMemoryContext = Pick<CageAiMemoryDraft, "memoryType" | "content">;

export const MAX_CAGE_AI_MEMORIES = 100;
export const MAX_CAGE_AI_MEMORY_LENGTH = 600;
const MAX_CONTEXT_MEMORIES = 10;
const MAX_CONTEXT_CHARACTERS = 3_000;

const MEMORY_TYPES_BY_PURPOSE: Record<CageAiContextPurpose, readonly CageAiMemoryType[]> = {
  game_review: [
    "playing_strength",
    "weakness",
    "training_goal",
    "progress",
    "personal_preference",
    "conversation_summary",
  ],
  tactic_hint: [
    "playing_strength",
    "weakness",
    "training_preference",
    "personal_preference",
  ],
  training_plan: CAGE_AI_MEMORY_TYPES,
  course_question: [
    "playing_strength",
    "training_goal",
    "training_preference",
    "personal_preference",
  ],
};

export function getCageAiMemoryTypesForPurpose(purpose: CageAiContextPurpose) {
  return MEMORY_TYPES_BY_PURPOSE[purpose];
}

export function isCageAiMemoryType(value: unknown): value is CageAiMemoryType {
  return typeof value === "string"
    && CAGE_AI_MEMORY_TYPES.some((memoryType) => memoryType === value);
}

export function normalizeCageAiMemoryDraft(value: unknown): CageAiMemoryDraft | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (!isCageAiMemoryType(draft.memoryType) || typeof draft.content !== "string") return null;
  const content = draft.content.trim();
  if (content.length < 3 || content.length > MAX_CAGE_AI_MEMORY_LENGTH) return null;
  return { memoryType: draft.memoryType, content };
}

export function selectRelevantCageAiMemories(
  memories: readonly { memory_type: string; content: string }[],
  purpose: CageAiContextPurpose,
): CageAiMemoryContext[] {
  const allowedTypes = MEMORY_TYPES_BY_PURPOSE[purpose];
  let totalCharacters = 0;
  const selected: CageAiMemoryContext[] = [];

  for (const memoryType of allowedTypes) {
    for (const memory of memories) {
      if (memory.memory_type !== memoryType || typeof memory.content !== "string") continue;
      const content = memory.content.trim();
      if (!content || content.length > MAX_CAGE_AI_MEMORY_LENGTH
        || totalCharacters + content.length > MAX_CONTEXT_CHARACTERS) continue;
      selected.push({ memoryType, content });
      totalCharacters += content.length;
      if (selected.length >= MAX_CONTEXT_MEMORIES) return selected;
    }
  }

  return selected;
}
