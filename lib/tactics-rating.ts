import ratingConfig from "./tactics-rating-config.json";

export const TACTICS_RATING_MIN = ratingConfig.ratingMin;
export const TACTICS_RATING_MAX = ratingConfig.ratingMax;
export const TACTICS_RATING_SCALE_VERSION = ratingConfig.ratingScaleVersion;
export const TACTICS_PLACEMENT_TASKS = 5;

export type TacticsDifficultyOffset = -300 | -200 | -100 | 0 | 100 | 200 | 300;

const validDifficultyOffsets: TacticsDifficultyOffset[] = [-300, -200, -100, 0, 100, 200, 300];

export function isTacticsDifficultyOffset(value: unknown): value is TacticsDifficultyOffset {
  return typeof value === "number" && validDifficultyOffsets.some((offset) => offset === value);
}

export function clampTacticsRating(rating: number): number {
  return Math.max(TACTICS_RATING_MIN, Math.min(TACTICS_RATING_MAX, Math.round(rating)));
}

export function normalizeLegacyTacticsRating(rating: number): number {
  const legacyRating = Math.max(
    ratingConfig.legacyRatingMin,
    Math.min(ratingConfig.legacyRatingMax, Math.round(rating)),
  );
  return Math.round(
    ((legacyRating - ratingConfig.legacyRatingMin)
      / (ratingConfig.legacyRatingMax - ratingConfig.legacyRatingMin))
      * (TACTICS_RATING_MAX - TACTICS_RATING_MIN),
  );
}
