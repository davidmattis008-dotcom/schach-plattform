import type { CageAiPersonalContext } from "./context-selection";

export const CAGE_AI_TRAINING_AREAS = [
  "tactics",
  "endgames",
  "openings",
  "strategy",
  "game_analysis",
] as const;
export const MIN_WEEKLY_TRAINING_MINUTES = 30;
export const MAX_WEEKLY_TRAINING_MINUTES = 600;

export type CageAiTrainingArea = (typeof CAGE_AI_TRAINING_AREAS)[number];

export type CageAiTrainingPreferences = {
  minutesPerWeek: number;
  areas: CageAiTrainingArea[];
};

export type CageAiTrainingTask = {
  id: string;
  day: number;
  area: CageAiTrainingArea;
  title: string;
  instructions: string;
  minutes: number;
  completed: boolean;
};

export type CageAiTrainingPlan = {
  schemaVersion: 1;
  generatedAt: string;
  weekOf: string;
  preferences: CageAiTrainingPreferences;
  contextSummary: string[];
  tasks: CageAiTrainingTask[];
};

export const DEFAULT_TRAINING_PREFERENCES: CageAiTrainingPreferences = {
  minutesPerWeek: 120,
  areas: [...CAGE_AI_TRAINING_AREAS],
};

export function validateTrainingPreferences(value: unknown): CageAiTrainingPreferences | null {
  if (!isRecord(value)
    || Object.keys(value).some((key) => key !== "minutesPerWeek" && key !== "areas")
    || !Number.isInteger(value.minutesPerWeek)
    || Number(value.minutesPerWeek) < MIN_WEEKLY_TRAINING_MINUTES
    || Number(value.minutesPerWeek) > MAX_WEEKLY_TRAINING_MINUTES
    || !Array.isArray(value.areas)
    || value.areas.length < 1
    || value.areas.length > CAGE_AI_TRAINING_AREAS.length
    || !value.areas.every((area) => isTrainingArea(area))) return null;
  return {
    minutesPerWeek: Number(value.minutesPerWeek),
    areas: [...new Set(value.areas as CageAiTrainingArea[])],
  };
}

function isTrainingArea(value: unknown): value is CageAiTrainingArea {
  return typeof value === "string"
    && CAGE_AI_TRAINING_AREAS.some((area) => area === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function weekStart(date: Date) {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + mondayOffset));
  return monday.toISOString().slice(0, 10);
}

function getRating(context: CageAiPersonalContext) {
  const ratings = context.ratings ?? [];
  if (ratings.length === 0) return null;
  return Math.round(ratings.reduce((total, row) => total + row.rating, 0) / ratings.length);
}

function scoreAreas(context: CageAiPersonalContext, preferences: CageAiTrainingPreferences) {
  const scores: Record<CageAiTrainingArea, number> = {
    tactics: 1,
    endgames: 1,
    openings: 1,
    strategy: 1,
    game_analysis: 1,
  };
  const allowed = new Set(preferences.areas);
  for (const area of CAGE_AI_TRAINING_AREAS) {
    if (!allowed.has(area)) scores[area] = -100;
  }

  const tactics = context.learning?.tactics;
  if (tactics && tactics.attempted >= 10) {
    const successRate = tactics.solved / tactics.attempted;
    scores.tactics += successRate < 0.55 ? 3 : successRate < 0.75 ? 1.75 : 0.5;
  } else {
    scores.tactics += 1.2;
  }
  if ((context.learning?.completedCourses?.endgames ?? 0) < 3) scores.endgames += 1.2;
  if ((context.learning?.completedCourses?.openings ?? 0) < 3) scores.openings += 0.7;

  const recentGames = context.recentGames;
  if (recentGames && recentGames.sampleSize >= 3) {
    const lossRate = recentGames.losses / recentGames.sampleSize;
    scores.game_analysis += lossRate >= 0.5 ? 2.5 : lossRate >= 0.3 ? 1.5 : 0.7;
    scores.strategy += lossRate >= 0.5 ? 1.2 : 0.3;
  } else {
    scores.game_analysis += 0.8;
  }

  const memories = context.memories ?? [];
  const textByType = (type: string) => memories
    .filter((memory) => memory.memoryType === type)
    .map((memory) => memory.content)
    .join(" ")
    .toLocaleLowerCase("de");
  const weaknessText = textByType("weakness");
  const goalsText = textByType("training_goal");
  const preferenceText = `${textByType("training_preference")} ${textByType("personal_preference")}`;
  const progressText = `${textByType("progress")} ${textByType("conversation_summary")}`;
  const combined = `${weaknessText} ${goalsText} ${preferenceText} ${progressText}`;
  if (/\btaktik|kombination|gabel|fessel|angriff|drohung/.test(combined)) scores.tactics += 2;
  if (/\bendspiel|bauernendspiel|turmendspiel|opposition/.test(combined)) scores.endgames += 2.5;
  if (/\beröffnung|eroeffnung|repertoire|entwicklung/.test(combined)) scores.openings += 2;
  if (/\bstrategie|plan|positionell|zentrum|schwache felder/.test(combined)) scores.strategy += 2;
  if (/\bpartie|analyse|blunder|fehler|verlust/.test(weaknessText)) scores.game_analysis += 2;
  if (/\babwechslung|vielfalt/.test(preferenceText)) {
    for (const area of preferences.areas) scores[area] += 0.35;
  }
  return scores;
}

function taskCopy(
  area: CageAiTrainingArea,
  rating: number | null,
  context: CageAiPersonalContext,
  index: number,
) {
  const memories = context.memories ?? [];
  const goal = memories.find((memory) => memory.memoryType === "training_goal")?.content;
  const weakness = memories.find((memory) => memory.memoryType === "weakness")?.content;
  const focus = weakness ?? goal;
  const preferences = memories
    .filter((memory) => memory.memoryType === "training_preference" || memory.memoryType === "personal_preference")
    .map((memory) => memory.content.toLocaleLowerCase("de"))
    .join(" ");
  const level = rating === null ? "Beginne mit Aufgaben, die du selbst als leicht bis mittel einschätzt."
    : rating < 1000 ? "Wähle einfache Aufgaben und benenne zuerst die Drohung des Gegners."
      : rating < 1600 ? "Wähle Aufgaben mittlerer Schwierigkeit und prüfe Kandidatenzüge."
        : "Wähle anspruchsvolle Aufgaben und vergleiche Varianten vor dem Zug.";
  const focusLine = focus ? ` Persönlicher Schwerpunkt: ${focus.slice(0, 140)}` : "";
  const preferenceLine = /\bkurz|kurze|kompakt|kleine einheiten/.test(preferences)
    ? " Arbeite in kurzen, klar abgegrenzten Schritten."
    : /\bvisuell|am brett|stellung zeigen/.test(preferences)
      ? " Arbeite die Stellung sichtbar am Brett durch."
      : "";

  const templates: Record<CageAiTrainingArea, Array<{ title: string; instructions: string }>> = {
    tactics: [
      { title: "Taktik mit vollständigem Variantencheck", instructions: `Löse 8–12 Aufgaben. Prüfe vor jedem Zug gegnerische Drohungen und rechne die Hauptvariante bis zu einer ruhigen Stellung. ${level}` },
      { title: "Taktikmuster festigen", instructions: `Löse 6–10 Aufgaben und ordne jedes Motiv ein (Gabel, Fesselung, Abzug oder Mattangriff). Notiere einen übersehenen Hinweis. ${level}` },
    ],
    endgames: [
      { title: "Endspieltechnik üben", instructions: "Trainiere ein Bauern- oder Turmendspiel im passenden ChessCage-Kurs. Spiele die Stellung danach ohne Hilfe noch einmal aus." },
      { title: "Endspielwissen anwenden", instructions: "Wiederhole eine Endspiellektion und löse 3 passende Stellungen. Erkläre bei jeder Stellung deinen Plan in einem Satz." },
    ],
    openings: [
      { title: "Eröffnungspläne statt Zugfolgen", instructions: "Wiederhole eine bekannte Eröffnung und notiere Entwicklungsziel, typischen Bauernhebel und ein häufiges Motiv. Spiele danach eine Beispielpartie." },
      { title: "Repertoire aktiv abrufen", instructions: "Rufe deine ersten 8–10 Eröffnungszüge aus dem Gedächtnis ab und vergleiche sie mit deinem Repertoire. Ergänze nur eine konkrete Lücke." },
    ],
    strategy: [
      { title: "Stellungspläne erkennen", instructions: "Wähle 3 ruhige Stellungen aus einer Partie. Bestimme jeweils die schlechteste Figur, einen langfristigen Hebel und den besten Verbesserungszug." },
      { title: "Figuren verbessern", instructions: "Bearbeite eine strategische Lektion und wende das Thema in 3 Stellungen an. Begründe den Plan, bevor du Kandidatenzüge vergleichst." },
    ],
    game_analysis: [
      { title: "Eine eigene Partie nachanalysieren", instructions: "Analysiere eine gespeicherte Partie erst ohne Engine: markiere kritische Momente und schreibe deine Kandidatenzüge auf. Vergleiche anschließend mit Stockfish." },
      { title: "Aus Fehlern der letzten Partien lernen", instructions: "Öffne eine deiner letzten Partien, prüfe die drei kritischsten Züge mit Stockfish und notiere für jeden eine wiederverwendbare Regel." },
    ],
  };
  const choices = templates[area];
  const template = choices[index % choices.length];
  return {
    title: template.title,
    instructions: `${template.instructions}${focusLine}${preferenceLine}`,
  };
}

function buildContextSummary(context: CageAiPersonalContext, rating: number | null) {
  const summary: string[] = [];
  if (rating !== null) summary.push(`Ø Spielstärke ${rating} Elo`);
  const tactics = context.learning?.tactics;
  if (tactics && tactics.attempted > 0) {
    summary.push(`Taktik ${Math.round((tactics.solved / tactics.attempted) * 100)} % gelöst`);
  }
  if (context.recentGames) {
    summary.push(`${context.recentGames.sampleSize} letzte Partien: ${context.recentGames.wins} S / ${context.recentGames.draws} U / ${context.recentGames.losses} N`);
  }
  const weakness = context.memories?.find((memory) => memory.memoryType === "weakness")?.content;
  if (weakness) summary.push(`Gemerkte Schwäche: ${weakness.slice(0, 100)}`);
  const progress = context.memories?.find((memory) =>
    memory.memoryType === "progress" || memory.memoryType === "conversation_summary"
  )?.content;
  if (progress) summary.push(`Gemerkter Fortschritt: ${progress.slice(0, 100)}`);
  return summary;
}

export function createCageAiTrainingPlan(
  context: CageAiPersonalContext,
  preferences: CageAiTrainingPreferences,
  now = new Date(),
): CageAiTrainingPlan {
  const rating = getRating(context);
  const scores = scoreAreas(context, preferences);
  const areas = preferences.areas
    .slice()
    .sort((left, right) => scores[right] - scores[left] || left.localeCompare(right));
  const sessionCount = Math.min(
    7,
    Math.max(1, Math.ceil(preferences.minutesPerWeek / 45)),
  );
  const weekMinutes = preferences.minutesPerWeek;
  const baseMinutes = Math.floor(weekMinutes / sessionCount);
  const remainder = weekMinutes % sessionCount;
  const weekOf = weekStart(now);
  const tasks = Array.from({ length: sessionCount }, (_, index) => {
    const area = areas[index % areas.length];
    const copy = taskCopy(area, rating, context, index);
    return {
      id: `${weekOf}-${index + 1}-${area}`,
      day: index + 1,
      area,
      ...copy,
      minutes: baseMinutes + (index < remainder ? 1 : 0),
      completed: false,
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    weekOf,
    preferences: {
      minutesPerWeek: weekMinutes,
      areas: [...preferences.areas],
    },
    contextSummary: buildContextSummary(context, rating),
    tasks,
  };
}

export function isCageAiTrainingPlan(value: unknown): value is CageAiTrainingPlan {
  if (!isRecord(value) || value.schemaVersion !== 1
    || typeof value.generatedAt !== "string"
    || typeof value.weekOf !== "string"
    || !Array.isArray(value.tasks)
    || !Array.isArray(value.contextSummary)) return false;
  const preferences = validateTrainingPreferences(value.preferences);
  return preferences !== null
    && value.tasks.length >= 1
    && value.tasks.length <= 7
    && value.tasks.every((task) => isRecord(task)
      && typeof task.id === "string"
      && Number.isInteger(task.day)
      && isTrainingArea(task.area)
      && typeof task.title === "string"
      && typeof task.instructions === "string"
      && typeof task.minutes === "number"
      && Number.isInteger(task.minutes)
      && task.minutes >= 1
      && typeof task.completed === "boolean")
    && value.contextSummary.every((item) => typeof item === "string" && item.length <= 160);
}
