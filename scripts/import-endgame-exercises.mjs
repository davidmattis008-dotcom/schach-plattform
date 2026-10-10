import assert from "node:assert/strict";
import fs from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createZstdDecompress } from "node:zlib";
import { Chess } from "chess.js";

const categories = [
  {
    id: "pawn",
    label: "Bauernendspiele",
    description: "Königsaktivität, Opposition und Freibauern",
    themes: ["pawnEndgame"],
    quota: 125,
  },
  {
    id: "rook",
    label: "Turmendspiele",
    description: "Aktive Türme, Freibauern und Verteidigung",
    themes: ["rookEndgame"],
    quota: 125,
  },
  {
    id: "minor",
    label: "Läufer- und Springerendspiele",
    description: "Figurenaktivität, Bauernschwächen und Umwandlung",
    themes: ["bishopEndgame", "knightEndgame"],
    quota: 125,
  },
  {
    id: "queen",
    label: "Damenendspiele",
    description: "Königssicherheit, Dauerschach und Freibauern",
    themes: ["queenEndgame"],
    quota: 125,
  },
];
const skippableMarkers = Array.from({ length: 16 }, (_, index) => Buffer.from([0x50 + index, 0x2a, 0x4d, 0x18]));

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key.startsWith("--")) result[key.slice(2)] = argv[++index];
  }
  return result;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function validateAndNormalize(fen, uciMoves) {
  const position = new Chess(fen);
  const [firstMove, ...solution] = uciMoves;
  const playUci = (uci) => {
    const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) throw new Error("Invalid UCI move");
    position.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
  };

  playUci(firstMove);
  const puzzleFen = position.fen();
  if (solution.length < 1 || solution.length > 29 || solution.length % 2 !== 1) throw new Error("Invalid solution length");
  for (const move of solution) {
    if (move.length === 5 && move[4] !== "q") throw new Error("Unsupported underpromotion");
    playUci(move);
  }
  assert.ok(solution.length > 0);
  return { fen: puzzleFen, moves: solution };
}

function reservoirAdd(items, entry, seenCount, quota, random) {
  const seen = seenCount + 1;
  if (items.length < quota) items.push(entry);
  else {
    const index = Math.floor(random() * seen);
    if (index < quota) items[index] = entry;
  }
  return seen;
}

function stripSkippableFrames() {
  let pending = Buffer.alloc(0);
  function findMarker(buffer, start) {
    let first = -1;
    for (const marker of skippableMarkers) {
      const index = buffer.indexOf(marker, start);
      if (index !== -1 && (first === -1 || index < first)) first = index;
    }
    return first;
  }

  return new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let cursor = 0;
      while (true) {
        const marker = findMarker(buffer, cursor);
        if (marker === -1) break;
        if (buffer.length < marker + 16) {
          this.push(buffer.subarray(cursor, marker));
          pending = buffer.subarray(marker);
          callback();
          return;
        }
        const magic = buffer.readUInt32LE(marker);
        const payloadLength = buffer.readUInt32LE(marker + 4);
        if (payloadLength !== 4 || buffer.readUInt32LE(marker + 12) !== 0xfd2fb528) {
          this.push(buffer.subarray(cursor, marker + 1));
          cursor = marker + 1;
          continue;
        }
        if (magic < 0x184d2a50 || magic > 0x184d2a5f) {
          this.push(buffer.subarray(cursor, marker + 1));
          cursor = marker + 1;
          continue;
        }
        this.push(buffer.subarray(cursor, marker));
        cursor = marker + 12;
      }
      const safeEnd = Math.max(cursor, buffer.length - 15);
      this.push(buffer.subarray(cursor, safeEnd));
      pending = buffer.subarray(safeEnd);
      callback();
    },
    flush(callback) {
      while (pending.length === 12) {
        const magic = pending.readUInt32LE(0);
        const payloadLength = pending.readUInt32LE(4);
        if (magic < 0x184d2a50 || magic > 0x184d2a5f || payloadLength !== 4) break;
        pending = pending.subarray(12);
      }
      this.push(pending);
      callback();
    },
  });
}

async function* readLines(stream) {
  let remainder = "";
  for await (const chunk of stream) {
    remainder += chunk.toString("utf8");
    let newline;
    while ((newline = remainder.indexOf("\n")) !== -1) {
      yield remainder.slice(0, newline).replace(/\r$/, "");
      remainder = remainder.slice(newline + 1);
    }
  }
  if (remainder) yield remainder.replace(/\r$/, "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;
  const output = args.output ?? "lib/endgame-exercises.json";
  const seed = Number.parseInt(args.seed ?? "20261010", 10);
  if (!input) throw new Error("Usage: node scripts/import-endgame-exercises.mjs --input <lichess-puzzle.csv.zst> [--output <file>] [--seed <number>]");
  if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");

  const inputStream = fs.createReadStream(input);
  let decompression;
  let decodedStream = inputStream;
  if (input.toLowerCase().endsWith(".zst")) {
    decodedStream = createZstdDecompress();
    decompression = pipeline(inputStream, stripSkippableFrames(), decodedStream);
    decompression.catch(() => {});
  }
  const lines = readLines(decodedStream);
  const random = createRandom(seed);
  const sampled = new Map(categories.map((category) => [category.id, []]));
  const seen = new Map(categories.map((category) => [category.id, 0]));
  const sampleQuotas = new Map(categories.map((category) => [category.id, category.quota * 8]));
  let headerSeen = false;
  let processed = 0;
  let rejected = 0;

  for await (const line of lines) {
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    processed++;
    const columns = line.split(",");
    if (columns.length < 8) continue;
    const [id, fen, movesText, ratingText, , popularityText, , themesText] = columns;
    const rating = Number.parseInt(ratingText, 10);
    const popularity = Number.parseInt(popularityText, 10);
    const themes = themesText.split(" ");
    if (!id || !fen || !movesText || !Number.isInteger(rating) || rating < 600 || rating > 2400 || popularity < 10 || !themes.includes("endgame") || themes.includes("mateIn1")) continue;

    const category = categories.find((candidate) => candidate.themes.some((theme) => themes.includes(theme)));
    if (!category) continue;
    const uciMoves = movesText.split(" ");
    const solution = uciMoves.slice(1);
    if (solution.length < 1 || solution.length > 29 || solution.length % 2 !== 1
      || uciMoves.some((move) => !/^([a-h][1-8])([a-h][1-8])([qrbn])?$/.test(move))
      || solution.some((move) => move.length === 5 && move[4] !== "q")) continue;
    const entry = { id, fen, uciMoves, rating, themes };
    seen.set(category.id, reservoirAdd(
      sampled.get(category.id),
      entry,
      seen.get(category.id),
      sampleQuotas.get(category.id),
      random,
    ));

    if (processed % 500000 === 0) console.error(`Read ${processed.toLocaleString()} puzzle rows.`);
  }
  if (decompression) await decompression;

  const validExercises = new Map();
  for (const category of categories) {
    const valid = [];
    for (const candidate of sampled.get(category.id)) {
      try {
        const normalized = validateAndNormalize(candidate.fen, candidate.uciMoves);
        valid.push({
          id: candidate.id,
          fen: normalized.fen,
          moves: normalized.moves,
          rating: candidate.rating,
          themes: candidate.themes,
        });
      } catch {
        rejected++;
      }
    }
    validExercises.set(category.id, valid.sort((left, right) => left.rating - right.rating).slice(0, category.quota));
  }

  const shortages = categories.filter((category) => validExercises.get(category.id).length !== category.quota);
  if (shortages.length) {
    throw new Error(`Not enough valid puzzles to reach 500. Short categories: ${shortages.map((category) => `${category.label} (${validExercises.get(category.id).length}/${category.quota}; sampled ${sampled.get(category.id).length})`).join(", ")}`);
  }

  const result = {
    source: "https://database.lichess.org/#puzzles",
    license: "CC0-1.0",
    attribution: "Puzzle positions and solution lines from the Lichess open puzzle database, released under CC0.",
    generatedAt: new Date().toISOString(),
    seed,
    total: categories.reduce((total, category) => total + category.quota, 0),
    categories: categories.map((category) => ({
      id: category.id,
      label: category.label,
      description: category.description,
      puzzles: validExercises.get(category.id),
    })),
  };

  fs.writeFileSync(output, `${JSON.stringify(result)}\n`);
  const validatedCandidates = [...sampled.values()].reduce((total, entries) => total + entries.length, 0);
  console.log(`Wrote ${result.total} endgame exercises to ${output} after scanning ${processed.toLocaleString()} puzzles; validated ${validatedCandidates.toLocaleString()} sampled candidates and rejected ${rejected.toLocaleString()}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
