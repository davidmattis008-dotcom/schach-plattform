import { learningLessons, type LearningLesson } from "@/lib/learning-course";
import { chooseTacticsPuzzle, tacticsPuzzles, type TacticsPuzzle } from "@/lib/tactics";

const lessonIdsByDayType: Record<Exclude<DailyLearningType, "tactics">, string[]> = {
  theory: ["brett", "figuren", "schach-matt", "sonderzuege", "zugpruefung", "taktikmotive", "stellungsplan"],
  endgame: ["bauernendspiel", "turmendspiel"],
  checkmate: ["damenmatt", "turmmatt"],
  opening: ["eroeffnung"],
};

export type DailyLearningType = "tactics" | "theory" | "endgame" | "checkmate" | "opening";
export type DailyLearningAssignment =
  | { type: "tactics"; id: string; puzzle: TacticsPuzzle }
  | { type: Exclude<DailyLearningType, "tactics">; id: string; lesson: LearningLesson };

const dailyTypeOrder: DailyLearningType[] = ["tactics", "theory", "endgame", "checkmate", "opening"];

export function createDailyLearningAssignment(date: Date, rating: number, recent: string[]): DailyLearningAssignment {
  const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  const type = dailyTypeOrder[((dayNumber % dailyTypeOrder.length) + dailyTypeOrder.length) % dailyTypeOrder.length];
  if (type === "tactics") {
    const puzzle = chooseTacticsPuzzle(rating, recent);
    return { type, id: `tactics:${puzzle.id}`, puzzle };
  }

  const lessons = lessonIdsByDayType[type]
    .map((id) => learningLessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is LearningLesson => Boolean(lesson));
  const ratingBand = Math.min(lessons.length - 1, Math.floor(((rating - 400) / 2600) * lessons.length));
  const available = lessons.slice(Math.max(0, ratingBand - 1), Math.min(lessons.length, ratingBand + 2));
  const lesson = available[Math.floor(Math.random() * available.length)];
  return { type, id: `${type}:${lesson.id}`, lesson };
}

export function findDailyLearningAssignment(id: string): DailyLearningAssignment | null {
  const [type, ...rest] = id.split(":");
  const itemId = rest.join(":");
  if (type === "tactics") {
    const puzzle = tacticsPuzzles.find((candidate) => candidate.id === itemId);
    return puzzle ? { type, id, puzzle } : null;
  }
  if (type !== "theory" && type !== "endgame" && type !== "checkmate" && type !== "opening") return null;
  const lesson = learningLessons.find((candidate) => candidate.id === itemId);
  return lesson && lessonIdsByDayType[type].includes(itemId) ? { type, id, lesson } : null;
}
