import { mkdir, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";

const letters = ["a", "b", "c", "d", "e"];
const sourceUrl = "https://raw.githubusercontent.com/lichess-org/chess-openings/master";
const groups = new Map();
let importedLines = 0;

for (const letter of letters) {
  const response = await fetch(`${sourceUrl}/${letter}.tsv`);
  if (!response.ok) throw new Error(`Could not download ECO volume ${letter.toUpperCase()}: HTTP ${response.status}`);
  const rows = (await response.text()).trimEnd().split(/\r?\n/);
  if (rows.shift() !== "eco\tname\tpgn") throw new Error(`Unexpected TSV header in ECO volume ${letter.toUpperCase()}.`);

  for (const [rowIndex, row] of rows.entries()) {
    const [eco, name, pgn] = row.split("\t");
    if (!eco || !name || !pgn) throw new Error(`Incomplete opening row in ${letter}.tsv at line ${rowIndex + 2}.`);
    const position = new Chess();
    try {
      position.loadPgn(pgn);
    } catch (error) {
      throw new Error(`Invalid PGN in ECO ${eco}, ${name}.`, { cause: error });
    }
    const moves = position.history();
    if (!moves.length) throw new Error(`Opening line has no moves: ECO ${eco}, ${name}.`);
    const rootName = name.split(":")[0].trim();
    const groupId = `eco-${rootName.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    let opening = groups.get(groupId);
    if (!opening) {
      opening = {
        id: groupId,
        name: rootName,
        side: "Weiß",
        idea: `ECO ${eco} · Gängige Zugfolge aus der Lichess-Eröffnungsdatenbank.`,
        variants: [],
      };
      groups.set(groupId, opening);
    }
    const index = opening.variants.length + 1;
    opening.variants.push({
      id: `${groupId}-${eco.toLowerCase()}-${index}`,
      name,
      description: `ECO ${eco} · Zugfolge Schritt für Schritt lernen und komplett durchspielen.`,
      eco,
      moves,
    });
    importedLines += 1;
  }
}

const output = [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
await mkdir(new URL("../lib/", import.meta.url), { recursive: true });
await writeFile(new URL("../lib/opening-database.json", import.meta.url), JSON.stringify(output));
console.log(`Imported ${importedLines} legal ECO lines in ${output.length} opening families (Lichess CC0 dataset).`);
