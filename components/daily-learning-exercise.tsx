"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { CageAiPanel } from "@/components/cage-ai-panel";
import { createDailyLearningAssignment, findDailyLearningAssignment, type DailyLearningAssignment, type DailyLearningType } from "@/lib/daily-learning";
import { getTacticsRatingChange, getTacticsTheme, type TacticsPuzzle } from "@/lib/tactics";
import { getDailyExerciseLevel, getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress, updateTacticsProgress } from "@/lib/tactics-progress";
import { clampTacticsRating, TACTICS_PLACEMENT_TASKS } from "@/lib/tactics-rating";

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
  if (assignment.puzzle.setupMove) playUci(position, assignment.puzzle.setupMove);
  return position.fen();
}

function playUci(position: Chess, uci: string) {
  const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) throw new Error(`Ungültiger Zug in der Tagesaufgabe: ${uci}`);
  return position.move({
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] as "q" | "r" | "b" | "n" } : {}),
  });
}

function moveToUci(move: { from: Square; to: Square; promotion?: string }) {
  return move.from + move.to + (move.promotion ?? "");
}

function DailyTacticsChallenge({
  puzzle,
  date,
  alreadyCompleted,
}: {
  puzzle: TacticsPuzzle;
  date: string;
  alreadyCompleted: boolean;
}) {
  const [fen, setFen] = useState(() => getTacticsPreviewFen({ type: "tactics", id: `tactics:${puzzle.id}`, puzzle }));
  const [selected, setSelected] = useState<Square | null>(null);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [result, setResult] = useState<"solved" | "missed" | null>(alreadyCompleted ? "solved" : null);
  const game = new Chess(fen);
  const playerColor = new Chess(getTacticsPreviewFen({ type: "tactics", id: `tactics:${puzzle.id}`, puzzle })).turn();
  const targets = selected && !result
    ? game.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];

  function finish(solved: boolean, answer: string) {
    if (result || alreadyCompleted) return;
    const current = getTacticsProgress();
    const isCurrentDailyAssignment = current.dailyAssignmentDate === date
      && current.dailyAssignmentId === `tactics:${puzzle.id}`
      && current.dailyLastCompletedDate !== date;
    if (!isCurrentDailyAssignment) {
      setResult(solved ? "solved" : "missed");
      return;
    }

    const isPlacement = current.placementAttempts < TACTICS_PLACEMENT_TASKS;
    const isRated = !isPlacement && Math.abs(puzzle.rating - current.rating) <= 100;
    const ratingChange = isRated ? getTacticsRatingChange(current.rating, puzzle.rating, solved) : 0;
    updateTacticsProgress((progress) => {
      if (progress.dailyAssignmentDate !== date
        || progress.dailyAssignmentId !== `tactics:${puzzle.id}`
        || progress.dailyLastCompletedDate === date) return progress;
      return {
        ...progress,
        rating: isPlacement
          ? clampTacticsRating(progress.rating + (solved ? 300 : -300))
          : isRated ? clampTacticsRating(progress.rating + ratingChange) : progress.rating,
        solved: progress.solved + (solved ? 1 : 0),
        attempted: progress.attempted + 1,
        placementAttempts: isPlacement
          ? Math.min(TACTICS_PLACEMENT_TASKS, progress.placementAttempts + 1)
          : progress.placementAttempts,
        recent: Array.from(new Set([...progress.recent, puzzle.id])),
        dailyExercisesCompleted: progress.dailyExercisesCompleted + 1,
        dailyLastCompletedDate: date,
      };
    });
    setResult(solved ? "solved" : "missed");
    setSelected(null);
    setMessage(solved ? `${answer} · richtig` : `${answer} · nicht gelöst`);
  }

  const [message, setMessage] = useState("");

  function selectSquare(squareName: string) {
    if (result || alreadyCompleted || game.turn() !== playerColor) return;
    const square = squareName as Square;
    const piece = game.get(square);
    if (!selected) {
      if (piece?.color === playerColor) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    if (piece?.color === playerColor) {
      setSelected(square);
      return;
    }
    if (!targets.includes(square)) {
      setSelected(null);
      return;
    }

    const position = new Chess(fen);
    const movingPiece = game.get(selected);
    const expectedMove = puzzle.moves[solutionIndex];
    const promotes = movingPiece?.type === "p" && (square[1] === "1" || square[1] === "8");
    const played = position.move({
      from: selected,
      to: square,
      ...(promotes ? { promotion: expectedMove[4] ?? "q" } : {}),
    });
    const expectedPosition = new Chess(fen);
    const expected = playUci(expectedPosition, expectedMove);
    if (moveToUci(played) !== expectedMove) {
      finish(false, `Gesucht war ${expected.san}`);
      return;
    }

    let nextIndex = solutionIndex + 1;
    let status = `${played.san}`;
    if (nextIndex < puzzle.moves.length) {
      const reply = playUci(position, puzzle.moves[nextIndex]);
      status += ` · ${reply.san}`;
      nextIndex++;
    }
    setFen(position.fen());
    setSolutionIndex(nextIndex);
    setSelected(null);
    if (nextIndex >= puzzle.moves.length) finish(true, status);
  }

  return (
    <div className="mt-4 grid items-start gap-4 sm:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <MiniChessboard
        fen={fen}
        label="Taktikübung im Lernpfad"
        onSquareClick={selectSquare}
        selected={selected}
        targets={targets}
        orientation={playerColor === "w" ? "white" : "black"}
      />
      <div>
        <p className="font-medium text-white">{getTacticsTheme(puzzle.themes)} · Elo {puzzle.rating}</p>
        {alreadyCompleted || result ? (
          <p role="status" className="mt-3 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm text-emerald-100">
            {alreadyCompleted ? "Heute erledigt. Komm morgen wieder." : `${message}. Komm morgen wieder.`}
          </p>
        ) : (
          <p aria-live="polite" className="mt-2 text-sm text-neutral-400">{message || "Finde den besten Zug."}</p>
        )}
      </div>
    </div>
  );
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
  const isCorrect = submitted && answer === lesson.correctAnswer;
  const showResult = alreadyCompleted || isCorrect;

  function submitAnswer() {
    if (answer === null || alreadyCompleted) return;
    setSubmitted(true);
    if (answer === lesson.correctAnswer) onComplete(date);
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
          {alreadyCompleted ? "Heute erledigt. Komm morgen wieder." : `Richtig. ${lesson.explanation}`}
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
      {submitted && !isCorrect && !alreadyCompleted && (
        <p role="status" className="mt-2 text-sm text-amber-100">
          Nicht ganz. {lesson.explanation}
          <button type="button" onClick={() => { setAnswer(null); setSubmitted(false); }} className="ml-2 font-semibold underline underline-offset-2">Nochmal</button>
        </p>
      )}
      {lesson.practice && (
        <Link
          href={lesson.practice.href}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/10"
        >
          {assignment.type === "opening" ? "Erklärung am Eröffnungsbrett üben" : lesson.practice.label}
        </Link>
      )}
      <div className="mt-4">
        <CageAiPanel
          key={lesson.id}
          contextLabel={`Frage ChessCageAI zur heutigen Lektion „${lesson.title}“. Die Antwort wird auf passende ChessCage-Kursinhalte begrenzt.`}
          contextReady
          contextBadge="Aktuelle Lektion"
          placeholder="Frage zu dieser Lektion …"
          quickPrompts={["Kannst du mir diese Lektion einfacher erklären?"]}
          requestConfig={{
            purpose: "course_question",
            course: {
              courseId: assignment.type,
              lessonTitle: lesson.title,
              sourceKeys: [`course:lesson:${lesson.id}`],
            },
          }}
        />
      </div>
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
    <section id="lernpfad" aria-labelledby="daily-exercise-title" className="mb-8 scroll-mt-20 rounded-2xl border border-amber-300/30 bg-slate-900/80 p-4 shadow-[0_16px_50px_rgba(0,0,0,0.24)] sm:p-6">
      <div>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                {today ? `${today} · ` : ""}{assignment ? typeLabels[assignment.type] : "Lädt"}
              </p>
              <h2 id="daily-exercise-title" className="mt-1 text-2xl font-bold text-white">Lernpfad</h2>
            </div>
            <p className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-amber-100">
              Level {level.level} · {level.completedInLevel}/{level.taskCount}
            </p>
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            {assignment?.type === "tactics" ? `Taktik-Elo ${progress.rating}` : "Tägliche Lerneinheit"}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label={`Fortschritt in Level ${level.level}`} aria-valuemin={0} aria-valuemax={level.taskCount} aria-valuenow={level.completedInLevel}>
            <div className="h-full rounded-full bg-amber-300 transition-[width]" style={{ width: `${(level.completedInLevel / level.taskCount) * 100}%` }} />
          </div>
          {assignment?.type === "tactics" ? (
            <>
              <DailyTacticsChallenge
                key={`${today}:${assignment.id}`}
                puzzle={assignment.puzzle}
                date={today!}
                alreadyCompleted={alreadyCompleted}
              />
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
        </div>
      </div>
    </section>
  );
}
