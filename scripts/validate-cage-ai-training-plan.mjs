import assert from "node:assert/strict";
import {
  CAGE_AI_TRAINING_AREAS,
  createCageAiTrainingPlan,
  isCageAiTrainingPlan,
  validateTrainingPreferences,
} from "../lib/cage-ai/training-plan.ts";
import { selectCageAiPersonalContext } from "../lib/cage-ai/context-selection.ts";

const generatedAt = new Date("2026-10-26T12:00:00.000Z");
const preferences = validateTrainingPreferences({
  minutesPerWeek: 180,
  areas: [...CAGE_AI_TRAINING_AREAS],
});
assert.ok(preferences);
assert.equal(validateTrainingPreferences({ minutesPerWeek: 29, areas: ["tactics"] }), null);
assert.equal(validateTrainingPreferences({ minutesPerWeek: 60, areas: ["chat"] }), null);
assert.equal(validateTrainingPreferences({
  minutesPerWeek: 60,
  areas: ["tactics"],
  admin: true,
}), null);

const context = {
  purpose: "training_plan",
  ratings: [
    { game_mode: "rapid", rating: 1550, rated_games: 40 },
    { game_mode: "blitz", rating: 1450, rated_games: 60 },
  ],
  learning: {
    tactics: { rating: 1200, solved: 24, attempted: 60, dailyExercisesCompleted: 3 },
    completedCourses: { rules: 4, openings: 0, checkmate: 2, endgames: 0 },
  },
  memories: [
    { memoryType: "training_goal", content: "Sicherer im Endspiel werden." },
    { memoryType: "weakness", content: "Ich übersehe im Endspiel oft die Opposition." },
    { memoryType: "training_preference", content: "Ich mag abwechslungsreiche Aufgaben." },
    { memoryType: "personal_preference", content: "Bitte kurze Einheiten." },
    { memoryType: "progress", content: "Ich habe zuletzt 3 Endspiellektionen abgeschlossen." },
  ],
  recentGames: {
    sampleSize: 5,
    wins: 1,
    draws: 1,
    losses: 3,
    averageMoves: 38,
    timeControls: ["10+0"],
  },
};
const summarizedContext = selectCageAiPersonalContext(
  "training_plan",
  [],
  {},
  [],
  {
    sampleSize: 3,
    wins: 1,
    draws: 1,
    losses: 1,
    averageMoves: 40,
    timeControls: ["10+0", "rapid"],
  },
);
assert.deepEqual(summarizedContext.recentGames, {
  sampleSize: 3,
  wins: 1,
  draws: 1,
  losses: 1,
  averageMoves: 40,
  timeControls: ["10+0", "rapid"],
});

const plan = createCageAiTrainingPlan(context, preferences, generatedAt);
assert.ok(isCageAiTrainingPlan(plan));
assert.equal(plan.weekOf, "2026-10-26");
assert.equal(plan.tasks.reduce((total, task) => total + task.minutes, 0), 180);
assert.equal(plan.tasks.length, 4);
assert.ok(plan.tasks.every((task) => task.minutes > 0 && !task.completed));
assert.ok(plan.tasks.some((task) => task.area === "endgames"));
assert.ok(plan.tasks.some((task) => task.instructions.includes("Opposition")));
assert.ok(plan.tasks.some((task) => task.instructions.includes("kurzen, klar abgegrenzten Schritten")));
assert.ok(plan.contextSummary.some((summary) => summary.includes("Ø Spielstärke 1500 Elo")));
assert.ok(plan.contextSummary.some((summary) => summary.includes("40 % gelöst")));
assert.ok(plan.contextSummary.some((summary) => summary.includes("3 N")));
assert.ok(plan.contextSummary.some((summary) => summary.includes("Gemerkter Fortschritt")));
assert.equal("pgn" in plan, false);
assert.equal("opponent" in plan, false);

const restrictedPlan = createCageAiTrainingPlan(
  context,
  { minutesPerWeek: 60, areas: ["tactics"] },
  generatedAt,
);
assert.ok(restrictedPlan.tasks.every((task) => task.area === "tactics"));
assert.equal(restrictedPlan.tasks.reduce((total, task) => total + task.minutes, 0), 60);
const focusedPlan = createCageAiTrainingPlan(
  context,
  { minutesPerWeek: 120, areas: ["endgames"] },
  generatedAt,
);
assert.equal(focusedPlan.tasks.length, 3);
assert.ok(focusedPlan.tasks.every((task) => task.area === "endgames"));
assert.equal(focusedPlan.tasks.reduce((total, task) => total + task.minutes, 0), 120);

console.log("Validated personalized task selection, weekly time budgets, and bounded plan contents.");
