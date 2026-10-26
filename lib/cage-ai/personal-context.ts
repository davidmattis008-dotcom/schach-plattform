import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CageAiContextPurpose } from "./contracts.ts";
import { selectCageAiPersonalContext, type CageAiPersonalContext, type RatingRow } from "./context-selection";

export type { CageAiPersonalContext } from "./context-selection";

const MAX_RATINGS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  const [ratingResult, progressResult] = await Promise.all([
    ratingsQuery,
    progressQuery,
  ]);
  if (ratingResult?.error) throw new Error("Elo-Kontext konnte nicht sicher geladen werden.", { cause: ratingResult.error });
  if (progressResult.error) throw new Error("Lernfortschritt konnte nicht sicher geladen werden.", { cause: progressResult.error });

  const ratings = (ratingResult?.data ?? []).filter((row): row is RatingRow =>
    typeof row.game_mode === "string"
    && typeof row.rating === "number"
    && typeof row.rated_games === "number"
  );
  return selectCageAiPersonalContext(
    purpose,
    ratings,
    isRecord(progressResult.data) ? progressResult.data : {},
  );
}
