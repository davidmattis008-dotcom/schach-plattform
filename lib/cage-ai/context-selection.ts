import type { CageAiContextPurpose } from "./contracts.ts";
import { selectRelevantCageAiMemories, type CageAiMemoryContext } from "./memories.ts";

const COURSE_PROGRESS_KEYS = {
  rules: "schach-regeln-lernen-v1",
  openings: "schach-eroeffnungen-gelernt-v1",
  checkmate: "schach-mattsetzen-kurs-v1",
  endgames: "schach-endspiel-lernen-v1",
} as const;
const TACTICS_PROGRESS_KEY = "schach-taktik-progress-v1";
const MAX_RATINGS = 4;

export type RatingRow = {
  game_mode: string;
  rating: number;
  rated_games: number;
};

export type RecentGamesSummary = {
  sampleSize: number;
  wins: number;
  draws: number;
  losses: number;
  averageMoves: number;
  timeControls: string[];
};

type TacticsSummary = {
  rating: number;
  solved: number;
  attempted: number;
  dailyExercisesCompleted: number;
};

type LearningSummary = {
  tactics?: TacticsSummary;
  completedCourses?: {
    rules: number;
    openings: number;
    checkmate: number;
    endgames: number;
  };
};

export type CageAiPersonalContext = {
  purpose: CageAiContextPurpose;
  ratings?: RatingRow[];
  ratedGamesPlayed?: number;
  learning?: LearningSummary;
  memories?: CageAiMemoryContext[];
  recentGames?: {
    sampleSize: number;
    wins: number;
    draws: number;
    losses: number;
    averageMoves: number;
    timeControls: string[];
  };
};

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTacticsSummary(progress: Record<string, unknown>): TacticsSummary | undefined {
  const raw = progress[TACTICS_PROGRESS_KEY];
  if (!isRecord(raw)) return undefined;
  const rating = boundedInteger(raw.rating, 0, 3000);
  const solved = boundedInteger(raw.solved, 0, 100_000);
  const attempted = boundedInteger(raw.attempted, 0, 100_000);
  const dailyExercisesCompleted = boundedInteger(raw.dailyExercisesCompleted, 0, 100_000);
  if (rating === null && solved === null && attempted === null && dailyExercisesCompleted === null) return undefined;
  return {
    rating: rating ?? 1500,
    solved: solved ?? 0,
    attempted: attempted ?? 0,
    dailyExercisesCompleted: dailyExercisesCompleted ?? 0,
  };
}

function countCompleted(progress: Record<string, unknown>, key: string) {
  const value = progress[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(2_000, Math.trunc(value)));
  }
  return Array.isArray(value)
    ? Math.min(2_000, value.filter((item) => typeof item === "string").length)
    : 0;
}

export function selectCageAiPersonalContext(
  purpose: CageAiContextPurpose,
  ratings: RatingRow[],
  progress: Record<string, unknown>,
  memories: readonly { memory_type: string; content: string }[] = [],
  recentGames: RecentGamesSummary | null = null,
): CageAiPersonalContext {
  const relevantMemories = selectRelevantCageAiMemories(memories, purpose);
  const memoryContext = relevantMemories.length ? { memories: relevantMemories } : {};
  if (purpose === "course_question") return { purpose, ...memoryContext };

  const normalizedRatings = ratings
    .filter((row) => ["bullet", "blitz", "rapid", "classical"].includes(row.game_mode))
    .map((row) => ({
      game_mode: row.game_mode,
      rating: boundedInteger(row.rating, 0, 10_000),
      rated_games: boundedInteger(row.rated_games, 0, 1_000_000),
    }))
    .filter((row): row is { game_mode: string; rating: number; rated_games: number } =>
      row.rating !== null && row.rated_games !== null
    )
    .slice(0, MAX_RATINGS);

  if (purpose === "tactic_hint") {
    const tactics = readTacticsSummary(progress);
    return {
      purpose,
      ...memoryContext,
      ...(tactics ? { learning: { tactics } } : {}),
    };
  }

  const learning: LearningSummary = {};
  const tactics = readTacticsSummary(progress);
  if (tactics) learning.tactics = tactics;
  if (purpose === "training_plan") {
    learning.completedCourses = {
      rules: countCompleted(progress, COURSE_PROGRESS_KEYS.rules),
      openings: countCompleted(progress, COURSE_PROGRESS_KEYS.openings),
      checkmate: countCompleted(progress, COURSE_PROGRESS_KEYS.checkmate),
      endgames: countCompleted(progress, COURSE_PROGRESS_KEYS.endgames),
    };
  }
  const ratedGamesPlayed = normalizedRatings.reduce((total, row) => total + row.rated_games, 0);
  const recentGameSummary = purpose === "training_plan" && recentGames && recentGames.sampleSize > 0
    ? recentGames
    : undefined;

  return {
    purpose,
    ...memoryContext,
    ...(normalizedRatings.length ? { ratings: normalizedRatings } : {}),
    ...(purpose === "game_review" && normalizedRatings.length ? { ratedGamesPlayed } : {}),
    ...(Object.keys(learning).length ? { learning } : {}),
    ...(recentGameSummary ? { recentGames: recentGameSummary } : {}),
  };
}
