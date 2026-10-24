export type SavedMove = {
  san: string;
  color: "w" | "b";
  from: string;
  to: string;
  promotion?: string;
};

export type OnlineGameRecord = {
  id: string;
  playedAt: string;
  timeControl: string;
  whiteName?: string;
  blackName?: string;
  color: "w" | "b";
  result: "win" | "loss" | "draw";
  resultText: string;
  reason: string;
  moves: SavedMove[];
};

const STORAGE_KEY = "schach-plattform-online-history-v1";
export const ONLINE_HISTORY_OWNER_KEY = "chesscage-online-history-owner-v1";

export function readOnlineHistory(): OnlineGameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((record): record is OnlineGameRecord =>
      Boolean(record && typeof record === "object" &&
        typeof record.id === "string" && typeof record.playedAt === "string" &&
        typeof record.timeControl === "string" &&
        (record.whiteName === undefined || typeof record.whiteName === "string") &&
        (record.blackName === undefined || typeof record.blackName === "string") &&
        (record.result === "win" || record.result === "loss" || record.result === "draw") &&
        Array.isArray(record.moves)),
    );
  } catch {
    return [];
  }
}

export function saveOnlineGame(record: OnlineGameRecord) {
  if (typeof window === "undefined") return;
  try {
    const current = readOnlineHistory();
    const updated = [record, ...current.filter((game) => game.id !== record.id)].slice(0, 100);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("online-history-updated"));
  } catch {
    // A full or disabled browser storage must not prevent the game from ending.
  }
}
