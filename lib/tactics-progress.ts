import { ACCOUNT_PROGRESS_UPDATED_EVENT, writeProgressStorage } from "@/lib/account-progress";
import {
  clampTacticsRating,
  isTacticsDifficultyOffset,
  normalizeLegacyTacticsRating,
  TACTICS_PLACEMENT_TASKS,
  TACTICS_RATING_SCALE_VERSION,
  type TacticsDifficultyOffset,
} from "@/lib/tactics-rating";

export type SavedTacticsProgress = {
  rating: number;
  solved: number;
  attempted: number;
  recent: string[];
  placementAttempts: number;
  difficultyOffset: TacticsDifficultyOffset;
  ratingScaleVersion: number;
};

export const INITIAL_TACTICS_PROGRESS: SavedTacticsProgress = {
  rating: 1500,
  solved: 0,
  attempted: 0,
  recent: [],
  placementAttempts: 0,
  difficultyOffset: 0,
  ratingScaleVersion: TACTICS_RATING_SCALE_VERSION,
};

const STORAGE_KEY = "schach-taktik-progress-v1";
const CHANGE_EVENT = "schach-taktik-progress-change";
let cachedProgress: SavedTacticsProgress | null = null;

function readProgress(): SavedTacticsProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SavedTacticsProgress> | null;
    if (!saved) return INITIAL_TACTICS_PROGRESS;
    const attempted = Math.max(0, Number(saved.attempted) || 0);
    const hasRating = typeof saved.rating === "number" && Number.isFinite(saved.rating);
    const rawRating = typeof saved.rating === "number" && Number.isFinite(saved.rating)
      ? saved.rating
      : INITIAL_TACTICS_PROGRESS.rating;

    return {
      rating: saved.ratingScaleVersion === TACTICS_RATING_SCALE_VERSION
        ? clampTacticsRating(rawRating)
        : hasRating ? normalizeLegacyTacticsRating(rawRating) : INITIAL_TACTICS_PROGRESS.rating,
      solved: Math.max(0, Number(saved.solved) || 0),
      attempted,
      recent: Array.isArray(saved.recent)
        ? Array.from(new Set(saved.recent.filter((id): id is string => typeof id === "string")))
        : [],
      placementAttempts: Number.isInteger(saved.placementAttempts)
        ? Math.max(0, Math.min(TACTICS_PLACEMENT_TASKS, Number(saved.placementAttempts)))
        : attempted > 0 ? TACTICS_PLACEMENT_TASKS : 0,
      difficultyOffset: isTacticsDifficultyOffset(saved.difficultyOffset) ? saved.difficultyOffset : 0,
      ratingScaleVersion: TACTICS_RATING_SCALE_VERSION,
    };
  } catch {
    return INITIAL_TACTICS_PROGRESS;
  }
}

export function getTacticsProgress(): SavedTacticsProgress {
  cachedProgress ??= readProgress();
  return cachedProgress;
}

export function subscribeToTacticsProgress(onChange: () => void): () => void {
  const handleChange = (event: Event) => {
    if (event.type === "storage" && (event as StorageEvent).key !== STORAGE_KEY) return;
    cachedProgress = null;
    onChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener(ACCOUNT_PROGRESS_UPDATED_EVENT, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener(ACCOUNT_PROGRESS_UPDATED_EVENT, handleChange);
  };
}

export function updateTacticsProgress(
  update: (current: SavedTacticsProgress) => SavedTacticsProgress,
): SavedTacticsProgress {
  const next = { ...update(getTacticsProgress()), ratingScaleVersion: TACTICS_RATING_SCALE_VERSION };
  writeProgressStorage(STORAGE_KEY, JSON.stringify(next));
  cachedProgress = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}
