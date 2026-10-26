import { Chess, type Square } from "chess.js";
import type {
  ScoreSheetIssue,
  ScoreSheetLine,
  ScoreSheetMove,
  ScoreSheetReview,
} from "./score-sheet-types";

type ParsedToken = { ply: number; san: string };
type PlyCandidates = {
  candidates: string[];
  page: number;
  row: number;
};

const MOVE_NUMBER = /^(\d+)\.(\.\.\.)?(.*)$/;
const UCI_MOVE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;
const GERMAN_PIECES: Record<string, string> = {
  D: "Q",
  T: "R",
  L: "B",
  S: "N",
  K: "K",
};

export function normalizeScoreSheetToken(raw: string): string | null {
  let token = raw.trim()
    .replace(/[!?+#]+$/g, "")
    .replace(/[.,;:]+$/g, "")
    .replace(/^0-0-0$/i, "O-O-O")
    .replace(/^0-0$/i, "O-O");
  if (!token || /^\d+(?:\.\.\.)?$/.test(token) || /^\d{1,2}:\d{2}$/.test(token)) return null;
  token = token.replace(/^[KDTLS](?=[a-h1-8x=])/, (piece) => GERMAN_PIECES[piece] ?? piece);
  if (!/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h][1-8][a-h][1-8][qrbn]?)$/i.test(token)) {
    return null;
  }
  return token;
}

export function parseScoreSheetText(text: string, fallbackPly: number): ParsedToken[] {
  const parsed: ParsedToken[] = [];
  let nextPly = fallbackPly;
  const tokens = text.replace(/[()[\]{}]/g, " ").split(/\s+/).filter(Boolean);

  for (const raw of tokens) {
    let token = raw;
    const number = token.match(MOVE_NUMBER);
    if (number) {
      const moveNumber = Number(number[1]);
      if (!Number.isSafeInteger(moveNumber) || moveNumber < 1 || moveNumber > 10_000) continue;
      nextPly = (moveNumber - 1) * 2 + (number[2] ? 1 : 0);
      token = number[3];
      if (!token) continue;
    } else if (/^\d+\.(?:\.\.)?$/.test(token)) {
      const moveNumber = Number(token.match(/^\d+/)?.[0]);
      nextPly = (moveNumber - 1) * 2 + (token.endsWith("...") ? 1 : 0);
      continue;
    }

    const san = normalizeScoreSheetToken(token);
    if (!san) continue;
    parsed.push({ ply: nextPly, san });
    nextPly += 1;
  }
  return parsed;
}

function applySan(position: Chess, san: string) {
  const uci = san.match(UCI_MOVE);
  if (uci) {
    return position.move({
      from: uci[1].toLowerCase() as Square,
      to: uci[2].toLowerCase() as Square,
      ...(uci[3] ? { promotion: uci[3].toLowerCase() as "q" | "r" | "b" | "n" } : {}),
    });
  }
  return position.move(san, { strict: false });
}

function collectPlyCandidates(lines: readonly ScoreSheetLine[]) {
  const result = new Map<number, PlyCandidates>();
  let fallbackPly = 0;

  for (const line of lines) {
    const parsedVariants = line.hypotheses.map((hypothesis) => parseScoreSheetText(hypothesis.text, fallbackPly));
    const lineMaxPly = Math.max(-1, ...parsedVariants.flatMap((tokens) => tokens.map((token) => token.ply)));
    if (lineMaxPly < fallbackPly) {
      result.set(fallbackPly, { candidates: [], page: line.page, row: line.row });
      fallbackPly += 1;
      continue;
    }
    for (const tokens of parsedVariants) {
      for (const token of tokens) {
        const item = result.get(token.ply) ?? { candidates: [], page: line.page, row: line.row };
        item.candidates.push(token.san);
        result.set(token.ply, item);
      }
    }
    if (lineMaxPly >= fallbackPly) fallbackPly = lineMaxPly + 1;
  }
  return result;
}

export function reviewScoreSheet(
  lines: readonly ScoreSheetLine[],
  corrections: Readonly<Record<number, string>> = {},
  confidenceThreshold = 0.75,
): ScoreSheetReview {
  const grouped = collectPlyCandidates(lines);
  const expectedPlies = [...grouped.keys()].sort((a, b) => a - b);
  const lastPly = expectedPlies.at(-1) ?? -1;
  const game = new Chess();
  const moves: ScoreSheetMove[] = [];

  for (let ply = 0; ply <= lastPly; ply += 1) {
    const source = grouped.get(ply);
    const page = source?.page ?? lines.at(-1)?.page ?? 1;
    const row = source?.row ?? lines.at(-1)?.row ?? 1;
    const correction = corrections[ply];

    if (correction) {
      try {
        const move = applySan(game, correction.trim());
        game.setComment("[CageAI OCR confidence: 1.00; manually corrected]");
        moves.push({ ply, san: move.san, confidence: 1, corrected: true, page, row });
        continue;
      } catch {
        return {
          moves,
          pgn: game.pgn(),
          issue: {
            ply,
            page,
            row,
            kind: "illegal",
            candidates: [correction],
            confidence: 0,
          },
        };
      }
    }

    if (!source) {
      return {
        moves,
        pgn: game.pgn(),
        issue: {
          ply,
          page,
          row,
          kind: "missing",
          candidates: [],
          confidence: 0,
        },
      };
    }

    const legalCandidates = new Map<string, number>();
    for (const candidate of source.candidates) {
      try {
        const probe = new Chess(game.fen());
        const move = applySan(probe, candidate);
        legalCandidates.set(move.san, (legalCandidates.get(move.san) ?? 0) + 1);
      } catch {
        // Illegal OCR hypotheses remain unresolved; they are never repaired or guessed.
      }
    }

    const ranked = [...legalCandidates.entries()].sort((a, b) => b[1] - a[1]);
    const best = ranked[0];
    const confidence = source.candidates.length > 1 && best
      ? best[1] / source.candidates.length
      : 0;
    if (ranked.length !== 1 || !best || confidence < confidenceThreshold) {
      const kind = ranked.length > 1
        ? "ambiguous"
        : source.candidates.length === 0
          ? "unreadable"
          : legalCandidates.size === 0
            ? "illegal"
            : source.candidates.length < 2
              ? "low-confidence"
              : "ambiguous";
      return {
        moves,
        pgn: game.pgn(),
        issue: {
          ply,
          page,
          row,
          kind,
          candidates: ranked.length > 1
            ? ranked.map(([san]) => san)
            : [...new Set(source.candidates)],
          confidence,
        },
      };
    }

    const played = applySan(game, best[0]);
    game.setComment(`[CageAI OCR confidence: ${confidence.toFixed(2)}]`);
    moves.push({ ply, san: played.san, confidence, corrected: false, page, row });
  }

  return { moves, issue: null, pgn: game.pgn() };
}

export function formatMoveLabel(ply: number): string {
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? "." : "..."}`;
}

export function getScoreSheetIssueMessage(issue: ScoreSheetIssue): string {
  const move = formatMoveLabel(issue.ply);
  if (issue.kind === "missing") return `Zug ${move} fehlt. Bitte ergänze ihn, bevor Folgezüge validiert werden.`;
  if (issue.kind === "illegal") return `Zug ${move} ist in der aktuellen Stellung nicht legal. Bitte prüfe die Notation.`;
  if (issue.kind === "low-confidence") return `Für Zug ${move} liegt nur ein OCR-Vorschlag vor. Bitte prüfe den Ausschnitt und bestätige oder korrigiere den Zug.`;
  if (issue.kind === "ambiguous") return `Bei Zug ${move} gibt es mehrere plausible Lesarten. Bitte wähle oder korrigiere den Zug.`;
  return `Zug ${move} konnte nicht sicher erkannt werden. Bitte gib ihn manuell ein.`;
}
