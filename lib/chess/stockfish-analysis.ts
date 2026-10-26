import { Chess, type Square } from "chess.js";

export type EngineScore = {
  type: "cp" | "mate";
  value: number;
};

export type EngineLine = {
  depth: number;
  multipv: number;
  score: EngineScore;
  pv: string[];
};

export type PositionAnalysis = {
  lines: EngineLine[];
  bestMove: string;
};

export type MoveQuality = "good" | "inaccuracy" | "mistake" | "blunder";

export type AnalyzedMove = {
  ply: number;
  color: "w" | "b";
  san: string;
  bestMove: string;
  variation: string[];
  evaluationBefore: EngineScore;
  evaluationAfter: EngineScore;
  depthBefore: number;
  depthAfter: number;
  centipawnLoss: number;
  quality: MoveQuality;
};

const MATE_SCORE = 100_000;

export function parseStockfishInfoLine(line: string): EngineLine | null {
  if (!line.startsWith("info ")) return null;

  const depth = Number(line.match(/\bdepth (\d+)/)?.[1]);
  const multipv = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? "1");
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!Number.isInteger(depth) || depth < 1 || !Number.isInteger(multipv) || multipv < 1 || !scoreMatch) {
    return null;
  }

  const pv = line.match(/\bpv (.+)$/)?.[1]?.trim().split(/\s+/) ?? [];
  return {
    depth,
    multipv,
    score: { type: scoreMatch[1] as EngineScore["type"], value: Number(scoreMatch[2]) },
    pv,
  };
}

export function parseStockfishBestMove(line: string): string | null {
  const match = line.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?|0000|none|\(none\))(?:\s|$)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function scoreToWhiteCentipawns(score: EngineScore, sideToMove: "w" | "b") {
  const sideToMoveScore = score.type === "cp"
    ? score.value
    : score.value === 0
      ? -MATE_SCORE
      : Math.sign(score.value) * (MATE_SCORE - Math.abs(score.value));
  return sideToMove === "w" ? sideToMoveScore : -sideToMoveScore;
}

export function formatEngineScore(score: EngineScore, sideToMove: "w" | "b") {
  if (score.type === "mate") {
    const whiteScore = scoreToWhiteCentipawns(score, sideToMove);
    const side = whiteScore > 0 ? "Weiß" : "Schwarz";
    return `Matt in ${Math.abs(score.value)} für ${side}`;
  }
  const whiteScore = scoreToWhiteCentipawns(score, sideToMove) / 100;
  return `${whiteScore > 0 ? "+" : ""}${whiteScore.toFixed(2)}`;
}

export function classifyMoveLoss(centipawnLoss: number): MoveQuality {
  if (centipawnLoss < 50) return "good";
  if (centipawnLoss < 100) return "inaccuracy";
  if (centipawnLoss < 200) return "mistake";
  return "blunder";
}

export function uciLineToSan(fen: string, uciMoves: string[]) {
  const position = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uciMove of uciMoves) {
    const match = uciMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (!match) break;
    try {
      const move = position.move({
        from: match[1] as Square,
        to: match[2] as Square,
        ...(match[3] ? { promotion: match[3].toLowerCase() } : {}),
      });
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}

export function analyzePlayedMoves(
  moves: string[],
  positions: string[],
  positionAnalyses: PositionAnalysis[],
): AnalyzedMove[] {
  if (positions.length !== moves.length + 1 || positionAnalyses.length !== positions.length) {
    throw new Error("Die Zugfolge und Stellungen passen nicht zusammen.");
  }

  return moves.map((san, index) => {
    const before = positionAnalyses[index].lines.find((line) => line.multipv === 1);
    const after = positionAnalyses[index + 1].lines.find((line) => line.multipv === 1);
    if (!before || !after) throw new Error(`Stockfish-Bewertung für Zug ${index + 1} fehlt.`);

    const positionBefore = new Chess(positions[index]);
    const mover = positionBefore.turn();
    const moverSign = mover === "w" ? 1 : -1;
    const beforeScore = scoreToWhiteCentipawns(before.score, mover) * moverSign;
    const afterSideToMove = new Chess(positions[index + 1]).turn();
    const afterScore = scoreToWhiteCentipawns(after.score, afterSideToMove) * moverSign;
    const centipawnLoss = Math.max(0, Math.round(beforeScore - afterScore));
    const bestMove = uciLineToSan(positions[index], before.pv.slice(0, 1))[0] ?? "";

    return {
      ply: index + 1,
      color: mover,
      san,
      bestMove,
      variation: uciLineToSan(positions[index], before.pv),
      evaluationBefore: before.score,
      evaluationAfter: after.score,
      depthBefore: before.depth,
      depthAfter: after.depth,
      centipawnLoss,
      quality: classifyMoveLoss(centipawnLoss),
    };
  });
}
