import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";

const puzzles = JSON.parse(await readFile(new URL("../lib/tactics-data.json", import.meta.url), "utf8"));
const ratingConfig = JSON.parse(await readFile(new URL("../lib/tactics-rating-config.json", import.meta.url), "utf8"));
const ids = new Set();
const positions = new Set();
const playerColors = new Set();

assert.equal(puzzles.length, 10000, "The tactics library should contain 10,000 puzzles.");
const ratings = puzzles.map((puzzle) => puzzle.rating);
assert.equal(Math.min(...ratings), 0, "The internal puzzle rating should start at 0.");
assert.equal(Math.max(...ratings), 3000, "The internal puzzle rating should reach 3,000.");
assert.equal(ratingConfig.ratingMin, 0, "The internal rating scale should start at 0.");
assert.equal(ratingConfig.ratingMax, 3000, "The internal rating scale should reach 3,000.");
assert.equal(ratingConfig.ratingScaleVersion, 2, "The tactics rating scale version should be recorded.");
assert.equal(ratingConfig.legacyRatingMin, 400, "The legacy user rating should start at 400 Elo.");
assert.equal(ratingConfig.legacyRatingMax, 2400, "The legacy user rating should end at 2,400 Elo.");
assert.equal(ratingConfig.license, "CC0-1.0", "The puzzle source should be recorded as CC0.");
assert.ok(Math.min(...ratings) <= 900, "Include beginner-friendly tasks.");
assert.ok(Math.max(...ratings) >= 2900, "Include advanced tasks.");
assert.ok(Math.max(...ratings) - Math.min(...ratings) >= 2900, "Cover the full internal rating range.");
assert.ok(puzzles.some((puzzle) => puzzle.moves.length >= 5), "Include multi-move combinations.");

for (const puzzle of puzzles) {
  assert.ok(!ids.has(puzzle.id), `Duplicate puzzle id: ${puzzle.id}`);
  assert.match(puzzle.id, /^tactics-(?:\d{2,4}|extra-\d{5})$/, `Puzzle id should not expose a source identifier: ${puzzle.id}`);
  ids.add(puzzle.id);
  const positionKey = `${puzzle.fen}:${puzzle.setupMove ?? ""}:${puzzle.moves.join(" ")}`;
  assert.ok(!positions.has(positionKey), `Duplicate puzzle position and solution: ${puzzle.id}`);
  positions.add(positionKey);
  assert.ok(Number.isInteger(puzzle.rating) && puzzle.rating >= 0 && puzzle.rating <= 3000, `Invalid rating: ${puzzle.id}`);
  assert.ok(Number.isInteger(puzzle.sourceRating) && puzzle.sourceRating >= 400 && puzzle.sourceRating <= 3000, `Invalid source rating: ${puzzle.id}`);
  assert.equal(
    puzzle.rating,
    Math.round(((puzzle.sourceRating - ratingConfig.sourceRatingMin)
      / (ratingConfig.sourceRatingMax - ratingConfig.sourceRatingMin)) * 3000),
    `Rating scale mismatch: ${puzzle.id}`,
  );
  assert.ok(!("sourceGame" in puzzle), `Puzzle data should not expose source game IDs: ${puzzle.id}`);
  assert.ok(puzzle.moves.length > 0 && puzzle.moves.length % 2 === 1, `Puzzle should end on the player's move: ${puzzle.id}`);

  const position = new Chess(puzzle.fen);
  const fenFields = puzzle.fen.split(" ");
  fenFields[1] = position.turn() === "w" ? "b" : "w";
  fenFields[3] = "-";
  assert.ok(!new Chess(fenFields.join(" ")).isCheck(), `The side that just moved left its king in check: ${puzzle.id}`);
  if (puzzle.setupMove) {
    const match = puzzle.setupMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    assert.ok(match, `Invalid setup move: ${puzzle.id} ${puzzle.setupMove}`);
    assert.ok(!match[3] || match[3] === "q", `Underpromotion is not supported: ${puzzle.id} ${puzzle.setupMove}`);
    position.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
  }
  const playerColor = position.turn();
  playerColors.add(playerColor);
  for (const [index, uci] of puzzle.moves.entries()) {
    assert.equal(position.turn(), index % 2 === 0 ? playerColor : playerColor === "w" ? "b" : "w", `Wrong side to move: ${puzzle.id}`);
    const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    assert.ok(match, `Invalid UCI move: ${puzzle.id} ${uci}`);
    assert.ok(!match[3] || match[3] === "q", `Underpromotion is not supported: ${puzzle.id} ${uci}`);
    position.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
  }

  if (puzzle.themes.includes("mateIn1")) {
    const mate = new Chess(puzzle.fen);
    if (puzzle.setupMove) {
      const setup = puzzle.setupMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
      mate.move({
        from: setup[1],
        to: setup[2],
        ...(setup[3] ? { promotion: setup[3] } : {}),
      });
    }
    const match = puzzle.moves[0].match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    mate.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
    assert.ok(mate.isCheckmate(), `Mate-in-one solution does not checkmate: ${puzzle.id}`);
  }
}

assert.deepEqual([...playerColors].sort(), ["b", "w"], "Include tasks for both colors.");

console.log(`Validated ${puzzles.length} legal puzzle positions and solution lines.`);
