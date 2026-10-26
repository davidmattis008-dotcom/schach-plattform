"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { CageAiPanel } from "@/components/cage-ai-panel";
import exercisesData from "@/lib/endgame-exercises.json";
import { subscribeToAccountProgressUpdates, writeProgressStorage } from "@/lib/account-progress";

type CategoryId = "pawn" | "rook" | "minor" | "queen";
type Exercise = {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  categoryId: CategoryId;
  categoryLabel: string;
  number: number;
};
type ExplainedMove = { fen: string; san: string; color: "w" | "b"; captured?: string; check: boolean; checkmate: boolean };

const STORAGE_KEY = "schach-endspiel-lernen-v1";
const categories = exercisesData.categories;
const allExercises: Exercise[] = categories.flatMap((category) =>
  category.puzzles.map((puzzle, index) => ({
    ...puzzle,
    categoryId: category.id as CategoryId,
    categoryLabel: category.label,
    number: index + 1,
  })),
);
const capturedPieceNames: Record<string, string> = { p: "einen gegnerischen Bauern", n: "einen gegnerischen Springer", b: "einen gegnerischen Läufer", r: "einen gegnerischen Turm", q: "die gegnerische Dame", k: "den gegnerischen König" };
const motifNames: Record<string, string> = {
  advancedPawn: "Freibauer",
  bishopEndgame: "Läuferendspiel",
  crushing: "entscheidender Vorteil",
  defensiveMove: "Verteidigungszug",
  fork: "Gabel",
  knightEndgame: "Springerendspiel",
  mate: "Matt",
  mateIn1: "Matt in 1",
  mateIn2: "Matt in 2",
  passedPawn: "Freibauer",
  pawnEndgame: "Bauernendspiel",
  promotion: "Umwandlung",
  queenEndgame: "Damenendspiel",
  rookEndgame: "Turmendspiel",
  skewer: "Spieß",
  underPromotion: "Unterverwandlung",
};

function playUci(position: Chess, uci: string) {
  const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) throw new Error(`Ungültiger Aufgabenzug: ${uci}`);
  return position.move({
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] } : {}),
  });
}

function moveToUci(move: { from: Square; to: Square; promotion?: string }) {
  return move.from + move.to + (move.promotion ?? "");
}

function describeMove(move: ExplainedMove) {
  const side = move.color === "w" ? "Weiß" : "Schwarz";
  const effect = move.checkmate
    ? " Der Zug setzt matt."
    : move.check
      ? " Der Zug gibt Schach und schränkt die gegnerischen Antworten ein."
      : move.captured
        ? ` Dabei wird ${capturedPieceNames[move.captured] ?? "eine gegnerische Figur"} geschlagen.`
        : " Beobachte, wie der Zug die Stellung und den Plan verändert.";
  return `${side} spielt ${move.san}.${effect}`;
}

function buildLine(exercise: Exercise): ExplainedMove[] {
  const position = new Chess(exercise.fen);
  return exercise.moves.map((uci) => {
    const move = playUci(position, uci);
    return {
      fen: position.fen(),
      san: move.san,
      color: move.color,
      ...(move.captured ? { captured: move.captured } : {}),
      check: position.isCheck(),
      checkmate: position.isCheckmate(),
    };
  });
}

function ExerciseWorkspace({
  exercise,
  applicationExercise,
  isCompleted,
  onSolved,
  onNext,
}: {
  exercise: Exercise;
  applicationExercise: Exercise;
  isCompleted: boolean;
  onSolved: (id: string) => void;
  onNext: () => void;
}) {
  const line = useMemo(() => buildLine(exercise), [exercise]);
  const [mode, setMode] = useState<"guide" | "practice">("guide");
  const [guideStep, setGuideStep] = useState(0);
  const [practiceFen, setPracticeFen] = useState(applicationExercise.fen);
  const [practicePly, setPracticePly] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [message, setMessage] = useState("");
  const solved = practicePly >= applicationExercise.moves.length;
  const guideFen = guideStep === 0 ? exercise.fen : line[guideStep - 1].fen;
  const shownFen = mode === "guide" ? guideFen : practiceFen;
  const board = useMemo(() => new Chess(shownFen), [shownFen]);
  const playerColor = new Chess(exercise.fen).turn();
  const applicationColor = new Chess(applicationExercise.fen).turn();
  const targets = mode === "practice" && selected && !solved
    ? board.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];
  const uniqueMotifs = [...new Set(exercise.themes.map((theme) => motifNames[theme]).filter((theme): theme is string => Boolean(theme)))];
  const currentMove = guideStep > 0 ? line[guideStep - 1] : null;

  function startPractice() {
    setMode("practice");
    setPracticeFen(applicationExercise.fen);
    setPracticePly(0);
    setSelected(null);
    setMessage("Finde die beste Fortsetzung.");
  }

  function selectSquare(squareName: string) {
    if (mode !== "practice" || solved || practicePly >= applicationExercise.moves.length) return;
    const square = squareName as Square;
    const position = new Chess(practiceFen);
    const piece = position.get(square);
    if (!selected) {
      if (piece?.color === position.turn()) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    if (piece?.color === position.turn()) {
      setSelected(square);
      return;
    }
    if (!position.moves({ square: selected, verbose: true }).some((move) => move.to === square)) {
      setSelected(null);
      return;
    }

    const played = position.move({ from: selected, to: square, promotion: "q" });
    if (moveToUci(played) !== applicationExercise.moves[practicePly]) {
      setSelected(null);
      setMessage("Der Zug ist legal, aber nicht die beste Fortsetzung dieser Übung. Versuche es erneut oder sieh dir die Erklärung an.");
      return;
    }

    let nextPly = practicePly + 1;
    let replyMessage = `${played.san} – richtig.`;
    if (nextPly < applicationExercise.moves.length) {
      const reply = playUci(position, applicationExercise.moves[nextPly]);
      replyMessage += ` Der Gegner antwortet mit ${reply.san}.`;
      nextPly++;
    }
    setPracticeFen(position.fen());
    setPracticePly(nextPly);
    setSelected(null);
    if (nextPly >= applicationExercise.moves.length) {
      replyMessage += " Gut gelöst – du hast die Endspielidee in einer neuen Stellung selbst angewendet.";
      onSolved(applicationExercise.id);
    }
    setMessage(replyMessage);
  }

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-200">{exercise.categoryLabel} · {exercise.number} · Elo {exercise.rating}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{mode === "guide" ? "Lösung" : "Übung"}</h2>
        </div>
        {isCompleted && <span className="rounded-full border border-emerald-300/30 px-2 py-1 text-xs text-emerald-200">Gelöst</span>}
      </header>
      {uniqueMotifs.length > 0 && <p className="mt-1 text-xs text-slate-500">{uniqueMotifs.join(" · ")}</p>}
      <div className="mt-3">
        <CageAiPanel
          key={`${exercise.categoryId}:${exercise.number}`}
          contextLabel={`Frage CageAI zur Endspielidee „${exercise.categoryLabel}“.`}
          contextReady
          contextBadge="Endspielkurs"
          placeholder="Frage zu dieser Endspielidee …"
          quickPrompts={["Erkläre mir den wichtigsten Plan in diesem Endspiel."]}
          requestConfig={{
            purpose: "course_question",
            course: {
              courseId: "endgames",
              lessonTitle: exercise.categoryLabel,
              sourceKeys: [`course:lesson:${exercise.categoryId === "pawn" ? "bauernendspiel" : exercise.categoryId === "rook" ? "turmendspiel" : "stellungsplan"}`],
            },
          }}
        />
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,34rem)_minmax(15rem,1fr)]">
        <div>
          <MiniChessboard
            fen={shownFen}
            label={`${exercise.categoryLabel}, ${mode === "practice" ? "eigene Anwendung" : "Erklärungszug " + guideStep} – ${board.turn() === "w" ? "Weiß" : "Schwarz"} am Zug`}
            onSquareClick={mode === "practice" ? selectSquare : undefined}
            selected={mode === "practice" ? selected : null}
            targets={targets}
            orientation={(mode === "practice" ? applicationColor : playerColor) === "w" ? "white" : "black"}
          />
          <p role="status" aria-live="polite" className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-center text-sm font-semibold text-amber-100">
            {board.turn() === "w" ? "Weiß" : "Schwarz"} ist am Zug
          </p>
          <p className="mt-1 text-center text-xs text-slate-500">
            {mode === "practice" ? "Wähle eine Figur und dann ihr Zielfeld." : `Stellung nach ${guideStep} von ${line.length} Lösungszügen`}
          </p>
        </div>

        <div>
          {mode === "guide" ? (
            <>
              <h3 className="font-semibold text-white">Erklärung</h3>
              {currentMove ? (
                <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm leading-5 text-amber-100">
                  Zug {guideStep}: {describeMove(currentMove)}
                </p>
              ) : (
                <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                  Überlege deinen nächsten Zug.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setGuideStep((step) => Math.max(0, step - 1))} disabled={guideStep === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">← Zurück</button>
                {guideStep < line.length
                  ? <button type="button" onClick={() => setGuideStep((step) => Math.min(line.length, step + 1))} className="rounded-lg bg-amber-300 px-3 py-1.5 text-sm font-semibold text-slate-950">{guideStep === 0 ? "Nächster Zug →" : "Weiter →"}</button>
                  : <button type="button" onClick={startPractice} className="rounded-lg bg-amber-300 px-3 py-1.5 text-sm font-semibold text-slate-950">Üben →</button>}
              </div>
            </>
          ) : (
            <>
              <h3 className="font-semibold text-white">Übung</h3>
              <p className="mt-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                Spiele die beste Fortsetzung. Du bist {applicationColor === "w" ? "Weiß" : "Schwarz"}.
              </p>
              <p role="status" aria-live="polite" className={`mt-2 rounded-lg p-3 text-sm ${solved ? "bg-emerald-400/10 text-emerald-200" : "bg-slate-950/60 text-slate-300"}`}>
                {message}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={startPractice} disabled={solved} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm disabled:opacity-40">Nochmal</button>
                <button type="button" onClick={() => { setMode("guide"); setGuideStep(0); setMessage(""); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm">Erklärung</button>
                {solved && <button type="button" onClick={onNext} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Nächste Übung →</button>}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function EndgameLearning() {
  const [categoryId, setCategoryId] = useState<CategoryId>("pawn");
  const [exerciseNumber, setExerciseNumber] = useState(1);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? categories[0];
  const categoryExercises = allExercises.filter((exercise) => exercise.categoryId === categoryId);
  const exercise = categoryExercises[exerciseNumber - 1] ?? categoryExercises[0];
  const completedInCategory = categoryExercises.filter((item) => completed.includes(item.id)).length;
  const totalCompleted = completed.length;

  useEffect(() => {
    let active = true;
    const loadProgress = () => {
      if (!active) return;
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) {
          setCompleted([...new Set(saved.filter((id): id is string => typeof id === "string" && allExercises.some((item) => item.id === id)))]);
        }
      } catch {
        setStorageAvailable(false);
      }
      setReady(true);
    };
    queueMicrotask(loadProgress);
    const unsubscribe = subscribeToAccountProgressUpdates(loadProgress);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready || !storageAvailable) return;
    try {
      writeProgressStorage(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      queueMicrotask(() => setStorageAvailable(false));
    }
  }, [completed, ready, storageAvailable]);

  function chooseCategory(id: CategoryId) {
    setCategoryId(id);
    setExerciseNumber(1);
  }

  function markSolved(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
  }

  function nextExercise() {
    setExerciseNumber((current) => current >= categoryExercises.length ? 1 : current + 1);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/lernen" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Lernpfad</Link>
        <header className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Endspiele</h1>
        </header>

        <section aria-label="Endspielthemen" className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {categories.map((category) => {
            const active = category.id === categoryId;
            const done = allExercises.filter((item) => item.categoryId === category.id && completed.includes(item.id)).length;
            return (
              <button key={category.id} type="button" onClick={() => chooseCategory(category.id as CategoryId)} aria-pressed={active} className={`rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${active ? "border-amber-300/50 bg-amber-300/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
                <span className="block text-sm font-semibold text-white">{category.label}</span>
                <span className="mt-1 block text-xs font-medium text-amber-200">{done}/125</span>
              </button>
            );
          })}
        </section>

        <section aria-label="Übungsfortschritt" className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300"><strong className="text-white">{totalCompleted}/500</strong> · {selectedCategory.label} {completedInCategory}/125</p>
            <label className="flex items-center gap-2 text-sm text-slate-300">Übung
              <input type="number" min={1} max={categoryExercises.length} value={exerciseNumber} onChange={(event) => setExerciseNumber(Math.max(1, Math.min(categoryExercises.length, Number(event.target.value) || 1)))} className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-white" />
              <span className="text-slate-500">/ {categoryExercises.length}</span>
            </label>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Endspielübungen abgeschlossen" aria-valuemin={0} aria-valuemax={500} aria-valuenow={totalCompleted}>
            <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${totalCompleted / 5}%` }} />
          </div>
          {!storageAvailable && <p role="status" className="mt-2 text-xs text-amber-200">Der Browser kann deinen Übungsfortschritt derzeit nicht speichern.</p>}
        </section>

        {ready && exercise && (
          <div className="mt-3">
            <ExerciseWorkspace
              key={exercise.id}
              exercise={exercise}
              applicationExercise={categoryExercises[exerciseNumber % categoryExercises.length]}
              isCompleted={completed.includes(exercise.id)}
              onSolved={markSolved}
              onNext={nextExercise}
            />
          </div>
        )}

      </div>
    </main>
  );
}
