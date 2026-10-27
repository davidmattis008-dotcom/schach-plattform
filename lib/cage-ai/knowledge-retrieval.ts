import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CageAiExplanationRequest } from "./contracts.ts";
import {
  buildCageAiKnowledgeQuery,
  CAGE_AI_KNOWLEDGE_RESULT_LIMIT,
  normalizeCageAiKnowledgeRows,
  type CageAiKnowledgeChunk,
} from "./knowledge-search.ts";

export { buildCageAiKnowledgeQuery } from "./knowledge-search.ts";
export { CAGE_AI_KNOWLEDGE_RESULT_LIMIT } from "./knowledge-search.ts";
export type { CageAiKnowledgeChunk } from "./knowledge-search.ts";

export async function retrieveCageAiKnowledge(
  client: SupabaseClient,
  request: CageAiExplanationRequest,
): Promise<CageAiKnowledgeChunk[]> {
  const { data, error } = await client.rpc("search_cage_ai_knowledge", {
    p_query: buildCageAiKnowledgeQuery(request),
    p_limit: CAGE_AI_KNOWLEDGE_RESULT_LIMIT,
    p_source_keys: request.course?.sourceKeys ?? null,
  });
  if (error) throw new Error(`ChessCageAI-Wissenssuche fehlgeschlagen: ${error.message}`);
  return normalizeCageAiKnowledgeRows(data);
}
