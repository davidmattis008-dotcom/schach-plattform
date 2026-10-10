import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";
import ts from "typescript";

const source = await readFile(new URL("../lib/opening-repertoire.ts", import.meta.url), "utf8");
const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const data = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const database = JSON.parse(await readFile(new URL("../lib/opening-database.json", import.meta.url), "utf8"));
const openings = [...data.openingRepertoire, ...database];
assert.ok(data.openingRepertoire.length >= 25, `Expected a broad curated opening catalog, got ${data.openingRepertoire.length}.`);
assert.ok(database.length >= 100, `Expected a broad ECO opening database, got ${database.length} families.`);
assert.ok(data.openingRepertoire.every((opening) => opening.variants.length >= 2), "Each curated opening should include a main line and a side variation.");

const openingIds = new Set();
const variantIds = new Set();
let variantCount = 0;

for (const opening of openings) {
  assert.ok(!openingIds.has(opening.id), `Duplicate opening id: ${opening.id}`);
  openingIds.add(opening.id);
  assert.ok(opening.name && opening.idea && opening.variants.length >= 1, `Incomplete opening: ${opening.id}`);
  for (const variant of opening.variants) {
    assert.ok(!variantIds.has(variant.id), `Duplicate variant id: ${variant.id}`);
    variantIds.add(variant.id);
    variantCount += 1;
    assert.ok(variant.name && variant.description && variant.moves.length >= 1, `Incomplete variant: ${variant.id}`);
    const game = new Chess();
    for (const [index, san] of variant.moves.entries()) {
      try {
        game.move(san);
      } catch (error) {
        throw new Error(`Illegal SAN in ${opening.name} – ${variant.name}, ply ${index + 1}: ${san}`, { cause: error });
      }
    }
  }
}

assert.ok(data.openingRepertoire.reduce((total, opening) => total + opening.variants.length, 0) >= 50, "Expected at least 50 curated opening variations.");
assert.ok(database.reduce((total, opening) => total + opening.variants.length, 0) >= 1000, "Expected at least 1,000 imported ECO lines.");
console.log(`Validated ${openings.length} opening families and ${variantCount} legal variations, including ${database.reduce((total, opening) => total + opening.variants.length, 0)} ECO lines.`);
