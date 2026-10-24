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
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const saved = value as Record<string, unknown>;
        progress[key] = {
          rating: boundedInteger(saved.rating, 1000, 400, 2400),
          solved: boundedInteger(saved.solved, 0, 0, 100000),
          attempted: boundedInteger(saved.attempted, 0, 0, 100000),
          recent: stringList(saved.recent, 2000),
        };
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
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const saved = entry as Record<string, unknown>;
      const serialized = JSON.stringify({
        rating: boundedInteger(saved.rating, 1000, 400, 2400),
        solved: boundedInteger(saved.solved, 0, 0, 100000),
        attempted: boundedInteger(saved.attempted, 0, 0, 100000),
        recent: stringList(saved.recent, 2000),
      });
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
        rating: primary?.rating ?? 1000,
        solved: Math.max(a?.solved ?? 0, b?.solved ?? 0),
        attempted: Math.max(a?.attempted ?? 0, b?.attempted ?? 0),
        recent: stringList([...(a?.recent ?? []), ...(b?.recent ?? [])], 2000),
      };
    } else {
      const values = [...stringList(first, 2000), ...stringList(second, 2000)];
      if (values.length > 0) merged[key] = Array.from(new Set(values));
    }
  }
  return merged;
}

function asTacticsProgress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const saved = value as Record<string, unknown>;
  return {
    rating: boundedInteger(saved.rating, 1000, 400, 2400),
    solved: boundedInteger(saved.solved, 0, 0, 100000),
    attempted: boundedInteger(saved.attempted, 0, 0, 100000),
    recent: stringList(saved.recent, 2000),
  };
}

function stringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(-limit);
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
