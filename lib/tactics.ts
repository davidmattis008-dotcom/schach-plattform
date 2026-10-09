import puzzleData from "./tactics-data.json";

export type TacticsPuzzle = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  setupMove?: string;
};

export const tacticsPuzzles: TacticsPuzzle[] = puzzleData;
export const tacticsPreviewFen = tacticsPuzzles[0].fen;

export function getTacticsPuzzleForRating(rating: number, recent: string[]): TacticsPuzzle {
  const unseen = tacticsPuzzles.filter((puzzle) => !recent.includes(puzzle.id));
  const available = unseen.length > 0 ? unseen : tacticsPuzzles;
  return available.reduce((closest, puzzle) => (
    Math.abs(puzzle.rating - rating) < Math.abs(closest.rating - rating) ? puzzle : closest
  ));
}

export function chooseTacticsPuzzle(rating: number, recent: string[]): TacticsPuzzle {
  const unseen = tacticsPuzzles.filter((puzzle) => !recent.includes(puzzle.id));
  const available = unseen.length > 0 ? unseen : tacticsPuzzles;
  const nearby = available.filter((puzzle) => Math.abs(puzzle.rating - rating) <= 200);
  const candidates = nearby.length > 0
    ? nearby
    : available.filter((puzzle) => Math.abs(puzzle.rating - rating) === Math.abs(getTacticsPuzzleForRating(rating, recent).rating - rating));

  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getTacticsRatingChange(userRating: number, puzzleRating: number, solved: boolean): number {
  const expectedScore = 1 / (1 + 10 ** ((puzzleRating - userRating) / 400));
  return Math.round(24 * ((solved ? 1 : 0) - expectedScore));
}

export function getTacticsTheme(themes: string[]): string {
  const labels: Record<string, string> = {
    advancedPawn: "Bauernumwandlung",
    anastasiaMate: "Anastasia-Matt",
    attraction: "Ablenkung",
    backRankMate: "Grundreihenmatt",
    cornerMate: "Eckenmatt",
    crushing: "Entscheidender Vorteil",
    deflection: "Ablenkung",
    discoveredAttack: "Doppelangriff",
    discoveredCheck: "Abzugsschach",
    endgame: "Endspiel",
    exposedKing: "Königsangriff",
    fork: "Gabel",
    hangingPiece: "Ungedeckte Figur",
    middlegame: "Mittelspiel",
    opening: "Eröffnung",
    pin: "Fesselung",
    pillsburysMate: "Pillsbury-Matt",
    promotion: "Umwandlung",
    sacrifice: "Opfer",
    skewer: "Spieß",
    trappedPiece: "Eingesperrte Figur",
  };
  const mate = themes.find((theme) => /^mateIn\d+$/.test(theme));
  if (mate) return `Matt in ${mate.slice("mateIn".length)}`;

  const theme = themes.find((candidate) => labels[candidate]) ?? themes[0];
  return labels[theme] ?? "Taktische Kombination";
}

export function getTacticsDifficulty(rating: number): string {
  if (rating < 1300) return "Grundlagen";
  if (rating < 1500) return "Leicht";
  if (rating < 1700) return "Mittel";
  if (rating < 1900) return "Anspruchsvoll";
  return "Schwer";
}
