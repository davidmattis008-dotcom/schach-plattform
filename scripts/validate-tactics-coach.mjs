import assert from "node:assert/strict";
import {
  getPreferredTacticsThemes,
  getTacticsCoachExplanation,
  getTacticsCoachHint,
  getTacticsCoachTheme,
} from "../lib/tactics-coach.ts";

assert.deepEqual(
  getPreferredTacticsThemes([
    "Bei Taktikaufgaben übersehe ich häufig Gabeln.",
    "Ich möchte Fesselungen besser erkennen.",
  ]),
  ["fork", "pin"],
  "Saved weakness memories should map to matching puzzle motifs.",
);
assert.equal(getTacticsCoachTheme(["endgame", "fork"]), "fork", "Prefer the tactical motif over the general game phase.");
assert.deepEqual(
  getPreferredTacticsThemes(["Bei Taktikaufgaben übersehe ich häufig Endspiele."]),
  ["endgame"],
  "Saved phase weaknesses should map to matching puzzle themes.",
);
assert.deepEqual(
  getPreferredTacticsThemes(["Mein langfristiges Ziel ist ein höheres Rating."]),
  [],
  "Non-motif memories should not affect tactic selection.",
);

const forkHints = [1, 2, 3].map((level) => getTacticsCoachHint(["fork"], level));
assert.equal(new Set(forkHints).size, 3, "Each hint level should add a distinct prompt.");
assert.ok(forkHints.every((hint) => !/[a-h][1-8][a-h][1-8]/.test(hint)), "Hints should not disclose a move.");
assert.match(getTacticsCoachExplanation(["fork"]), /mehrere gegnerische Ziele/);
assert.match(getTacticsCoachExplanation(["unknown"]), /Lösungsvariante/);

console.log("Validated personalized tactic hints, motif explanations, and weakness mapping.");
