import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  analyzePlayedMoves,
  classifyMoveLoss,
  formatEngineScore,
  parseStockfishBestMove,
  parseStockfishInfoLine,
  scoreToWhiteCentipawns,
  uciLineToSan,
} from "../lib/chess/stockfish-analysis.ts";

const parsed = parseStockfishInfoLine("info depth 14 multipv 2 score cp -37 nodes 1000 pv e7e5 g1f3");
assert.deepEqual(parsed, {
  depth: 14,
  multipv: 2,
  score: { type: "cp", value: -37 },
  pv: ["e7e5", "g1f3"],
});
assert.equal(parseStockfishInfoLine("info depth 10 score mate 3 pv e2e4")?.score.type, "mate");
assert.equal(parseStockfishInfoLine("info string ready"), null);
assert.equal(parseStockfishBestMove("bestmove e2e4 ponder e7e5"), "e2e4");
assert.equal(parseStockfishBestMove("bestmove 0000"), "0000");
assert.equal(parseStockfishBestMove("bestmove (none)"), "(none)");
assert.equal(scoreToWhiteCentipawns({ type: "cp", value: 125 }, "b"), -125);
assert.equal(scoreToWhiteCentipawns({ type: "mate", value: 3 }, "b"), -99_997);
assert.equal(scoreToWhiteCentipawns({ type: "mate", value: 0 }, "w"), -100_000);
assert.equal(formatEngineScore({ type: "mate", value: -4 }, "w"), "Matt in 4 für Schwarz");
assert.equal(classifyMoveLoss(49), "good");
assert.equal(classifyMoveLoss(50), "inaccuracy");
assert.equal(classifyMoveLoss(100), "mistake");
assert.equal(classifyMoveLoss(200), "blunder");
assert.deepEqual(uciLineToSan(new Chess().fen(), ["e2e4", "e7e5", "g1f3"]), ["e4", "e5", "Nf3"]);

const game = new Chess();
const moves = ["e4", "e5"];
const positions = [game.fen()];
for (const san of moves) {
  game.move(san);
  positions.push(game.fen());
}
const positionAnalyses = [
  { lines: [{ depth: 10, multipv: 1, score: { type: "cp", value: 100 }, pv: ["e2e4"] }], bestMove: "e2e4" },
  { lines: [{ depth: 10, multipv: 1, score: { type: "cp", value: -100 }, pv: ["g8f6"] }], bestMove: "g8f6" },
  { lines: [{ depth: 10, multipv: 1, score: { type: "cp", value: 200 }, pv: ["g1f3"] }], bestMove: "g1f3" },
];
const moveAnalysis = analyzePlayedMoves(moves, positions, positionAnalyses);
assert.equal(moveAnalysis.length, 2);
assert.equal(moveAnalysis[0].color, "w");
assert.equal(moveAnalysis[0].bestMove, "e4");
assert.equal(moveAnalysis[0].quality, "good");
assert.equal(moveAnalysis[1].color, "b");
assert.equal(moveAnalysis[1].quality, "mistake");
assert.throws(() => analyzePlayedMoves(moves, positions.slice(1), positionAnalyses), /passen nicht zusammen/);

console.log("Validated Stockfish UCI parsing, score perspective, variations, and move-quality classification.");
