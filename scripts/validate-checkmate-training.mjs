import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";

const lessons = JSON.parse(await readFile(new URL("../lib/checkmate-training.json", import.meta.url), "utf8"));
const expectedIds = [
  "fools-mate", "scholars-mate", "back-rank", "smothered-mate", "arabian-mate", "dovetail-mate", "rook-corner-mate",
  "queen-and-king", "rook-and-king", "two-rooks", "two-bishops", "bishop-knight", "bishop-limit", "knight-limit", "two-knights",
];
assert.deepEqual(lessons.map((lesson) => lesson.id), expectedIds, "The course should cover every standard forced mate against a bare king and important material limits.");
const ids = new Set();
let totalPlies = 0;

const scholarsMate = lessons.find((lesson) => lesson.id === "scholars-mate");
assert.equal(scholarsMate.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Scholar's Mate must start from the normal initial position.");
assert.equal(scholarsMate.solution, "e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7", "Scholar's Mate should show the complete opening sequence.");

for (const lesson of lessons) {
  assert.ok(!ids.has(lesson.id), `Duplicate lesson id: ${lesson.id}`);
  ids.add(lesson.id);
  assert.ok(lesson.title && lesson.shortTitle && lesson.material && lesson.principle && lesson.plan, `Incomplete lesson: ${lesson.id}`);
  assert.ok(lesson.quiz.question && lesson.quiz.answers.length >= 2 && lesson.quiz.answers[lesson.quiz.correctAnswer], `Incomplete understanding test: ${lesson.id}`);
  const game = new Chess(lesson.fen);
  assert.ok(game.moves().length > 0, `No legal moves in ${lesson.id}`);

  if (!lesson.forceable) {
    assert.equal(lesson.solution, "", `A non-forced mate lesson must not claim a forced solution: ${lesson.id}`);
    if (lesson.id === "bishop-limit" || lesson.id === "knight-limit") {
      assert.ok(game.isInsufficientMaterial(), `${lesson.id} should be recognized as insufficient material.`);
    }
    if (lesson.id === "two-knights") {
      assert.ok(!game.isInsufficientMaterial(), "Two knights can produce a mate position, even though they cannot force it.");
    }
    continue;
  }

  const moves = lesson.solution.trim().split(/\s+/);
  assert.ok(moves.length >= 1, `A complete solution line is required: ${lesson.id}`);
  totalPlies += moves.length;
  for (const [index, uci] of moves.entries()) {
    const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    assert.ok(match, `Invalid UCI move ${uci} in ${lesson.id}`);
    game.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
    assert.ok(!game.isGameOver() || (index === moves.length - 1 && game.isCheckmate()), `The line ends before checkmate in ${lesson.id}, ply ${index + 1}.`);
  }
  assert.ok(game.isCheckmate(), `The solution does not end in checkmate: ${lesson.id}`);
  if (lesson.id === "scholars-mate") {
    assert.deepEqual(game.history(), ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"], "Scholar's Mate should show the expected opening moves.");
  }
}

assert.ok(lessons.find((lesson) => lesson.id === "bishop-knight").solution.trim().split(/\s+/).length >= 50, "The bishop-and-knight demonstration should show the complete long mating method.");
console.log(`Validated ${lessons.length} mate lessons; ${totalPlies} legal solution half-moves reach checkmate, including the full bishop-and-knight method.`);
