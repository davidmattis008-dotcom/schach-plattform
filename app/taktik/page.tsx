"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Chess, type Color, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { chooseTacticsPuzzle, getTacticsDifficulty, getTacticsPuzzleForRating, getTacticsRatingChange, getTacticsTheme, tacticsPuzzles } from "@/lib/tactics";
import { getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress, updateTacticsProgress } from "@/lib/tactics-progress";
import { createClient } from "@/lib/supabase/client";

type Outcome = "solved" | "missed" | null;

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
  const [clubTaskId, setClubTaskId] = useState<string | null>(null);
  const [clubTaskMessage, setClubTaskMessage] = useState("");
  const [clubTaskError, setClubTaskError] = useState("");
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
    if (!requestedTaskId || !assignedPuzzle) {
      setClubTaskError("Die Vereinsaufgabe konnte nicht geladen werden. Öffne sie bitte erneut über deine Trainingsgruppe.");
      return;
    }
    setClubTaskId(requestedTaskId);
    setPuzzleId(assignedPuzzle.id);
  }, []);

  const puzzle = puzzleId
    ? tacticsPuzzles.find((candidate) => candidate.id === puzzleId) ?? getTacticsPuzzleForRating(progress.rating, progress.recent)
    : getTacticsPuzzleForRating(progress.rating, progress.recent);
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

    const ratingChange = getTacticsRatingChange(progress.rating, puzzle.rating, correct);
    updateTacticsProgress((current) => ({
      ...current,
      rating: Math.max(400, Math.min(2400, current.rating + ratingChange)),
      solved: current.solved + (correct ? 1 : 0),
      attempted: current.attempted + 1,
      recent: Array.from(new Set([...current.recent, puzzle.id])),
    }));
    setPuzzleId(puzzle.id);
    setOutcome(correct ? "solved" : "missed");
    setSelected(null);
    setMessage(correct
      ? `Richtig! ${answer} Deine Taktik-Elo ${ratingChange >= 0 ? "+" : ""}${ratingChange}.`
      : `Noch nicht. Gesucht war ${answer} Deine Taktik-Elo ${ratingChange >= 0 ? "+" : ""}${ratingChange}.`);
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
    const next = chooseTacticsPuzzle(progress.rating, progress.recent);
    setDailyChallenge(false);
    setPuzzleId(next.id);
    setPositionState(null);
    setSolutionIndex(0);
    setSelected(null);
    setOutcome(null);
    setMessage("");
  }

  const badges = [
    { label: "Erster Treffer", description: "1 Aufgabe gelöst", earned: progress.solved >= 1 },
    { label: "Taktik im Blick", description: "10 Aufgaben gelöst", earned: progress.solved >= 10 },
    { label: "Kombinationsprofi", description: "50 Aufgaben gelöst", earned: progress.solved >= 50 },
  ];

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Training</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Taktikaufgaben</h1>
            <p className="mt-2 text-sm text-slate-400">Echte Partiestellungen, passend zu deiner Taktik-Elo.</p>
            <p className="mt-1 text-xs text-slate-500">{tacticsPuzzles.length} unterschiedliche Aufgaben · Schwierigkeit von ca. {Math.min(...tacticsPuzzles.map((item) => item.rating))} bis {Math.max(...tacticsPuzzles.map((item) => item.rating))} Elo</p>
            {clubTaskId && <p className="mt-2 text-sm text-emerald-200">Vereinsaufgabe · Dein Ergebnis wird mit deiner Trainingsgruppe geteilt.</p>}
            {clubTaskError && <p className="mt-2 text-sm text-amber-200" role="alert">{clubTaskError}</p>}
          </div>
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Deine Taktik-Elo</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-300">{progress.rating}</p>
          </div>
        </header>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <p className="text-sm font-semibold text-white">Finde die beste Fortsetzung.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Am Zug: {chess.turn() === "w" ? "Weiß" : "Schwarz"} · {puzzle.rating} Aufgaben-Elo · {getTacticsDifficulty(puzzle.rating)}
                </p>
              </div>
              <span className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300">
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
              {message || "Wähle eine Figur und danach das Zielfeld."}
            </div>
            {clubTaskMessage && <p className="mt-2 text-sm text-slate-400" role="status">{clubTaskMessage}</p>}
            {outcome && (
              clubTaskId
                ? <Link href="/verein" className="mt-3 block w-full rounded-lg bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Zur Vereinsgruppe →</Link>
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
              <p className="mt-4 text-xs leading-5 text-slate-400">
                Die Aufgabenwahl richtet sich nach deiner Taktik-Elo. Sie passt sich daran an, welche Aufgaben du löst.
                Deine Online-Elo bleibt davon getrennt; der Fortschritt wird in diesem Browser gespeichert.
              </p>
            </section>

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
              <p className="mt-3 text-xs text-slate-500">Fortschritt und Abzeichen werden in diesem Browser gespeichert.</p>
            </section>

            <section className="rounded-2xl border border-slate-800 p-5">
              <h2 className="font-semibold">Legale Züge und klare Hinweise</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Die Aufgaben verwenden realistische Stellungen. Du kannst nur mit der am Zug befindlichen Farbe ziehen;
                die besten Antworten der Gegenseite werden automatisch ausgespielt.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
