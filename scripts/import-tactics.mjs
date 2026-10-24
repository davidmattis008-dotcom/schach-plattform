import assert from "node:assert/strict";
import fs from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createZstdDecompress } from "node:zlib";
import { Chess } from "chess.js";

const targetCount = 10000;
const sourceRatingMin = 400;
const sourceRatingMax = 3000;
const bucketWidth = 100;
const bucketCount = Math.ceil((sourceRatingMax - sourceRatingMin) / bucketWidth);
const markers = Array.from({ length: 16 }, (_, index) => Buffer.from([0x50 + index, 0x2a, 0x4d, 0x18]));

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index].startsWith("--")) args[argv[index].slice(2)] = argv[++index];
  }
  return args;
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

function addToReservoir(items, entry, seenCount, capacity, random) {
  const seen = seenCount + 1;
  if (items.length < capacity) items.push(entry);
  else {
    const index = Math.floor(random() * seen);
    if (index < capacity) items[index] = entry;
  }
  return seen;
}

function normalizePuzzle(fen, uciMoves) {
  const position = new Chess(fen);
  const playUci = (uci) => {
    const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match || (match[3] && match[3] !== "q")) throw new Error("Unsupported move");
    position.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
  };

  playUci(uciMoves[0]);
  const puzzleFen = position.fen();
  const moves = uciMoves.slice(1);
  if (moves.length < 1 || moves.length > 29 || moves.length % 2 !== 1) throw new Error("Invalid solution length");
  for (const move of moves) playUci(move);
  return { fen: puzzleFen, moves };
}

function stripSkippableFrames() {
  let pending = Buffer.alloc(0);
  function findMarker(buffer, start) {
    let first = -1;
    for (const marker of markers) {
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
        if (payloadLength !== 4 || buffer.readUInt32LE(marker + 12) !== 0xfd2fb528
          || magic < 0x184d2a50 || magic > 0x184d2a5f) {
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

function puzzlePositionKey(puzzle) {
  const position = new Chess(puzzle.fen);
  if (puzzle.setupMove) {
    const match = puzzle.setupMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) throw new Error(`Invalid setup move in ${puzzle.id}`);
    position.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
  }
  return `${position.fen()}:${puzzle.moves.join(" ")}`;
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input;
  const base = args.base ?? "lib/tactics-base-data.json";
  const output = args.output ?? "lib/tactics-data.json";
  const configOutput = args.config ?? "lib/tactics-rating-config.json";
  const seed = Number.parseInt(args.seed ?? "20261026", 10);
  if (!input) throw new Error("Usage: node scripts/import-tactics.mjs --input <lichess-puzzle.csv.zst> [--output <file>] [--seed <number>]");
  if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");

  const existing = JSON.parse(fs.readFileSync(base, "utf8"));
  if (!Array.isArray(existing) || existing.length >= targetCount) throw new Error(`Expected fewer than ${targetCount} puzzles in ${base}`);
  const needed = targetCount - existing.length;
  const quotas = Array.from({ length: bucketCount }, (_, index) =>
    Math.floor(needed / bucketCount) + (index < needed % bucketCount ? 1 : 0));
  const capacity = quotas.map((quota) => quota + Math.max(100, Math.ceil(quota * 0.5)));
  const sampled = quotas.map(() => []);
  const seenCounts = quotas.map(() => 0);
  const random = createRandom(seed);
  const inputStream = fs.createReadStream(input);
  let decodedStream = inputStream;
  let decompression;
  if (input.toLowerCase().endsWith(".zst")) {
    decodedStream = createZstdDecompress();
    decompression = pipeline(inputStream, stripSkippableFrames(), decodedStream);
    decompression.catch(() => {});
  }

  let headerSeen = false;
  let processed = 0;
  for await (const line of readLines(decodedStream)) {
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    processed++;
    const columns = line.split(",");
    if (columns.length < 8) continue;
    const [sourceId, fen, movesText, ratingText, , popularityText, , themesText] = columns;
    const sourceRating = Number.parseInt(ratingText, 10);
    const popularity = Number.parseInt(popularityText, 10);
    if (!sourceId || !fen || !movesText || !Number.isInteger(sourceRating)
      || sourceRating < sourceRatingMin || sourceRating > sourceRatingMax || popularity < 10) continue;

    const uciMoves = movesText.split(" ");
    if (uciMoves.length < 2 || uciMoves.some((move) => !/^([a-h][1-8])([a-h][1-8])([qrbn])?$/.test(move))
      || uciMoves.some((move) => move.length === 5 && move[4] !== "q")) continue;
    const bucket = Math.min(bucketCount - 1, Math.floor((sourceRating - sourceRatingMin) / bucketWidth));
    seenCounts[bucket] = addToReservoir(
      sampled[bucket],
      { fen, uciMoves, sourceRating, themes: themesText.split(" ") },
      seenCounts[bucket],
      capacity[bucket],
      random,
    );
    if (processed % 500000 === 0) console.error(`Read ${processed.toLocaleString()} puzzle rows.`);
  }
  if (decompression) await decompression;

  const usedPositions = new Set(existing.map(puzzlePositionKey));
  const additions = [];
  let rejected = 0;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const valid = [];
    for (const candidate of sampled[bucket]) {
      try {
        const normalized = normalizePuzzle(candidate.fen, candidate.uciMoves);
        const puzzle = { ...normalized, sourceRating: candidate.sourceRating, themes: candidate.themes };
        const key = puzzlePositionKey(puzzle);
        if (usedPositions.has(key)) continue;
        usedPositions.add(key);
        valid.push(puzzle);
      } catch {
        rejected++;
      }
    }
    if (valid.length < quotas[bucket]) {
      throw new Error(`Rating bucket ${sourceRatingMin + bucket * bucketWidth}-${sourceRatingMin + (bucket + 1) * bucketWidth - 1} has ${valid.length}/${quotas[bucket]} valid unique puzzles.`);
    }
    shuffle(valid, random);
    additions.push(...valid.slice(0, quotas[bucket]));
  }

  const allPuzzles = [
    ...existing.map((puzzle) => ({
      ...puzzle,
      sourceRating: puzzle.sourceRating ?? puzzle.rating,
    })),
    ...additions.map((puzzle, index) => ({
      id: `tactics-extra-${String(index + 1).padStart(5, "0")}`,
      ...puzzle,
    })),
  ];
  const minRating = Math.min(...allPuzzles.map((puzzle) => puzzle.sourceRating));
  const maxRating = Math.max(...allPuzzles.map((puzzle) => puzzle.sourceRating));
  assert.ok(maxRating > minRating, "The selected source ratings must span a range.");
  const normalized = allPuzzles.map((puzzle) => ({
    ...puzzle,
    rating: Math.round(((puzzle.sourceRating - minRating) / (maxRating - minRating)) * 3000),
  }));

  const formattedPuzzles = `[\n${normalized.map((puzzle) => `  ${JSON.stringify(puzzle)}`).join(",\n")}\n]\n`;
  fs.writeFileSync(output, formattedPuzzles);
  fs.writeFileSync(configOutput, `${JSON.stringify({
    sourceRatingMin: minRating,
    sourceRatingMax: maxRating,
    ratingMin: 0,
    ratingMax: 3000,
    ratingScaleVersion: 2,
    source: "https://database.lichess.org/#puzzles",
    license: "CC0-1.0",
  })}\n`);
  console.log(`Wrote ${normalized.length} puzzles (${minRating}-${maxRating} source Elo mapped to 0-3000); scanned ${processed.toLocaleString()} rows and rejected ${rejected.toLocaleString()} sampled positions.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
