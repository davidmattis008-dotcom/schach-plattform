import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CageAiExplanationRequest } from "./contracts.ts";

export const CAGE_AI_KNOWLEDGE_RESULT_LIMIT = 5;
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
  return typeof row.source_key === "string" && row.source_key.length <= 120
    && typeof row.title === "string" && row.title.length <= 200
    && typeof row.source_url === "string" && row.source_url.startsWith("/") && !row.source_url.startsWith("//")
    && typeof row.heading === "string" && row.heading.length <= 200
    && typeof row.content === "string" && row.content.length <= MAX_KNOWLEDGE_CHUNK_LENGTH
    && typeof row.rank === "number" && Number.isFinite(row.rank);
}

export async function retrieveCageAiKnowledge(
  client: SupabaseClient,
  request: CageAiExplanationRequest,
): Promise<CageAiKnowledgeChunk[]> {
  const { data, error } = await client.rpc("search_cage_ai_knowledge", {
    p_query: buildCageAiKnowledgeQuery(request),
    p_limit: CAGE_AI_KNOWLEDGE_RESULT_LIMIT,
    p_source_keys: request.course?.sourceKeys ?? null,
  });
  if (error) throw new Error(`CageAI-Wissenssuche fehlgeschlagen: ${error.message}`);
  if (!Array.isArray(data) || !data.every(isSearchRow)) {
    throw new Error("CageAI-Wissenssuche hat ein ungültiges Ergebnis geliefert.");
  }
  return data.slice(0, CAGE_AI_KNOWLEDGE_RESULT_LIMIT).map((row, index) => ({
    chunkId: `${row.source_key}:${index}`,
    sourceKey: row.source_key,
    title: row.title,
    sourceUrl: row.source_url,
    heading: row.heading,
    content: row.content,
    rank: row.rank,
  }));
}
