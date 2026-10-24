import {
  clampTacticsRating,
  isTacticsDifficultyOffset,
  normalizeLegacyTacticsRating,
  TACTICS_PLACEMENT_TASKS,
  TACTICS_RATING_SCALE_VERSION,
  type TacticsDifficultyOffset,
} from "@/lib/tactics-rating";

export const ACCOUNT_PROGRESS_STORAGE_KEYS = [
  "schach-selbstlernen-v1",
  "schach-regeln-lernen-v1",
  "schach-eroeffnungen-gelernt-v1",
  "schach-mattsetzen-kurs-v1",
  "schach-endspiel-lernen-v1",
  "schach-taktik-progress-v1",
] as const;

export const ACCOUNT_PROGRESS_OWNER_KEY = "chesscage-account-progress-owner-v1";
export const ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT = "chesscage-account-progress-local-change";
export const ACCOUNT_PROGRESS_UPDATED_EVENT = "chesscage-account-progress-updated";

export type AccountProgressPayload = Record<string, unknown>;

export function writeProgressStorage(key: string, value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event(ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT));
}

export function subscribeToAccountProgressUpdates(onUpdate: () => void) {
  window.addEventListener(ACCOUNT_PROGRESS_UPDATED_EVENT, onUpdate);
  return () => window.removeEventListener(ACCOUNT_PROGRESS_UPDATED_EVENT, onUpdate);
}

export function readAccountProgress(): AccountProgressPayload {
  const progress: AccountProgressPayload = {};
  for (const key of ACCOUNT_PROGRESS_STORAGE_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      const value: unknown = JSON.parse(raw);
      if (key === "schach-taktik-progress-v1") {
        const tactics = normalizeTacticsProgress(value, false);
        if (tactics) progress[key] = tactics;
      } else if (Array.isArray(value)) {
        progress[key] = stringList(value, 2000);
      }
    } catch (error) {
      console.error(`Lokaler Fortschritt ${key} konnte nicht gelesen werden:`, error);
    }
  }
  return progress;
}

export function applyAccountProgress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const progress = value as Record<string, unknown>;
  let changed = false;
  for (const key of ACCOUNT_PROGRESS_STORAGE_KEYS) {
    if (!(key in progress)) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        changed = true;
      }
      continue;
    }
    const entry = progress[key];
    if (key === "schach-taktik-progress-v1") {
      const tactics = normalizeTacticsProgress(entry, true);
      if (!tactics) continue;
      const serialized = JSON.stringify(tactics);
      if (localStorage.getItem(key) !== serialized) {
        localStorage.setItem(key, serialized);
        changed = true;
      }
    } else if (Array.isArray(entry)) {
      const serialized = JSON.stringify(stringList(entry, 2000));
      if (localStorage.getItem(key) !== serialized) {
        localStorage.setItem(key, serialized);
        changed = true;
      }
    }
  }
  if (changed) window.dispatchEvent(new Event(ACCOUNT_PROGRESS_UPDATED_EVENT));
}

export function mergeAccountProgress(
  left: AccountProgressPayload,
  right: AccountProgressPayload,
): AccountProgressPayload {
  const merged: AccountProgressPayload = {};
  for (const key of ACCOUNT_PROGRESS_STORAGE_KEYS) {
    const first = left[key];
    const second = right[key];
    if (key === "schach-taktik-progress-v1") {
      const a = asTacticsProgress(first);
      const b = asTacticsProgress(second);
      if (!a && !b) continue;
      const primary = (b?.attempted ?? 0) >= (a?.attempted ?? 0) ? b : a;
      merged[key] = {
        rating: primary?.rating ?? 1500,
        solved: Math.max(a?.solved ?? 0, b?.solved ?? 0),
        attempted: Math.max(a?.attempted ?? 0, b?.attempted ?? 0),
        recent: stringList([...(a?.recent ?? []), ...(b?.recent ?? [])], 2000),
        placementAttempts: Math.max(a?.placementAttempts ?? 0, b?.placementAttempts ?? 0),
        difficultyOffset: b?.difficultyOffset ?? a?.difficultyOffset ?? 0,
        dailyExercisesCompleted: Math.max(a?.dailyExercisesCompleted ?? 0, b?.dailyExercisesCompleted ?? 0),
        dailyLastCompletedDate: laterDate(a?.dailyLastCompletedDate, b?.dailyLastCompletedDate),
        dailyAssignmentDate: laterDate(a?.dailyAssignmentDate, b?.dailyAssignmentDate),
        dailyAssignmentId: (b?.dailyAssignmentDate ?? "") >= (a?.dailyAssignmentDate ?? "")
          ? b?.dailyAssignmentId ?? null
          : a?.dailyAssignmentId ?? null,
        ratingScaleVersion: TACTICS_RATING_SCALE_VERSION,
      };
    } else {
      const values = [...stringList(first, 2000), ...stringList(second, 2000)];
      if (values.length > 0) merged[key] = Array.from(new Set(values));
    }
  }
  return merged;
}

function asTacticsProgress(value: unknown) {
  return normalizeTacticsProgress(value, false);
}

function normalizeTacticsProgress(value: unknown, defaultOffset: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  const hasRating = typeof saved.rating === "number" && Number.isFinite(saved.rating);
  const rawRating = hasRating ? saved.rating as number : 1500;
  const attempted = boundedInteger(saved.attempted, 0, 0, 100000);
  const tactics: {
    rating: number;
    solved: number;
    attempted: number;
    recent: string[];
    placementAttempts: number;
    difficultyOffset?: TacticsDifficultyOffset;
    dailyExercisesCompleted: number;
    dailyLastCompletedDate: string | null;
    dailyAssignmentDate: string | null;
    dailyAssignmentId: string | null;
    ratingScaleVersion: number;
  } = {
    rating: saved.ratingScaleVersion === TACTICS_RATING_SCALE_VERSION
      ? clampTacticsRating(rawRating)
      : hasRating ? normalizeLegacyTacticsRating(rawRating) : 1500,
    solved: boundedInteger(saved.solved, 0, 0, 100000),
    attempted,
    recent: stringList(saved.recent, 2000),
    placementAttempts: Number.isInteger(saved.placementAttempts)
      ? boundedInteger(saved.placementAttempts, 0, 0, TACTICS_PLACEMENT_TASKS)
      : attempted > 0 ? TACTICS_PLACEMENT_TASKS : 0,
    dailyExercisesCompleted: boundedInteger(saved.dailyExercisesCompleted, 0, 0, 100000),
    dailyLastCompletedDate: dateKey(saved.dailyLastCompletedDate),
    dailyAssignmentDate: dateKey(saved.dailyAssignmentDate),
    dailyAssignmentId: typeof saved.dailyAssignmentId === "string" ? saved.dailyAssignmentId.slice(0, 128) : null,
    ratingScaleVersion: TACTICS_RATING_SCALE_VERSION,
  };
  if (isTacticsDifficultyOffset(saved.difficultyOffset)) tactics.difficultyOffset = saved.difficultyOffset;
  else if (defaultOffset) tactics.difficultyOffset = 0;
  return tactics;
}

function stringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(-limit);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function dateKey(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function laterDate(first: string | null | undefined, second: string | null | undefined) {
  if (!first) return second ?? null;
  if (!second) return first;
  return first >= second ? first : second;
}
