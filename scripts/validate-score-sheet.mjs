import assert from "node:assert/strict";
import { Chess } from "chess.js";
import {
  normalizeScoreSheetToken,
  parseScoreSheetText,
  reviewScoreSheet,
} from "../lib/chess/score-sheet-review.ts";

const line = (page, row, texts) => ({
  id: `${page}-${row}`,
  page,
  row,
  cropUrl: "",
  hypotheses: texts.map((text) => ({ text })),
});

const normal = reviewScoreSheet([
  line(1, 1, ["1. e4 e5", "1. e4 e5", "1. e4 e5"]),
  line(1, 2, ["2. Nf3 Nc6", "2. Nf3 Nc6", "2. Nf3 Nc6"]),
]);
assert.equal(normal.issue, null, "Normal notation should validate.");
assert.equal(normal.moves.length, 4);
assert.ok(normal.moves.every((move) => move.confidence === 1));
assert.match(normal.pgn, /1\. e4 \{\[CageAI OCR confidence: 1\.00\]\} e5/);
assert.match(normal.pgn, /CageAI OCR confidence: 1\.00/, "PGN should preserve per-move confidence.");
const roundTrip = new Chess();
roundTrip.loadPgn(normal.pgn);
assert.deepEqual(roundTrip.history(), ["e4", "e5", "Nf3", "Nc6"]);

const singleProposal = reviewScoreSheet([line(1, 1, ["1. e4 e5"])]);
assert.equal(singleProposal.issue?.kind, "low-confidence", "One OCR proposal must never count as complete agreement.");
assert.equal(singleProposal.issue?.ply, 0);
assert.equal(singleProposal.issue?.confidence, 0);
assert.equal(singleProposal.moves.length, 0, "A move based on one proposal requires manual confirmation.");

assert.equal(normalizeScoreSheetToken("Sf3"), "Nf3", "German notation should be normalized.");
assert.deepEqual(parseScoreSheetText("17... Sxe5+", 0), [{ ply: 32, san: "Nxe5" }]);

const ambiguous = reviewScoreSheet([
  line(1, 1, ["1. e4 e5 2. Nf3", "1. e4 e5 2. Bc4", "1. e4 e5 2. Nf3"]),
]);
assert.equal(ambiguous.issue?.ply, 2);
assert.equal(ambiguous.issue?.kind, "ambiguous");
assert.deepEqual(ambiguous.issue?.candidates, ["Nf3", "Bc4"]);
assert.equal(ambiguous.moves.length, 2, "Ambiguous moves must stop later validation.");

const unclear = reviewScoreSheet([line(1, 1, ["unleserlich", "", "—"])]);
assert.equal(unclear.issue?.kind, "unreadable");
assert.equal(unclear.moves.length, 0);

const illegal = reviewScoreSheet([line(1, 1, ["1. Bf5", "1. Bf5", "1. Bf5"])]);
assert.equal(illegal.issue?.kind, "illegal");
assert.equal(illegal.moves.length, 0, "Illegal moves must not be accepted.");

const missing = [line(1, 1, ["1. e4 2. Nf3", "1. e4 2. Nf3", "1. e4 2. Nf3"])];
const missingResult = reviewScoreSheet(missing, {});
assert.equal(missingResult.issue?.ply, 1);
assert.equal(missingResult.issue?.kind, "missing");
const correctedMissing = reviewScoreSheet(missing, { 1: "e5" });
assert.equal(correctedMissing.issue, null);
assert.equal(correctedMissing.moves[1].san, "e5");
assert.equal(correctedMissing.moves[1].corrected, true);
assert.equal(correctedMissing.moves[2].san, "Nf3");

const correctionLines = [line(1, 1, [
  "1. e4 d5 2. exd5 Qxd5",
  "1. e4 d5 2. exd5 Qxd5",
  "1. e4 d5 2. exd5 Qxd5",
])];
const correctionResult = reviewScoreSheet(correctionLines, { 0: "d4" });
assert.equal(correctionResult.moves[0].san, "d4");
assert.equal(correctionResult.issue?.ply, 2);
assert.equal(correctionResult.issue?.kind, "illegal", "Changing an earlier move must revalidate all following moves.");

const multipage = reviewScoreSheet([
  line(1, 1, ["1. d4 d5", "1. d4 d5", "1. d4 d5"]),
  line(2, 1, ["2. c4 e6", "2. c4 e6", "2. c4 e6"]),
]);
assert.equal(multipage.issue, null);
assert.equal(multipage.moves.length, 4);
assert.equal(multipage.moves[2].page, 2);

const conflictingInterpretations = reviewScoreSheet([
  line(1, 1, ["1. e4 e5", "1. d4 d5", "1. e4 e5"]),
]);
assert.equal(conflictingInterpretations.issue?.ply, 0);
assert.equal(conflictingInterpretations.issue?.kind, "ambiguous");
assert.equal(conflictingInterpretations.moves.length, 0);

console.log("Validated score-sheet parsing, legal replay, confidence gating, corrections, missing moves, ambiguity, and pages.");
