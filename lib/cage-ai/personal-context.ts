import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CageAiContextPurpose } from "./contracts.ts";
import {
  selectCageAiPersonalContext,
  type CageAiPersonalContext,
  type RatingRow,
  type RecentGamesSummary,
} from "./context-selection";
import { getCageAiMemoryTypesForPurpose, MAX_CAGE_AI_MEMORIES } from "./memories";

export type { CageAiPersonalContext } from "./context-selection";

const MAX_RATINGS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecentGameSummary(value: unknown): RecentGamesSummary | null {
  if (!isRecord(value)
    || !Number.isInteger(value.sampleSize)
    || !Number.isInteger(value.wins)
    || !Number.isInteger(value.draws)
    || !Number.isInteger(value.losses)
    || !Number.isInteger(value.averageMoves)
    || !Array.isArray(value.timeControls)
    || !value.timeControls.every((timeControl) => typeof timeControl === "string")) return null;
  const sampleSize = Math.max(0, Math.min(20, Number(value.sampleSize)));
  const wins = Math.max(0, Math.min(sampleSize, Number(value.wins)));
  const draws = Math.max(0, Math.min(sampleSize - wins, Number(value.draws)));
  const losses = Math.max(0, Math.min(sampleSize - wins - draws, Number(value.losses)));
  return {
    sampleSize,
    wins,
    draws,
    losses,
    averageMoves: Math.max(0, Math.min(500, Number(value.averageMoves))),
    timeControls: [...new Set(value.timeControls as string[])]
      .map((timeControl) => timeControl.slice(0, 20))
      .filter(Boolean)
      .slice(0, 5),
  };
}

export async function loadCageAiPersonalContext(
  supabase: SupabaseClient,
  userId: string,
  purpose: CageAiContextPurpose,
): Promise<CageAiPersonalContext> {
  const ratingsQuery = purpose === "tactic_hint" || purpose === "course_question"
    ? Promise.resolve(null)
    : supabase
      .from("player_ratings")
      .select("game_mode, rating, rated_games")
      .eq("user_id", userId)
      .limit(MAX_RATINGS);
  const progressQuery = supabase.rpc("get_my_learning_context", { p_purpose: purpose });
  const memoriesQuery = supabase
    .from("cage_ai_memories")
    .select("memory_type, content")
    .eq("user_id", userId)
    .in("memory_type", [...getCageAiMemoryTypesForPurpose(purpose)])
    .order("updated_at", { ascending: false })
    .limit(MAX_CAGE_AI_MEMORIES);
  const gamesQuery = purpose === "training_plan"
    ? supabase.rpc("get_my_recent_game_training_summary")
    : Promise.resolve(null);
  const [ratingResult, progressResult, memoriesResult, gamesResult] = await Promise.all([
    ratingsQuery,
    progressQuery,
    memoriesQuery,
    gamesQuery,
  ]);
  if (ratingResult?.error) throw new Error("Elo-Kontext konnte nicht sicher geladen werden.", { cause: ratingResult.error });
  if (progressResult.error) throw new Error("Lernfortschritt konnte nicht sicher geladen werden.", { cause: progressResult.error });
  if (memoriesResult.error) throw new Error("ChessCageAI-Erinnerungen konnten nicht sicher geladen werden.", { cause: memoriesResult.error });
  if (gamesResult?.error) throw new Error("Deine gespeicherten Partien konnten nicht sicher geladen werden.", { cause: gamesResult.error });

  const ratings = (ratingResult?.data ?? []).filter((row): row is RatingRow =>
    typeof row.game_mode === "string"
    && typeof row.rating === "number"
    && typeof row.rated_games === "number"
  );
  return selectCageAiPersonalContext(
    purpose,
    ratings,
    isRecord(progressResult.data) ? progressResult.data : {},
    memoriesResult.data ?? [],
    readRecentGameSummary(gamesResult?.data),
  );
}
