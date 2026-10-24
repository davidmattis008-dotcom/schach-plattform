"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Chess } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { createDailyLearningAssignment, findDailyLearningAssignment, type DailyLearningAssignment, type DailyLearningType } from "@/lib/daily-learning";
import { getTacticsDifficulty, getTacticsTheme } from "@/lib/tactics";
import { getDailyExerciseLevel, getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress, updateTacticsProgress } from "@/lib/tactics-progress";

const typeLabels: Record<DailyLearningType, string> = {
  tactics: "Taktik",
  theory: "Schachtheorie",
  endgame: "Endspiel",
  checkmate: "Mattsetzen",
  opening: "Eröffnung",
};

function getLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTacticsPreviewFen(assignment: Extract<DailyLearningAssignment, { type: "tactics" }>) {
  const position = new Chess(assignment.puzzle.fen);
  if (assignment.puzzle.setupMove) {
    const [from, to, promotion] = assignment.puzzle.setupMove.match(/.{2}/g) ?? [];
    if (from && to) position.move({ from, to, ...(promotion ? { promotion } : {}) });
  }
  return position.fen();
}

function DailyLessonChallenge({
  assignment,
  date,
  alreadyCompleted,
  onComplete,
}: {
  assignment: Extract<DailyLearningAssignment, { type: Exclude<DailyLearningType, "tactics"> }>;
  date: string;
  alreadyCompleted: boolean;
  onComplete: (date: string) => void;
}) {
  const [answer, setAnswer] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const lesson = assignment.lesson;
  const showResult = submitted || alreadyCompleted;

  function submitAnswer() {
    if (answer === null || alreadyCompleted) return;
    setSubmitted(true);
    onComplete(date);
  }

  return (
    <>
      <p className="mt-3 text-sm leading-6 text-neutral-300">{lesson.introduction}</p>
      {assignment.type === "opening" && (
        <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">
          Eröffnung des Tages: erst die Idee verstehen, dann die Frage beantworten und anschließend die Zugfolge am Brett üben.
        </p>
      )}
      <h3 className="mt-4 font-semibold text-white">{lesson.question}</h3>
      <div className="mt-2 grid gap-2">
        {lesson.answers.map((option, index) => (
          <button
            key={option}
            type="button"
            disabled={showResult}
            aria-pressed={answer === index}
            onClick={() => setAnswer(index)}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition disabled:cursor-default ${
              showResult && index === lesson.correctAnswer
                ? "border-emerald-300/50 bg-emerald-300/10 text-emerald-100"
                : answer === index
                  ? "border-amber-300/50 bg-amber-300/10 text-white"
                  : "border-neutral-700 bg-black/20 text-neutral-300 hover:border-neutral-500"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {showResult ? (
        <p role="status" className="mt-3 rounded-lg bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">
          {submitted && answer === lesson.correctAnswer
            ? "Richtig. "
            : submitted && answer !== null
              ? `Die richtige Antwort ist: ${lesson.answers[lesson.correctAnswer]}. `
              : "Heute bereits erledigt. "}
          {lesson.explanation}
        </p>
      ) : (
        <button
          type="button"
          disabled={answer === null}
          onClick={submitAnswer}
          className="mt-3 min-h-11 rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Antwort prüfen
        </button>
      )}
      {lesson.practice && (
        <Link
          href={lesson.practice.href}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
        >
          {assignment.type === "opening" ? "Erklärung am Eröffnungsbrett üben" : lesson.practice.label}
        </Link>
      )}
    </>
  );
}

export function DailyLearningExercise() {
  const [today, setToday] = useState<string | null>(null);
  const progress = useSyncExternalStore(
    subscribeToTacticsProgress,
    getTacticsProgress,
    () => INITIAL_TACTICS_PROGRESS,
  );

  useEffect(() => {
    const updateToday = () => setToday(getLocalDayKey(new Date()));
    updateToday();
    const interval = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!today) return;
    const savedAssignment = progress.dailyAssignmentId
      ? findDailyLearningAssignment(progress.dailyAssignmentId)
      : null;
    if (progress.dailyAssignmentDate === today && savedAssignment) return;

    const assignment = createDailyLearningAssignment(new Date(`${today}T12:00:00`), progress.rating, progress.recent);
    updateTacticsProgress((current) => {
      const currentAssignment = current.dailyAssignmentId
        ? findDailyLearningAssignment(current.dailyAssignmentId)
        : null;
      return current.dailyAssignmentDate === today && currentAssignment
        ? current
        : { ...current, dailyAssignmentDate: today, dailyAssignmentId: assignment.id };
    });
  }, [today, progress.dailyAssignmentDate, progress.dailyAssignmentId, progress.rating, progress.recent]);

  const assignment: DailyLearningAssignment | null = today && progress.dailyAssignmentDate === today && progress.dailyAssignmentId
    ? findDailyLearningAssignment(progress.dailyAssignmentId)
    : null;
  const alreadyCompleted = today !== null && progress.dailyLastCompletedDate === today;
  const level = getDailyExerciseLevel(progress.dailyExercisesCompleted);

  function completeDailyExercise(date: string) {
    updateTacticsProgress((current) => current.dailyLastCompletedDate === date
      ? current
      : {
        ...current,
        dailyExercisesCompleted: current.dailyExercisesCompleted + 1,
        dailyLastCompletedDate: date,
      });
  }

  return (
    <section id="tagesuebung" aria-labelledby="daily-exercise-title" className="mb-8 scroll-mt-20 rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-300/[0.09] via-neutral-950 to-neutral-950 p-4 sm:p-6">
      <div className={`grid items-start gap-5 ${assignment?.type === "tactics" ? "sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]" : ""}`}>
        {assignment?.type === "tactics" && (
          <div className="mx-auto w-full max-w-[15rem]">
            <MiniChessboard
              fen={getTacticsPreviewFen(assignment)}
              label="Heutige Taktikaufgabe"
              orientation={new Chess(assignment.puzzle.fen).turn() === "w" ? "white" : "black"}
            />
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            Tagesübung{today ? ` · ${today}` : ""}{assignment ? ` · ${typeLabels[assignment.type]}` : ""}
          </p>
          <h2 id="daily-exercise-title" className="mt-2 text-2xl font-bold text-white">Level {level.level} · {assignment?.type === "opening" ? "Erklärung und Aufgabe" : "Tagesaufgabe"}</h2>
          <p className="mt-2 text-sm text-neutral-300">
            Level-Fortschritt: {level.completedInLevel} von {level.taskCount} Tagesaufgaben
            {assignment?.type === "tactics" && ` · Taktik-Elo ${progress.rating}`}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label={`Fortschritt in Level ${level.level}`} aria-valuemin={0} aria-valuemax={level.taskCount} aria-valuenow={level.completedInLevel}>
            <div className="h-full rounded-full bg-amber-300 transition-[width]" style={{ width: `${(level.completedInLevel / level.taskCount) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-neutral-500">Jedes neue Level umfasst 10 Tagesaufgaben mehr. Übersprungene Tage setzen deinen Fortschritt nicht zurück.</p>
          {assignment?.type === "tactics" ? (
            <>
              <h3 className="mt-4 font-semibold text-white">{getTacticsTheme(assignment.puzzle.themes)}</h3>
              <p className="mt-1 text-sm text-neutral-300">{getTacticsDifficulty(assignment.puzzle.rating)} · Aufgaben-Elo {assignment.puzzle.rating}. Die Stellung wird passend zu deiner Taktik-Elo ausgewählt.</p>
              <Link
                href={`/taktik?puzzle=${encodeURIComponent(assignment.puzzle.id)}&daily=1&day=${today}`}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {alreadyCompleted ? "Aufgabe erneut ansehen" : "Tagesaufgabe starten"}
              </Link>
            </>
          ) : assignment && today ? (
            <DailyLessonChallenge
              key={`${today}:${assignment.id}`}
              assignment={assignment}
              date={today}
              alreadyCompleted={alreadyCompleted}
              onComplete={completeDailyExercise}
            />
          ) : (
            <p className="mt-2 text-sm text-neutral-400">Die heutige Übung wird geladen …</p>
          )}
          {alreadyCompleted && <p className="mt-2 text-sm text-emerald-200">Die heutige Tagesaufgabe ist erledigt.</p>}
        </div>
      </div>
    </section>
  );
}
