import assert from "node:assert/strict";
import {
  MAX_CAGE_AI_MEMORY_LENGTH,
  MAX_CAGE_AI_MEMORIES,
  normalizeCageAiMemoryDraft,
  selectRelevantCageAiMemories,
} from "../lib/cage-ai/memories.ts";
import { selectCageAiPersonalContext } from "../lib/cage-ai/context-selection.ts";

assert.equal(MAX_CAGE_AI_MEMORIES, 100);
assert.deepEqual(normalizeCageAiMemoryDraft({
  memoryType: "training_goal",
  content: "  Sicherer im Endspiel werden.  ",
}), {
  memoryType: "training_goal",
  content: "Sicherer im Endspiel werden.",
});
assert.equal(normalizeCageAiMemoryDraft({ memoryType: "raw_chat", content: "not allowed" }), null);
assert.equal(normalizeCageAiMemoryDraft({
  memoryType: "weakness",
  content: "x".repeat(MAX_CAGE_AI_MEMORY_LENGTH + 1),
}), null);

const memories = [
  { memory_type: "training_goal", content: "Endspiele trainieren." },
  { memory_type: "conversation_summary", content: "Besprochen wurde ein kompletter alter Chat." },
  { memory_type: "weakness", content: "Ich übersehe häufig Fesselungen." },
  { memory_type: "personal_preference", content: "Bitte kurze, schrittweise Hinweise." },
];

assert.deepEqual(
  selectRelevantCageAiMemories(memories, "tactic_hint"),
  [
    { memoryType: "weakness", content: "Ich übersehe häufig Fesselungen." },
    { memoryType: "personal_preference", content: "Bitte kurze, schrittweise Hinweise." },
  ],
);
assert.equal(selectRelevantCageAiMemories(memories, "course_question")
  .some((memory) => memory.memoryType === "conversation_summary"), false);

const personalContext = selectCageAiPersonalContext(
  "training_plan",
  [],
  {},
  memories,
);
assert.deepEqual(personalContext.memories?.map((memory) => memory.memoryType), [
  "training_goal",
  "weakness",
  "personal_preference",
  "conversation_summary",
]);

const oversizedMemories = Array.from({ length: 20 }, (_, index) => ({
  memory_type: "weakness",
  content: `${index}: ${"x".repeat(590)}`,
}));
const boundedMemories = selectRelevantCageAiMemories(oversizedMemories, "tactic_hint");
assert.ok(boundedMemories.length <= 10);
assert.ok(boundedMemories.reduce((total, memory) => total + memory.content.length, 0) <= 3_000);

console.log("Validated CageAI memory limits, purpose-based selection, and bounded personal context.");
