export type SavedTacticsProgress = {
  rating: number;
  solved: number;
  attempted: number;
  recent: string[];
};

export const INITIAL_TACTICS_PROGRESS: SavedTacticsProgress = {
  rating: 1000,
  solved: 0,
  attempted: 0,
  recent: [],
};

const STORAGE_KEY = "schach-taktik-progress-v1";
const CHANGE_EVENT = "schach-taktik-progress-change";
let cachedProgress: SavedTacticsProgress | null = null;

function readProgress(): SavedTacticsProgress {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SavedTacticsProgress> | null;
    if (!saved) return INITIAL_TACTICS_PROGRESS;

    return {
      rating: Math.max(400, Math.min(2400, Number(saved.rating) || INITIAL_TACTICS_PROGRESS.rating)),
      solved: Math.max(0, Number(saved.solved) || 0),
      attempted: Math.max(0, Number(saved.attempted) || 0),
      recent: Array.isArray(saved.recent)
        ? Array.from(new Set(saved.recent.filter((id): id is string => typeof id === "string")))
        : [],
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
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(CHANGE_EVENT, handleChange);
  };
}

export function updateTacticsProgress(
  update: (current: SavedTacticsProgress) => SavedTacticsProgress,
): SavedTacticsProgress {
  const next = update(getTacticsProgress());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  cachedProgress = next;
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return next;
}
