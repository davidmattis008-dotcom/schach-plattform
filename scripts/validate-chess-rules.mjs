import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";

const lessons = JSON.parse(await readFile(new URL("../lib/chess-rules.json", import.meta.url), "utf8"));
const expectedIds = [
  "board-and-turns", "king", "queen", "rook", "bishop", "knight", "pawn", "check",
  "castling", "en-passant", "promotion", "checkmate", "stalemate", "draws", "over-the-board",
];
assert.deepEqual(lessons.map((lesson) => lesson.id), expectedIds, "The course should cover every planned chess rule topic.");

for (const lesson of lessons) {
  assert.ok(lesson.title && lesson.description && lesson.facts.length > 0, `Incomplete lesson: ${lesson.id}`);
  const game = new Chess(lesson.fen);
  assert.ok(game.moves().length > 0 || lesson.id === "stalemate", `Unexpected position without legal moves: ${lesson.id}`);
  if (lesson.focusSquare) {
    const focusedPiece = game.get(lesson.focusSquare);
    assert.ok(focusedPiece && focusedPiece.color === game.turn(), `Invalid focused piece in ${lesson.id}.`);
    assert.ok(game.moves({ square: lesson.focusSquare }).length > 0, `Focused piece has no legal moves in ${lesson.id}.`);
  }
  const playedMoves = [];
  for (const [index, demo] of lesson.demo.entries()) {
    const match = demo.move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    assert.ok(match && demo.explanation, `Invalid demonstration in ${lesson.id}, step ${index + 1}.`);
    playedMoves.push(game.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    }));
  }
  if (lesson.id === "pawn") assert.ok(playedMoves[2].captured, "The pawn lesson should demonstrate a diagonal capture.");
  if (lesson.id === "castling") {
    assert.ok(playedMoves[0].flags.includes("k"), "The castling lesson should demonstrate kingside castling.");
    assert.ok(playedMoves[1].flags.includes("q"), "The castling lesson should demonstrate queenside castling.");
  }
  if (lesson.id === "en-passant") assert.ok(playedMoves[0].flags.includes("e"), "The en-passant lesson should demonstrate an en-passant capture.");
  if (lesson.id === "promotion") assert.equal(playedMoves[0].promotion, "n", "The promotion lesson should demonstrate underpromotion.");
}

const checkLesson = lessons.find((lesson) => lesson.id === "check");
assert.ok(new Chess(checkLesson.fen).isCheck(), "The check lesson must start with the king in check.");
assert.equal(lessons.find((lesson) => lesson.id === "knight").focusSquare, "c1", "The knight lesson should highlight its piece and legal moves.");
assert.equal(lessons.find((lesson) => lesson.id === "bishop").focusSquare, "c1", "The bishop lesson should highlight its piece and legal moves.");

const mateLesson = lessons.find((lesson) => lesson.id === "checkmate");
const matePosition = new Chess(mateLesson.fen);
for (const demo of mateLesson.demo) {
  const match = demo.move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  matePosition.move({ from: match[1], to: match[2], ...(match[3] ? { promotion: match[3] } : {}) });
}
assert.ok(matePosition.isCheckmate(), "The mate lesson should demonstrate checkmate.");

const stalemateLesson = lessons.find((lesson) => lesson.id === "stalemate");
assert.ok(new Chess(stalemateLesson.fen).isStalemate(), "The stalemate lesson should demonstrate stalemate.");

const drawLesson = lessons.find((lesson) => lesson.id === "draws");
const repetitionPosition = new Chess(drawLesson.fen);
for (const demo of drawLesson.demo) {
  const match = demo.move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  repetitionPosition.move({ from: match[1], to: match[2], ...(match[3] ? { promotion: match[3] } : {}) });
}
assert.ok(repetitionPosition.isThreefoldRepetition(), "The repetition lesson should reach a threefold repetition.");

console.log(`Validated ${lessons.length} chess-rule lessons and all demonstration moves.`);
