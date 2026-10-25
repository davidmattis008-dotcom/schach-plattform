"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { SelectMenu } from "@/components/select-menu";
import { chooseTacticsPuzzle, getTacticsDifficulty, getTacticsPuzzleForRating, getTacticsRatingChange, getTacticsTheme, tacticsPuzzles } from "@/lib/tactics";
import { getDailyExerciseLevel, getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress, updateTacticsProgress } from "@/lib/tactics-progress";
import { clampTacticsRating, isTacticsDifficultyOffset, TACTICS_PLACEMENT_TASKS } from "@/lib/tactics-rating";
import { createClient } from "@/lib/supabase/client";

type Outcome = "solved" | "missed" | null;
type SavedTacticRow = { puzzle_id: string };

function playUci(position: Chess, uci: string) {
  const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) throw new Error(`Ungültiger Aufgabenzug: ${uci}`);

  return position.move({
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] } : {}),
  });
}

function moveToUci(move: { from: Square; to: Square; promotion?: string }): string {
  return move.from + move.to + (move.promotion ?? "");
}

export default function TacticsPage() {
  const progress = useSyncExternalStore(subscribeToTacticsProgress, getTacticsProgress, () => INITIAL_TACTICS_PROGRESS);
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [practicePuzzleId, setPracticePuzzleId] = useState<string | null>(null);
  const [dailyExercise, setDailyExercise] = useState(false);
  const [dailyExerciseDate, setDailyExerciseDate] = useState<string | null>(null);
  const [clubTaskId, setClubTaskId] = useState<string | null>(null);
  const [clubTaskMessage, setClubTaskMessage] = useState("");
  const [clubTaskError, setClubTaskError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [savedPuzzleIds, setSavedPuzzleIds] = useState<string[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedBusy, setSavedBusy] = useState(false);
  const [removingSavedPuzzleId, setRemovingSavedPuzzleId] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [showSavedPuzzles, setShowSavedPuzzles] = useState(false);
  const [positionState, setPositionState] = useState<{ puzzleId: string; fen: string } | null>(null);
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTaskId = params.get("clubTask");
    const requestedPuzzleId = params.get("puzzle");
    if (!requestedTaskId && !requestedPuzzleId) return;
    const assignedPuzzle = requestedPuzzleId
      ? tacticsPuzzles.find((candidate) => candidate.id === requestedPuzzleId)
      : null;
    if (requestedTaskId && !assignedPuzzle) {
      queueMicrotask(() => setClubTaskError("Die Vereinsaufgabe konnte nicht geladen werden. Öffne sie bitte erneut über deine Trainingsgruppe."));
      return;
    }
    if (requestedPuzzleId && !assignedPuzzle) {
      queueMicrotask(() => setClubTaskError("Die ausgewählte Taktikaufgabe konnte nicht geladen werden."));
      return;
    }
    const isDailyExercise = params.get("daily") === "1";
    const requestedDay = params.get("day");
    if (isDailyExercise && assignedPuzzle && (
      requestedDay !== progress.dailyAssignmentDate
      || progress.dailyAssignmentId !== `tactics:${assignedPuzzle.id}`
    )) {
      queueMicrotask(() => setClubTaskError("Diese Tagesaufgabe ist nicht mehr aktuell. Öffne bitte die heutige Übung im Lernpfad."));
      return;
    }
    queueMicrotask(() => {
      if (requestedTaskId) setClubTaskId(requestedTaskId);
      if (assignedPuzzle) {
        setPuzzleId(assignedPuzzle.id);
      }
      if (assignedPuzzle && isDailyExercise) {
        setDailyExercise(true);
        setDailyExerciseDate(requestedDay && /^\d{4}-\d{2}-\d{2}$/.test(requestedDay)
          ? requestedDay
          : null);
      }
    });
  }, [progress.dailyAssignmentDate, progress.dailyAssignmentId]);

  useEffect(() => {
    let active = true;
    async function loadSavedPuzzles() {
      try {
        const client = createClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        if (!active) return;
        setUserId(user?.id ?? null);
        if (!user) return;
        const { data, error: savedError } = await client.rpc("list_my_saved_tactics");
        if (savedError) throw savedError;
        if (active) setSavedPuzzleIds(((data ?? []) as SavedTacticRow[]).map((item) => item.puzzle_id));
      } catch (loadError) {
        console.error("Gespeicherte Taktikaufgaben konnten nicht geladen werden:", loadError);
        if (active) setSavedMessage("Gespeicherte Aufgaben konnten nicht geladen werden. Bitte lade die Seite neu.");
      } finally {
        if (active) setSavedLoading(false);
      }
    }
    void loadSavedPuzzles();
    return () => { active = false; };
  }, []);

  const isPlacement = progress.placementAttempts < TACTICS_PLACEMENT_TASKS;
  const targetRating = isPlacement
    ? progress.rating
    : clampTacticsRating(progress.rating + progress.difficultyOffset);
  const puzzle = puzzleId
    ? tacticsPuzzles.find((candidate) => candidate.id === puzzleId) ?? getTacticsPuzzleForRating(targetRating, progress.recent)
    : getTacticsPuzzleForRating(targetRating, progress.recent);
  const puzzleStart = new Chess(puzzle.fen);
  if (puzzle.setupMove) playUci(puzzleStart, puzzle.setupMove);
  const puzzleStartFen = puzzleStart.fen();
  const positionFen = positionState?.puzzleId === puzzle.id ? positionState.fen : puzzleStartFen;
  const chess = new Chess(positionFen);
  const playerColor = puzzleStartFen.split(" ")[1] as Color;
  const targets = !selected || outcome || chess.turn() !== playerColor
    ? []
    : chess.moves({ square: selected, verbose: true }).map((move) => move.to);

  function finish(correct: boolean, answer: string) {
    if (outcome) return;

    const isPractice = practicePuzzleId === puzzle.id;
    const alreadyCompletedDaily = dailyExercise
      && dailyExerciseDate !== null
      && progress.dailyLastCompletedDate === dailyExerciseDate;
    const isPlacementTask = !isPractice && !clubTaskId && !alreadyCompletedDaily && isPlacement;
    const isRated = !isPractice && !alreadyCompletedDaily && !isPlacement && Math.abs(puzzle.rating - progress.rating) <= 100;
    const placementAttempts = isPlacementTask
      ? Math.min(TACTICS_PLACEMENT_TASKS, progress.placementAttempts + 1)
      : progress.placementAttempts;
    const placementRating = clampTacticsRating(progress.rating + (correct ? 300 : -300));
    const ratingChange = isRated ? getTacticsRatingChange(progress.rating, puzzle.rating, correct) : 0;
    const nextDailyLevel = getDailyExerciseLevel(progress.dailyExercisesCompleted + 1);
    updateTacticsProgress((current) => ({
      ...current,
      rating: isPlacementTask
        ? clampTacticsRating(current.rating + (correct ? 300 : -300))
        : isRated ? clampTacticsRating(current.rating + ratingChange) : current.rating,
      solved: current.solved + (correct ? 1 : 0),
      attempted: current.attempted + 1,
      placementAttempts,
      recent: Array.from(new Set([...current.recent, puzzle.id])),
      dailyExercisesCompleted: dailyExerciseDate
        && current.dailyAssignmentDate === dailyExerciseDate
        && current.dailyAssignmentId === `tactics:${puzzle.id}`
        && current.dailyLastCompletedDate !== dailyExerciseDate
        ? current.dailyExercisesCompleted + 1
        : current.dailyExercisesCompleted,
      dailyLastCompletedDate: dailyExerciseDate
        && current.dailyAssignmentDate === dailyExerciseDate
        && current.dailyAssignmentId === `tactics:${puzzle.id}`
        && current.dailyLastCompletedDate !== dailyExerciseDate
        ? dailyExerciseDate
        : current.dailyLastCompletedDate,
    }));
    setPuzzleId(puzzle.id);
    setOutcome(correct ? "solved" : "missed");
    setSelected(null);
    const dailyProgressResult = ` Tagesaufgabe erledigt: Level ${nextDailyLevel.level}, ${nextDailyLevel.completedInLevel}/${nextDailyLevel.taskCount}.`;
    let ratingResult: string;
    if (alreadyCompletedDaily) {
      ratingResult = " Die heutige Tagesaufgabe wurde bereits gewertet; diese Wiederholung verändert deine Elo nicht.";
    } else if (dailyExercise) {
      ratingResult = isPlacementTask
        ? ` Einstufung ${placementAttempts}/${TACTICS_PLACEMENT_TASKS}.${dailyProgressResult}`
        : isRated
          ? ` Deine Taktik-Elo ${ratingChange >= 0 ? "+" : ""}${ratingChange}.${dailyProgressResult}`
          : ` Keine Elo-Wertung bei mehr als 100 Elo Abstand.${dailyProgressResult}`;
    } else if (isPlacementTask) {
      ratingResult = placementAttempts === TACTICS_PLACEMENT_TASKS
        ? ` Einstufung abgeschlossen: ${placementRating} Taktik-Elo.`
        : ` Einstufung ${placementAttempts}/${TACTICS_PLACEMENT_TASKS}.`;
    } else if (isPractice) {
      ratingResult = " Wiederholung ohne Elo-Wertung.";
    } else if (isRated) {
      ratingResult = ` Deine Taktik-Elo ${ratingChange >= 0 ? "+" : ""}${ratingChange}.`;
    } else {
      ratingResult = progress.placementAttempts < TACTICS_PLACEMENT_TASKS
        ? " Keine Elo-Wertung während der Einstufung."
        : " Keine Elo-Wertung bei mehr als 100 Elo Abstand.";
    }
    setMessage(correct
      ? `Richtig! ${answer}${ratingResult}`
      : `Noch nicht. Gesucht war ${answer}${ratingResult}`);
    if (clubTaskId) {
      void (async () => {
        try {
          const { error: attemptError } = await createClient().rpc("record_chess_club_training_attempt", {
            p_task_id: clubTaskId,
            p_solved: correct,
          });
          if (attemptError) throw attemptError;
          setClubTaskMessage("Dein Ergebnis wurde in der Teilnahmeübersicht gespeichert.");
        } catch (attemptError) {
          console.error("Vereinsaufgabe konnte nicht gespeichert werden:", attemptError);
          const errorCode = typeof attemptError === "object" && attemptError !== null && "code" in attemptError && typeof attemptError.code === "string"
            ? attemptError.code
            : "";
          setClubTaskMessage(/PGRST202|PGRST204|PGRST205|42P01|42883/.test(errorCode)
            ? "Die Vereinsdatenbank ist noch nicht eingerichtet. Bitte wende die Vereinsmigration in Supabase an."
            : "Dein Vereinsfortschritt konnte nicht gespeichert werden. Bitte prüfe deine Anmeldung und versuche es erneut.");
        }
      })();
    }
  }

  function selectSquare(squareName: string) {
    if (outcome || chess.turn() !== playerColor) return;

    const square = squareName as Square;
    const piece = chess.get(square);
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

    const position = new Chess(positionFen);
    const played = position.move({ from: selected, to: square, promotion: "q" });
    const expectedPosition = new Chess(positionFen);
    const expected = playUci(expectedPosition, puzzle.moves[solutionIndex]);
    if (moveToUci(played) !== puzzle.moves[solutionIndex]) {
      finish(false, `${expected.san}.`);
      return;
    }

    const opponentMove = puzzle.moves[solutionIndex + 1];
    if (opponentMove) {
      const reply = playUci(position, opponentMove);
      setMessage(`${played.san} – der Gegner antwortet mit ${reply.san}.`);
    }

    const nextIndex = solutionIndex + (opponentMove ? 2 : 1);
    setPositionState({ puzzleId: puzzle.id, fen: position.fen() });
    setSolutionIndex(nextIndex);
    setSelected(null);

    if (nextIndex >= puzzle.moves.length) {
      finish(true, `${played.san}.`);
    }
  }

  function nextPuzzle() {
    const next = chooseTacticsPuzzle(targetRating, progress.recent);
    setPuzzleId(next.id);
    setPracticePuzzleId(null);
    setPositionState(null);
    setSolutionIndex(0);
    setSelected(null);
    setOutcome(null);
    setMessage("");
  }

  function selectSavedPuzzle(id: string) {
    setPuzzleId(id);
    setPracticePuzzleId(id);
    setPositionState(null);
    setSolutionIndex(0);
    setSelected(null);
    setOutcome(null);
    setMessage("");
    setShowSavedPuzzles(false);
  }

  async function removeSavedPuzzle(id: string) {
    setRemovingSavedPuzzleId(id);
    setSavedMessage("");
    try {
      const { error: removeError } = await createClient().rpc("remove_saved_tactics_puzzle", {
        p_puzzle_id: id,
      });
      if (removeError) throw removeError;
      setSavedPuzzleIds((current) => current.filter((savedId) => savedId !== id));
      setSavedMessage(`Aufgabe ${id} aus deinen gespeicherten Taktiken entfernt.`);
    } catch (removeError) {
      console.error("Gespeicherte Taktikaufgabe konnte nicht entfernt werden:", removeError);
      setSavedMessage("Die Aufgabe konnte nicht entfernt werden. Bitte versuche es erneut.");
    } finally {
      setRemovingSavedPuzzleId(null);
    }
  }

  async function toggleSavedPuzzle() {
    if (!userId) {
      setSavedMessage("Melde dich an, um Taktikaufgaben zu speichern.");
      return;
    }
    setSavedBusy(true);
    setSavedMessage("");
    try {
      const isSaved = savedPuzzleIds.includes(puzzle.id);
      const { error: saveError } = await createClient().rpc(
        isSaved ? "remove_saved_tactics_puzzle" : "save_tactics_puzzle",
        { p_puzzle_id: puzzle.id },
      );
      if (saveError) throw saveError;
      setSavedPuzzleIds((current) => isSaved
        ? current.filter((id) => id !== puzzle.id)
        : [...current, puzzle.id]);
      setSavedMessage(isSaved ? "Aufgabe aus deinen gespeicherten Taktiken entfernt." : "Taktikaufgabe gespeichert.");
    } catch (saveError) {
      console.error("Taktikaufgabe konnte nicht gespeichert werden:", saveError);
      setSavedMessage("Die Aufgabe konnte nicht gespeichert werden. Bitte versuche es erneut.");
    } finally {
      setSavedBusy(false);
    }
  }

  const badges = [
    { label: "Erster Treffer", description: "1 Aufgabe gelöst", earned: progress.solved >= 1 },
    { label: "Taktik im Blick", description: "10 Aufgaben gelöst", earned: progress.solved >= 10 },
    { label: "Kombinationsprofi", description: "50 Aufgaben gelöst", earned: progress.solved >= 50 },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-3 text-slate-100 sm:px-8 sm:py-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Taktikaufgaben</h1>
            {clubTaskId && <p className="mt-1 text-xs text-emerald-200">Vereinsaufgabe · Ergebnis wird geteilt</p>}
            {clubTaskError && <p className="mt-1 text-xs text-amber-200" role="alert">{clubTaskError}</p>}
          </div>
        </header>

        {showSavedPuzzles && <section id="saved-tactics-list" aria-labelledby="saved-tactics-title" className="mb-3 rounded-xl border border-amber-300/20 bg-slate-900/70 p-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="saved-tactics-title" className="font-semibold text-white">Deine gespeicherten Taktikaufgaben</h2>
            </div>
            {!userId && <Link href="/login" className="text-sm text-amber-200 underline underline-offset-4">Anmelden zum Speichern</Link>}
          </div>
          {savedLoading ? <p role="status" className="text-sm text-slate-400">Gespeicherte Aufgaben werden geladen …</p> : savedPuzzleIds.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedPuzzleIds.flatMap((id) => {
                const savedPuzzle = tacticsPuzzles.find((item) => item.id === id);
                if (!savedPuzzle) return [];
                const preview = new Chess(savedPuzzle.fen);
                if (savedPuzzle.setupMove) playUci(preview, savedPuzzle.setupMove);
                return [<li key={savedPuzzle.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                  <MiniChessboard
                    fen={preview.fen()}
                    label={`Vorschau der Taktikaufgabe ${savedPuzzle.id}`}
                    orientation={preview.turn() === "w" ? "white" : "black"}
                  />
                  <p className="mt-3 text-sm font-semibold text-white">Aufgabe {savedPuzzle.id} · {savedPuzzle.rating} Elo</p>
                  <p className="mt-1 text-xs text-slate-400">{getTacticsDifficulty(savedPuzzle.rating)} · {getTacticsTheme(savedPuzzle.themes)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => selectSavedPuzzle(savedPuzzle.id)} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300">Aufgabe lösen</button>
                    <Link href={`/analyse?puzzle=${encodeURIComponent(savedPuzzle.id)}`} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800">Analysieren</Link>
                    <button
                      type="button"
                      onClick={() => void removeSavedPuzzle(savedPuzzle.id)}
                      disabled={removingSavedPuzzleId !== null}
                      aria-label={`Aufgabe ${savedPuzzle.id} aus gespeicherten Taktiken entfernen`}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
                    >
                      {removingSavedPuzzleId === savedPuzzle.id ? "Wird entfernt …" : "Entfernen"}
                    </button>
                  </div>
                </li>];
              })}
            </ul>
          ) : <p className="text-sm text-slate-400">Keine gespeicherten Aufgaben.</p>}
          {savedMessage && <p role="status" className="mt-3 text-sm text-slate-400">{savedMessage}</p>}
        </section>}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.5fr)]">
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowSavedPuzzles((current) => !current)}
                aria-expanded={showSavedPuzzles}
                aria-controls="saved-tactics-list"
                className="rounded-lg border border-amber-300/30 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-300/10"
              >
                Gespeichert ({savedPuzzleIds.length})
              </button>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-1.5">
                <span className="text-xs text-slate-400">{isPlacement ? "Einstufung" : "Taktik-Elo"}</span>
                <span className="text-sm font-semibold tabular-nums text-emerald-300">
                  {isPlacement ? `${progress.placementAttempts}/${TACTICS_PLACEMENT_TASKS}` : progress.rating}
                </span>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <p className="text-[11px] text-slate-400">
                  {chess.turn() === "w" ? "Weiß" : "Schwarz"} am Zug · {puzzle.rating} Elo · {getTacticsDifficulty(puzzle.rating)}
                </p>
              </div>
              <span className="shrink-0 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
                {getTacticsTheme(puzzle.themes)}
              </span>
            </div>
            <MiniChessboard
              fen={positionFen}
              label={`Taktikaufgabe, ${chess.turn() === "w" ? "Weiß" : "Schwarz"} am Zug`}
              onSquareClick={selectSquare}
              selected={selected}
              targets={targets}
              orientation={playerColor === "w" ? "white" : "black"}
            />
            <div
              aria-live="polite"
              className={"mt-4 min-h-12 rounded-lg px-4 py-3 text-sm " + (outcome === "solved" ? "bg-emerald-400/10 text-emerald-200" : outcome === "missed" ? "bg-amber-400/10 text-amber-100" : "bg-slate-800/70 text-slate-400")}
            >
              {message}
            </div>
            {clubTaskMessage && <p className="mt-2 text-sm text-slate-400" role="status">{clubTaskMessage}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void toggleSavedPuzzle()}
                disabled={savedBusy || savedLoading || !userId}
                className="rounded-lg border border-amber-300/40 px-4 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-300/10 disabled:opacity-50"
              >
                {savedLoading ? "Gespeicherte Aufgaben werden geladen …" : savedPuzzleIds.includes(puzzle.id) ? "Aufgabe gespeichert · Entfernen" : "Aufgabe speichern"}
              </button>
              <Link href={`/analyse?puzzle=${encodeURIComponent(puzzle.id)}`} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800">
                Stellung analysieren
              </Link>
              {!userId && !savedLoading && <Link href="/login" className="self-center text-xs text-slate-400 underline underline-offset-4">Anmelden zum Speichern</Link>}
            </div>
            {savedMessage && <p role="status" className="mt-2 text-sm text-slate-400">{savedMessage}</p>}
            {outcome && (
              clubTaskId
                ? <Link href="/verein" className="mt-3 block w-full rounded-lg bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Zur Vereinsgruppe →</Link>
                : dailyExercise
                  ? <Link href="/lernen" className="mt-3 block w-full rounded-lg bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Zurück zum Lernpfad →</Link>
                : <button
                    type="button"
                    onClick={nextPuzzle}
                    className="mt-3 w-full rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                  >
                    Nächste Aufgabe →
                  </button>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="font-semibold">Dein Fortschritt</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-800/70 p-4">
                  <p className="text-xs text-slate-400">Gelöst</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{progress.solved}</p>
                </div>
                <div className="rounded-xl bg-slate-800/70 p-4">
                  <p className="text-xs text-slate-400">Versucht</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{progress.attempted}</p>
                </div>
              </div>
            </section>

            {!isPlacement && <section className="rounded-2xl border border-amber-300/30 bg-black p-5">
              <label htmlFor="tactics-difficulty" className="font-semibold">Aufgabenniveau</label>
              <SelectMenu
                aria-label="Aufgabenniveau"
                value={String(progress.difficultyOffset)}
                onChange={(value) => {
                  const difficultyOffset = Number(value);
                  if (!isTacticsDifficultyOffset(difficultyOffset)) return;
                  updateTacticsProgress((current) => ({
                    ...current,
                    difficultyOffset,
                  }));
                }}
                options={[
                  { value: "-300", label: "300 Elo leichter" },
                  { value: "-200", label: "200 Elo leichter" },
                  { value: "-100", label: "100 Elo leichter" },
                  { value: "0", label: "Gleiches Niveau" },
                  { value: "100", label: "100 Elo schwerer" },
                  { value: "200", label: "200 Elo schwerer" },
                  { value: "300", label: "300 Elo schwerer" },
                ]}
                className="mt-3"
              />
            </section>}

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="font-semibold">Abzeichen</h2>
              <div className="mt-3 space-y-2">
              {badges.map((badge) => (
                <div key={badge.label} className={`rounded-lg border px-3 py-2 ${badge.earned ? "border-amber-300/30 bg-amber-300/10" : "border-slate-800 bg-slate-950/50 opacity-60"}`}>
                  <p className="text-sm font-semibold">{badge.earned ? "🏅 " : "◯ "}{badge.label}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{badge.description}</p>
                </div>
              ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
