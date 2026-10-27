import { Chess, type Square } from "chess.js";

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

function isSavedMove(value: unknown): value is SavedMove {
  if (!value || typeof value !== "object") return false;
  const move = value as Partial<SavedMove>;
  return typeof move.san === "string"
    && (move.color === "w" || move.color === "b")
    && typeof move.from === "string"
    && /^[a-h][1-8]$/.test(move.from)
    && typeof move.to === "string"
    && /^[a-h][1-8]$/.test(move.to)
    && (move.promotion === undefined || typeof move.promotion === "string");
}

export function isOnlineGameRecord(value: unknown): value is OnlineGameRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OnlineGameRecord>;
  if (typeof record.id !== "string"
    || typeof record.playedAt !== "string"
    || typeof record.timeControl !== "string"
    || (record.whiteName !== undefined && typeof record.whiteName !== "string")
    || (record.blackName !== undefined && typeof record.blackName !== "string")
    || (record.color !== "w" && record.color !== "b")
    || (record.result !== "win" && record.result !== "loss" && record.result !== "draw")
    || typeof record.resultText !== "string"
    || typeof record.reason !== "string"
    || !Array.isArray(record.moves)
    || record.moves.length > 500) return false;

  try {
    const replay = new Chess();
    for (const move of record.moves) {
      if (!isSavedMove(move)) return false;
      const applied = replay.move({
        from: move.from as Square,
        to: move.to as Square,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
      if (applied.san !== move.san || applied.color !== move.color) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getOnlineGamePgn(game: OnlineGameRecord) {
  const replay = new Chess();
  game.moves.forEach((move) => {
    replay.move({ from: move.from as Square, to: move.to as Square, ...(move.promotion ? { promotion: move.promotion } : {}) });
  });
  const white = game.whiteName?.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 80) || "Weiß";
  const black = game.blackName?.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 80) || "Schwarz";
  const result = game.result === "draw"
    ? "1/2-1/2"
    : game.result === "win"
      ? game.color === "w" ? "1-0" : "0-1"
      : game.color === "w" ? "0-1" : "1-0";
  replay.header("White", white, "Black", black, "Result", result);
  return replay.pgn();
}

const STORAGE_KEY = "schach-plattform-online-history-v1";
export const ONLINE_HISTORY_OWNER_KEY = "chesscage-online-history-owner-v1";

export function readOnlineHistory(): OnlineGameRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(isOnlineGameRecord);
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
