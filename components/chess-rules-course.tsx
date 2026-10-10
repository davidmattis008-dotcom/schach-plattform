"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import rulesData from "@/lib/chess-rules.json";

type DemoMove = { move: string; explanation: string };
type RuleLesson = {
  id: string;
  title: string;
  description: string;
  fen: string;
  focusSquare?: Square;
  demo: DemoMove[];
  facts: string[];
};

const lessons = rulesData as RuleLesson[];
const lessonOrder = [
  "board-and-turns", "knight", "bishop", "rook", "queen", "king", "pawn", "check",
  "castling", "en-passant", "promotion", "checkmate", "stalemate", "draws", "over-the-board",
];
const orderedLessons = lessonOrder.map((id) => lessons.find((lesson) => lesson.id === id)).filter((lesson): lesson is RuleLesson => Boolean(lesson));
const storageKey = "schach-regeln-lernen-v1";

function parseUci(move: string) {
  const match = move.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) throw new Error(`Ungültiger Beispielzug: ${move}`);
  return {
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] as "q" | "r" | "b" | "n" } : {}),
  };
}

function moveMessage(game: Chess, move: ReturnType<Chess["move"]>) {
  const result = `${move.color === "w" ? "Weiß" : "Schwarz"} spielt ${move.san}.`;
  if (game.isCheckmate()) return `${result} Schachmatt – die Partie ist beendet.`;
  if (game.isStalemate()) return `${result} Patt – die Partie endet remis.`;
  if (game.isCheck()) return `${result} Schach! Die andere Seite muss den Angriff abwehren.`;
  if (move.captured) return `${result} Eine gegnerische Figur wurde geschlagen.`;
  if (move.flags.includes("k") || move.flags.includes("q")) return `${result} König und Turm haben gemeinsam rochiert.`;
  if (move.flags.includes("e")) return `${result} En passant: Der Bauer wurde vom Nachbarfeld entfernt.`;
  if (move.promotion) return `${result} Der Bauer wurde in ${({ q: "eine Dame", r: "einen Turm", b: "einen Läufer", n: "einen Springer" } as Record<string, string>)[move.promotion]} umgewandelt.`;
  return result;
}

function pieceName(type: string | undefined) {
  return ({ p: "Bauer", n: "Springer", b: "Läufer", r: "Turm", q: "Dame", k: "König" } as Record<string, string>)[type ?? ""] ?? "Figur";
}

function RuleLessonWorkspace({
  lesson,
  lessonNumber,
  completed,
  onComplete,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}: {
  lesson: RuleLesson;
  lessonNumber: number;
  completed: boolean;
  onComplete: () => void;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}) {
  const [fen, setFen] = useState(lesson.fen);
  const [demoStep, setDemoStep] = useState(0);
  const [selected, setSelected] = useState<Square | null>(lesson.focusSquare ?? null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [exploring, setExploring] = useState(false);
  const [message, setMessage] = useState("");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const game = useMemo(() => new Chess(fen), [fen]);
  const legalTargets = selected
    ? game.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];
  const inCheck = game.isCheck();
  const isFinished = game.isCheckmate() || game.isStalemate();

  function showDemo(step: number) {
    const position = new Chess(lesson.fen);
    const history: string[] = [];
    for (const item of lesson.demo.slice(0, step)) {
      history.push(position.move(parseUci(item.move)).san);
    }
    setFen(position.fen());
    setMoveHistory(history);
    setDemoStep(step);
    setSelected(step === 0 ? lesson.focusSquare ?? null : parseUci(lesson.demo[step - 1].move).to);
    setPromotion(null);
    setExploring(false);
    setMessage(step === 0 ? "" : lesson.demo[step - 1].explanation);
  }

  function applyMove(from: Square, to: Square, promoteTo?: "q" | "r" | "b" | "n") {
    const next = new Chess(fen);
    try {
      const played = next.move({ from, to, ...(promoteTo ? { promotion: promoteTo } : {}) });
      setFen(next.fen());
      setMoveHistory((current) => [...current, played.san]);
      setSelected(null);
      setPromotion(null);
      setExploring(true);
      setMessage(moveMessage(next, played));
      onComplete();
    } catch (error) {
      console.error("Der Zug auf dem Regelbrett konnte nicht ausgeführt werden:", error);
      setMessage("Dieser Zug ist nicht legal. Wähle ein markiertes Zielfeld.");
    }
  }

  function selectSquare(squareName: string) {
    if (isFinished || promotion) return;
    const square = squareName as Square;
    const piece = game.get(square);
    if (!selected) {
      if (piece?.color === game.turn()) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    if (piece?.color === game.turn()) {
      setSelected(square);
      return;
    }
    if (!legalTargets.includes(square)) {
      setSelected(null);
      return;
    }

    const movingPiece = game.get(selected);
    const reachesLastRank = movingPiece?.type === "p" &&
      ((movingPiece.color === "w" && square[1] === "8") || (movingPiece.color === "b" && square[1] === "1"));
    if (reachesLastRank) {
      setPromotion({ from: selected, to: square });
      return;
    }
    applyMove(selected, square);
  }

  const status = game.isCheckmate()
    ? "Schachmatt – Partie beendet"
    : game.isStalemate()
      ? "Patt – remis"
      : `${game.turn() === "w" ? "Weiß" : "Schwarz"} ist am Zug${inCheck ? " und steht im Schach" : ""}`;

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Regel {lessonNumber} von {orderedLessons.length}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{lesson.title}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${completed ? "border-emerald-300/30 text-emerald-200" : "border-slate-700 text-slate-400"}`}>
          {completed ? "Verstanden" : "Noch offen"}
        </span>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-300">{lesson.description}</p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,34rem)_minmax(15rem,1fr)]">
        <div>
          <MiniChessboard
            fen={fen}
            label={`${lesson.title}: ${status}`}
            onSquareClick={selectSquare}
            selected={selected}
            targets={legalTargets}
            orientation={new Chess(lesson.fen).turn() === "w" ? "white" : "black"}
          />
          <p role="status" aria-live="polite" className={`mt-3 rounded-lg border px-3 py-2 text-center text-sm font-semibold ${inCheck ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-amber-300/20 bg-amber-300/5 text-amber-100"}`}>
            {status}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            {selected
              ? `${pieceName(game.get(selected)?.type)} auf ${selected.toUpperCase()}: ${legalTargets.length} legale Zielfelder markiert.`
              : "Wähle eine Figur; ihre legalen Zielfelder werden auf dem Brett markiert."}
          </p>
          {promotion && <div className="mt-3 rounded-lg border border-amber-300/20 bg-slate-950/60 p-3">
            <p className="mb-2 text-sm text-slate-200">Wähle die Umwandlungsfigur:</p>
            <div className="grid grid-cols-4 gap-2">
              {(["q", "r", "b", "n"] as const).map((piece) => <button key={piece} type="button" onClick={() => applyMove(promotion.from, promotion.to, piece)} className="rounded-lg border border-slate-700 px-2 py-2 text-sm text-white hover:border-amber-300/50">
                {{ q: "Dame", r: "Turm", b: "Läufer", n: "Springer" }[piece]}
              </button>)}
            </div>
          </div>}
          <p className="mt-2 text-center text-xs text-slate-500">Wähle eine Figur und dann ein markiertes Zielfeld. Du kannst die Stellung frei ausprobieren.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => showDemo(0)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Stellung zurücksetzen</button>
          </div>
          {message && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-300">{message}</p>}
          {moveHistory.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">Zugfolge: {moveHistory.map((move, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}${move}`).join(" ")}</p>}
        </div>

        <div>
          <h3 className="font-semibold text-white">Erklärung Schritt für Schritt</h3>
          {demoStep > 0 && lesson.demo[demoStep - 1] && <section className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
            <h3 className="text-sm font-semibold text-amber-100">Schritt {demoStep} von {lesson.demo.length}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-200">{lesson.demo[demoStep - 1].explanation}</p>
          </section>}
          {demoStep === 0 && <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">{lesson.description} {lesson.demo.length ? "Nutze die Schaltflächen, um die Beispielzüge nacheinander zu erklären, oder probiere die markierten Züge selbst aus." : "Untersuche die Stellung direkt am Brett. Das Brett lässt nur legale Züge zu."}</p>}
          {lesson.demo.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => showDemo(Math.max(0, demoStep - 1))} disabled={demoStep === 0 || exploring} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">← Zurück</button>
            <button type="button" onClick={() => showDemo(Math.min(lesson.demo.length, demoStep + 1))} disabled={demoStep >= lesson.demo.length || exploring} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{demoStep === 0 ? "Ersten Zug erklären →" : "Nächsten Zug erklären →"}</button>
          </div>}
          {exploring && lesson.demo.length > 0 && <p className="mt-2 text-xs text-slate-500">Für die geführte Zugfolge setze die Stellung zurück.</p>}
          <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="font-semibold text-white">Wichtige Regeln</h3>
            <ul className="mt-3 space-y-3">
              {lesson.facts.map((fact) => <li key={fact} className="flex gap-2 text-sm leading-6 text-slate-300"><span aria-hidden="true" className="mt-0.5 text-amber-200">•</span><span>{fact}</span></li>)}
            </ul>
          </section>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={onComplete} disabled={completed} className="rounded-lg border border-emerald-300/30 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50">
              {completed ? "Regel verstanden ✓" : "Als verstanden markieren"}
            </button>
          </div>
          <nav aria-label="Im Regelkurs navigieren" className="mt-4 flex justify-between gap-2 border-t border-slate-800 pt-4">
            <button type="button" onClick={onPrevious} disabled={!canGoPrevious} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-40">← Vorherige Regel</button>
            <button type="button" onClick={onNext} disabled={!canGoNext} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">Nächste Regel →</button>
          </nav>
        </div>
      </div>
    </article>
  );
}

export function ChessRulesCourse() {
  const [lessonId, setLessonId] = useState(orderedLessons[0].id);
  const [search, setSearch] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const currentLessonIndex = orderedLessons.findIndex((lesson) => lesson.id === lessonId);
  const currentLesson = orderedLessons[currentLessonIndex] ?? orderedLessons[0];
  const filteredLessons = orderedLessons.filter((lesson) => (
    `${lesson.title} ${lesson.description} ${lesson.facts.join(" ")}`.toLocaleLowerCase("de").includes(search.trim().toLocaleLowerCase("de"))
  ));

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(saved)) {
          setCompleted(Array.from(new Set(saved.filter((id): id is string => (
            typeof id === "string" && lessons.some((lesson) => lesson.id === id)
          )))));
        }
      } catch (error) {
        console.error("Der Fortschritt im Schachregelkurs konnte nicht gelesen werden:", error);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(completed));
    } catch (error) {
      console.error("Der Fortschritt im Schachregelkurs konnte nicht gespeichert werden:", error);
    }
  }, [completed, ready]);

  function markCompleted(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
  }

  const progress = Math.round((completed.length / lessons.length) * 100);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/lernen" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Selbstständiges Lernen</Link>
        <header className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Selbstständiges Lernen · interaktiver Kurs</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Schachregeln lernen</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Lerne die Figuren nacheinander kennen: Sieh ihre legalen Zugmöglichkeiten direkt auf dem Brett und lies die Erklärung daneben. Danach folgen Sonderzüge und wichtige Spielregeln.</p>
        </header>

        <section aria-label="Regel suchen und auswählen" className="relative mt-6">
          <label htmlFor="rule-search" className="sr-only">Schachregel suchen</label>
          <input
            id="rule-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Regel oder Figur suchen, z. B. Springer, Rochade oder Schach …"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
          />
          {search.trim() && <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl" aria-label="Gefundene Regeln">
            {filteredLessons.length ? filteredLessons.map((lesson) => (
              <button key={lesson.id} type="button" onClick={() => { setLessonId(lesson.id); setSearch(""); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{lesson.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">{lesson.description}</span>
                </span>
                <span className="shrink-0 text-xs text-amber-200">{completed.includes(lesson.id) ? "Verstanden" : "Lernen"}</span>
              </button>
            )) : <p className="px-3 py-4 text-sm text-slate-400">Keine passende Regel gefunden.</p>}
          </div>}
          <p className="mt-2 text-xs text-slate-500">Themenfolge: Brett · Springer · Läufer · Turm · Dame · König · Bauer · weitere Regeln</p>
        </section>

        <section aria-label="Regelkurs-Fortschritt" className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300"><strong className="text-white">{completed.length} von {lessons.length}</strong> Regeln als verstanden markiert</p>
            <span className="text-sm font-semibold tabular-nums text-amber-200">{progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Fortschritt im Schachregelkurs" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </section>

        {ready ? <div className="mt-5">
          <RuleLessonWorkspace
            key={currentLesson.id}
            lesson={currentLesson}
            lessonNumber={currentLessonIndex + 1}
            completed={completed.includes(currentLesson.id)}
            onComplete={() => markCompleted(currentLesson.id)}
            onPrevious={() => setLessonId(orderedLessons[Math.max(0, currentLessonIndex - 1)].id)}
            onNext={() => setLessonId(orderedLessons[Math.min(orderedLessons.length - 1, currentLessonIndex + 1)].id)}
            canGoPrevious={currentLessonIndex > 0}
            canGoNext={currentLessonIndex < orderedLessons.length - 1}
          />
        </div> : <p role="status" className="mt-5 text-sm text-slate-400">Dein Lernfortschritt wird geladen …</p>}

        <aside className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-5 text-slate-400">
          Die Beispiele vermitteln die allgemeinen Schachregeln. Bei Turnierpartien gelten zusätzlich die Ausschreibung und die jeweils maßgeblichen FIDE-Regeln; Zeitstrafen und Abläufe können je nach Spielart abweichen. Der Fortschritt wird nur in diesem Browser gespeichert.
        </aside>
      </div>
    </main>
  );
}
