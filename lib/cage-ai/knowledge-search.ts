import type { CageAiExplanationRequest } from "./contracts.ts";

export const CAGE_AI_KNOWLEDGE_RESULT_LIMIT = 5;
export const CAGE_AI_KNOWLEDGE_MIN_RANK = 0.01;
const MAX_KNOWLEDGE_CHUNK_LENGTH = 8_000;

export type CageAiKnowledgeChunk = {
  chunkId: string;
  sourceKey: string;
  title: string;
  sourceUrl: string;
  heading: string;
  content: string;
  rank: number;
};

export type CageAiKnowledgeCitation = {
  title: string;
  url: string;
  heading: string;
};

type SearchRow = {
  source_key: string;
  title: string;
  source_url: string;
  heading: string;
  content: string;
  rank: number;
};

export function buildCageAiKnowledgeQuery(request: CageAiExplanationRequest) {
  const moveContext = request.analysis?.evidence.flatMap((move) => [
    move.playedMove,
    move.bestMove,
    ...move.bestVariation.slice(0, 4),
  ]) ?? [];
  return [
    request.course?.lessonTitle,
    request.tactic?.theme,
    request.question.slice(0, request.course ? 300 : 500),
    ...moveContext,
  ].filter(Boolean).join(" ").slice(0, 500);
}

function isSearchRow(value: unknown): value is SearchRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.source_key === "string" && /^[a-z0-9:_-]{1,120}$/.test(row.source_key)
    && typeof row.title === "string" && row.title.length >= 1 && row.title.length <= 200
    && typeof row.source_url === "string" && row.source_url.startsWith("/") && !row.source_url.startsWith("//")
    && typeof row.heading === "string" && row.heading.length >= 1 && row.heading.length <= 200
    && typeof row.content === "string" && row.content.length >= 1 && row.content.length <= MAX_KNOWLEDGE_CHUNK_LENGTH
    && typeof row.rank === "number" && Number.isFinite(row.rank) && row.rank >= 0;
}

export function normalizeCageAiKnowledgeRows(value: unknown): CageAiKnowledgeChunk[] {
  if (!Array.isArray(value) || !value.every(isSearchRow)) {
    throw new Error("ChessCageAI-Wissenssuche hat ein ungültiges Ergebnis geliefert.");
  }
  return value
    .filter((row) => row.rank >= CAGE_AI_KNOWLEDGE_MIN_RANK)
    .slice(0, CAGE_AI_KNOWLEDGE_RESULT_LIMIT)
    .map((row, index) => ({
      chunkId: `${row.source_key}:${index}`,
      sourceKey: row.source_key,
      title: row.title,
      sourceUrl: row.source_url,
      heading: row.heading,
      content: row.content,
      rank: row.rank,
    }));
}

export function resolveCageAiKnowledgeCitations(
  sourceKeys: readonly string[],
  chunks: readonly CageAiKnowledgeChunk[],
): CageAiKnowledgeCitation[] | null {
  const availableChunks = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  if (sourceKeys.some((chunkId) => !availableChunks.has(chunkId))) return null;
  return [...new Set(sourceKeys)].flatMap((chunkId) => {
    const chunk = availableChunks.get(chunkId);
    return chunk ? [{ title: chunk.title, url: chunk.sourceUrl, heading: chunk.heading }] : [];
  });
}
