import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";

const data = JSON.parse(await readFile(new URL("../lib/endgame-exercises.json", import.meta.url), "utf8"));
const expectedCategories = {
  pawn: { count: 125, theme: "pawnEndgame" },
  rook: { count: 125, theme: "rookEndgame" },
  minor: { count: 125, themes: ["bishopEndgame", "knightEndgame"] },
  queen: { count: 125, theme: "queenEndgame" },
};
const ids = new Set();

assert.equal(data.total, 500, "The endgame course should contain 500 exercises.");
assert.equal(data.license, "CC0-1.0", "The puzzle source should be recorded as CC0.");

for (const category of data.categories) {
  const expected = expectedCategories[category.id];
  assert.ok(expected, `Unexpected category: ${category.id}`);
  assert.equal(category.puzzles.length, expected.count, `Wrong exercise count in ${category.id}.`);

  for (const puzzle of category.puzzles) {
    assert.ok(!ids.has(puzzle.id), `Duplicate puzzle id: ${puzzle.id}`);
    ids.add(puzzle.id);
    assert.ok(puzzle.themes.includes("endgame"), `Exercise is not tagged as an endgame: ${puzzle.id}`);
    if (expected.theme) assert.ok(puzzle.themes.includes(expected.theme), `Wrong endgame theme: ${puzzle.id}`);
    else assert.ok(expected.themes.some((theme) => puzzle.themes.includes(theme)), `Wrong minor-piece endgame theme: ${puzzle.id}`);
    assert.ok(Number.isInteger(puzzle.rating) && puzzle.rating >= 600 && puzzle.rating <= 2400, `Invalid rating: ${puzzle.id}`);
    assert.ok(puzzle.moves.length > 0 && puzzle.moves.length % 2 === 1, `Solution must end on the learner's move: ${puzzle.id}`);

    const position = new Chess(puzzle.fen);
    const sideToMove = position.turn();
    const fenFields = puzzle.fen.split(" ");
    fenFields[1] = sideToMove === "w" ? "b" : "w";
    fenFields[3] = "-";
    assert.ok(!new Chess(fenFields.join(" ")).isCheck(), `The previous move left its own king in check: ${puzzle.id}`);

    for (const [index, uci] of puzzle.moves.entries()) {
      assert.equal(position.turn(), index % 2 === 0 ? sideToMove : sideToMove === "w" ? "b" : "w", `Wrong side to move: ${puzzle.id}`);
      const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      assert.ok(match, `Invalid UCI move: ${puzzle.id} ${uci}`);
      position.move({
        from: match[1],
        to: match[2],
        ...(match[3] ? { promotion: match[3] } : {}),
      });
    }
  }
}

assert.equal(ids.size, 500, "All 500 exercise IDs must be unique.");
console.log(`Validated ${ids.size} legal endgame exercise lines in four categories.`);
