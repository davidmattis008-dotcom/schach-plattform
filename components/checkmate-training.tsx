"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import trainingData from "@/lib/checkmate-training.json";
import { orderQuizAnswers } from "@/lib/quiz-answer-order";

type CheckmateLesson = {
  id: string;
  title: string;
  shortTitle: string;
  material: string;
  fen: string;
  solution: string;
  principle: string;
  plan: string;
  forceable: boolean;
  quiz: {
    question: string;
    answers: string[];
    correctAnswer: number;
    explanation: string;
  };
};
type ExplainedMove = {
  fen: string;
  san: string;
  color: "w" | "b";
  from: Square;
  to: Square;
  piece: string;
  check: boolean;
  checkmate: boolean;
  escapeMoves: number;
};
type Phase = "try" | "explain" | "quiz";

const lessons = trainingData as CheckmateLesson[];
const storageKey = "schach-mattsetzen-kurs-v1";
const pieceNames: Record<string, string> = { k: "König", q: "Dame", r: "Turm", b: "Läufer", n: "Springer", p: "Bauer" };

function parseUci(uci: string) {
  const match = uci.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) throw new Error(`Ungültiger Mattzug: ${uci}`);
  return {
    from: match[1] as Square,
    to: match[2] as Square,
    ...(match[3] ? { promotion: match[3] as "q" | "r" | "b" | "n" } : {}),
  };
}

function buildLine(lesson: CheckmateLesson): ExplainedMove[] {
  const game = new Chess(lesson.fen);
  return lesson.solution.trim().split(/\s+/).filter(Boolean).map((uci) => {
    const move = game.move(parseUci(uci));
    return {
      fen: game.fen(),
      san: move.san,
      color: move.color,
      from: move.from,
      to: move.to,
      piece: move.piece,
      check: game.isCheck(),
      checkmate: game.isCheckmate(),
      escapeMoves: game.moves().length,
    };
  });
}

function explanationFor(move: ExplainedMove, lesson: CheckmateLesson, moveNumber: number) {
  const side = move.color === "w" ? "Weiß" : "Schwarz";
  const respondingSide = move.color === "w" ? "Schwarz" : "Weiß";
  const piece = pieceNames[move.piece] ?? "Figur";
  if (lesson.id === "scholars-mate") {
    const explanations: Record<string, string> = {
      e4: "Weiß zieht den Königsbauern zwei Felder vor. Das besetzt das Zentrum und öffnet die Diagonalen für den Läufer auf f1 und die Dame.",
      e5: "Schwarz antwortet ebenfalls im Zentrum. Der Zug öffnet den Läufer auf f8 und lässt den Bauern auf f7 als möglichen Angriffspunkt zurück.",
      Bc4: "Der Läufer entwickelt sich nach c4 und zielt diagonal auf f7. Dort steht zunächst nur der schwarze König als Verteidiger.",
      Nc6: "Schwarz entwickelt den Springer und verteidigt den Bauern e5, lässt aber f7 weiterhin ungeschützt.",
      Qh5: "Die Dame kommt nach h5 und greift f7 zusammen mit dem Läufer an. Damit droht unmittelbar Dxf7 matt.",
      Nf6: "Schwarz greift die Dame an, übersieht aber die Mattdrohung auf f7. Dieser Fehler ermöglicht das Schäfermatt; gegen beste Verteidigung wäre es nicht erzwingbar.",
      "Qxf7#": "Die Dame schlägt auf f7 und setzt matt. Der Läufer auf c4 schützt sie, während der schwarze König keine legale Antwort hat.",
    };
    return explanations[move.san] ?? `${side} spielt ${move.san}.`;
  }
  if (move.checkmate) return `${side} zieht ${piece} ${move.san} und setzt matt: Der König steht im Schach und hat keinen legalen Zug.`;
  if (move.check) return `${side} zieht ${piece} ${move.san} mit Schach. Die Gegenseite muss den Angriff abwehren und kann ihren Plan nicht frei fortsetzen. Danach hat ${respondingSide} ${move.escapeMoves} legale Antwort${move.escapeMoves === 1 ? "" : "en"}.`;
  if (move.color === "b") return `Schwarz weicht mit dem König ${move.san} aus. In dieser Beispielvariante ist das die beste Verteidigung; Weiß muss den König weiter einschränken.`;
  if (move.piece === "k") return `Der weiße König zieht ${move.san} näher heran. Er unterstützt die Mattführung, kontrolliert Fluchtfelder und hilft, den gegnerischen König weiter zum Rand zu drängen.`;
  if (move.piece === "n" && lesson.id === "bishop-knight") return `Der Springer zieht ${move.san}. Springer und Läufer kontrollieren unterschiedliche Feldfarben; gemeinsam mit dem König treiben sie den gegnerischen König in die Läuferecke.`;
  if (move.piece === "b" && lesson.id === "two-bishops") return `Der Läufer zieht ${move.san}. Die beiden Läufer koordinieren ihre Diagonalen und sperren so weitere Fluchtfelder ab.`;
  if (move.piece === "b" && lesson.id === "bishop-knight") return `Der Läufer zieht ${move.san} und kontrolliert seine Diagonale. Ziel ist, den König zusammen mit Springer und eigenem König in die richtige Ecke zu treiben.`;
  if (move.piece === "r" && lesson.id === "two-rooks") return `Der Turm zieht ${move.san}. Die Türme bilden eine bewegliche Sperre; sie nehmen dem König Reihe für Reihe Platz und zwingen ihn zum Rand.`;
  if (move.piece === "r") return `Der Turm zieht ${move.san}. Er schneidet dem König eine Reihe oder Linie ab; der eigene König rückt nach, ohne die Sperre aufzugeben.`;
  if (move.piece === "q") return `Die Dame zieht ${move.san}. Sie verkleinert den Bewegungsraum des Königs und hält zugleich Schachmöglichkeiten bereit. Achte darauf, kein Patt zu erzeugen.`;
  if (move.piece === "b") return `Der Läufer zieht ${move.san} und deckt eine Diagonale. So werden Fluchtfelder kontrolliert, während der König die Stellung unterstützt.`;
  if (move.piece === "n") return `Der Springer zieht ${move.san} und kontrolliert Felder, die andere Figuren nicht erreichen. So werden weitere Fluchtwege geschlossen.`;
  return `Zug ${moveNumber}: ${side} spielt ${move.san}. Die Mattstellung verändert sich; nach diesem Zug hat Schwarz ${move.escapeMoves} legale Antwort${move.escapeMoves === 1 ? "" : "en"}.`;
}

function CheckmateWorkspace({
  lesson,
  learned,
  onComplete,
}: {
  lesson: CheckmateLesson;
  learned: boolean;
  onComplete: () => void;
}) {
  const line = useMemo(() => buildLine(lesson), [lesson]);
  const quiz = useMemo(
    () => orderQuizAnswers(lesson.id, lesson.quiz.answers, lesson.quiz.correctAnswer),
    [lesson],
  );
  const [phase, setPhase] = useState<Phase>("try");
  const [attemptFen, setAttemptFen] = useState(lesson.fen);
  const [attemptMoves, setAttemptMoves] = useState<string[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [guideStep, setGuideStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState("");
  const challenge = useMemo(() => new Chess(attemptFen), [attemptFen]);
  const guidePosition = guideStep === 0 ? lesson.fen : line[guideStep - 1]?.fen ?? lesson.fen;
  const shownFen = phase === "try" ? attemptFen : guidePosition;
  const shownGame = useMemo(() => new Chess(shownFen), [shownFen]);
  const isChallengeOver = challenge.isGameOver();
  const legalTargets = phase === "try" && selected
    ? challenge.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];
  const currentMove = guideStep > 0 ? line[guideStep - 1] : null;
  const boardStatus = shownGame.isCheckmate()
    ? "Schachmatt"
    : shownGame.isStalemate()
      ? "Patt – remis"
      : `${shownGame.turn() === "w" ? "Weiß" : "Schwarz"} ist am Zug${shownGame.isCheck() ? " und steht im Schach" : ""}`;

  function resetAttempt() {
    setAttemptFen(lesson.fen);
    setAttemptMoves([]);
    setSelected(null);
    setMessage("");
  }

  function chooseSquare(squareName: string) {
    if (phase !== "try" || isChallengeOver) return;
    const square = squareName as Square;
    const piece = challenge.get(square);
    if (!selected) {
      if (piece?.color === challenge.turn()) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    if (piece?.color === challenge.turn()) {
      setSelected(square);
      return;
    }
    if (!legalTargets.includes(square)) {
      setSelected(null);
      return;
    }

    const next = new Chess(attemptFen);
    try {
      const moving = next.get(selected);
      if (moving?.type === "p" && (square[1] === "1" || square[1] === "8")) {
        setMessage("Wähle für die Umwandlung bitte zuerst die Schritt-für-Schritt-Lösung.");
        setSelected(null);
        return;
      }
      const move = next.move({ from: selected, to: square });
      setAttemptFen(next.fen());
      setAttemptMoves((moves) => [...moves, move.san]);
      setSelected(null);
      setMessage(next.isCheckmate()
        ? "Matt gefunden! Gehe jetzt Zug für Zug durch die Erklärung und prüfe dein Verständnis."
        : next.isStalemate()
          ? "Das ist Patt, kein Matt. Setze die Stellung zurück oder schau dir die Mattmethode an."
          : move.san + (next.isCheck() ? " – Schach! Schwarz muss reagieren." : " – legaler Zug. Suche weiter nach dem Mattweg."));
    } catch (error) {
      console.error("Der Zug in der Mattübung konnte nicht ausgeführt werden:", error);
      setMessage("Der Zug war nicht legal. Wähle ein markiertes Zielfeld.");
    }
  }

  function checkAnswer() {
    if (answer === null) return;
    setChecked(true);
    if (answer === quiz.correctAnswer) {
      onComplete();
      setMessage(`Richtig! ${lesson.quiz.explanation}`);
    } else {
      setMessage("Noch nicht ganz. Lies die Erklärung noch einmal und versuche es erneut.");
    }
  }

  function startExplanation() {
    setGuideStep(0);
    setPhase("explain");
    setMessage("");
  }

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">{lesson.material} · {lesson.forceable ? `${line.length} Halbzüge bis zum Matt` : "Wichtige Materialgrenze"}</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{lesson.title}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${learned ? "border-emerald-300/30 text-emerald-200" : "border-slate-700 text-slate-400"}`}>
          {learned ? "Gelernt · Wiederholen" : "Lernen"}
        </span>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-300">{lesson.principle}</p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,34rem)_minmax(15rem,1fr)]">
        <div>
          <MiniChessboard
            fen={shownFen}
            label={`${lesson.title}: ${boardStatus}`}
            onSquareClick={phase === "try" ? chooseSquare : undefined}
            selected={phase === "try" ? selected : null}
            targets={legalTargets}
          />
          <p role="status" aria-live="polite" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-center text-sm font-semibold text-amber-100">{boardStatus}</p>
          <p className="mt-2 text-center text-xs text-slate-500">
            {phase === "try"
              ? `${attemptMoves.length} eigene Halbzüge ausprobiert · wähle auf Wunsch beide Farben`
              : phase === "explain" && lesson.forceable
                ? `Lösungszug ${guideStep} von ${line.length} Halbzügen · kein Zug wird übersprungen`
                : phase === "quiz" ? "Die Stellung bleibt sichtbar, während du dein Verständnis prüfst." : "Studiere den Plan und teste danach dein Verständnis."}
          </p>
          {phase === "try" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={resetAttempt} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Stellung zurücksetzen</button>
              <button type="button" onClick={startExplanation} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">Lösung Schritt für Schritt →</button>
            </div>
          ) : phase === "explain" && lesson.forceable ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setGuideStep((step) => Math.max(0, step - 1))} disabled={guideStep === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-40">← Vorheriger Zug</button>
              {guideStep < line.length
                ? <button type="button" onClick={() => setGuideStep((step) => Math.min(line.length, step + 1))} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Nächster Zug →</button>
                : <button type="button" onClick={() => { setPhase("quiz"); setAnswer(null); setChecked(false); setMessage(""); }} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Zum Verständnis-Test →</button>}
            </div>
          ) : phase === "explain" ? (
            <button type="button" onClick={() => { setPhase("quiz"); setAnswer(null); setChecked(false); setMessage(""); }} className="mt-3 rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950">Zum Verständnis-Test →</button>
          ) : (
            <button type="button" onClick={startExplanation} className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">Erklärung wiederholen</button>
          )}
          {attemptMoves.length > 0 && phase === "try" && <p className="mt-3 text-xs leading-5 text-slate-500">Deine Versuche: {attemptMoves.join(" ")}</p>}
        </div>

        <div>
          {phase === "try" && <>
            <h3 className="font-semibold text-white">Erst selbst probieren</h3>
            <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">
              {lesson.forceable
                ? `Finde selbst heraus, wie ${lesson.material.toLocaleLowerCase("de")} zusammenarbeiten. Spiele beliebige legale Züge am Brett; du kannst beide Seiten bewegen. Wenn du bereit bist, zeigt die Erklärung danach jeden Zug der vollständigen Mattvariante.`
                : "Versuche, eine erzwungene Mattfolge zu finden. Prüfe dabei genau, ob die angreifende Seite tatsächlich gegen jede Verteidigung gewinnen kann."}
            </p>
            {message && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-300">{message}</p>}
          </>}

          {phase === "explain" && <>
            <h3 className="font-semibold text-white">Erklärung Schritt für Schritt</h3>
            <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">{lesson.plan}</p>
            {lesson.forceable ? currentMove ? (
              <section aria-live="polite" className={`mt-3 rounded-xl border p-4 ${currentMove.checkmate ? "border-emerald-300/30 bg-emerald-300/10" : "border-amber-300/20 bg-amber-300/5"}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">Zug {guideStep} von {line.length} · {currentMove.color === "w" ? "Weiß" : "Schwarz"}</p>
                <h4 className="mt-2 text-lg font-semibold text-white">{currentMove.san} <span className="text-sm font-normal text-slate-400">({currentMove.from} → {currentMove.to})</span></h4>
                <p className="mt-2 text-sm leading-6 text-slate-200">{explanationFor(currentMove, lesson, guideStep)}</p>
                <p className="mt-2 text-xs text-slate-400">Danach ist {currentMove.color === "w" ? "Schwarz" : "Weiß"} am Zug und hat {currentMove.escapeMoves} legale Antwort{currentMove.escapeMoves === 1 ? "" : "en"}.</p>
              </section>
            ) : <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-300">Lies den Plan und gehe mit „Nächster Zug“ die komplette Beispielvariante durch.</p> : (
              <section className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">{lesson.plan}</section>
            )}
            {lesson.forceable && <details className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-300">Alle {line.length} Halbzüge anzeigen</summary>
              <ol className="mt-3 grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
                {line.map((move, index) => <li key={`${index}-${move.san}`} className={index === guideStep - 1 ? "text-amber-200" : undefined}>
                  {Math.floor(index / 2) + 1}{index % 2 === 0 ? "." : "…"} {move.color === "w" ? "Weiß" : "Schwarz"} {move.san}
                </li>)}
              </ol>
            </details>}
          </>}

          {phase === "quiz" && <>
            <h3 className="font-semibold text-white">Verständnis-Test</h3>
            <p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm leading-6 text-slate-200">{lesson.quiz.question}</p>
            <div className="mt-3 space-y-2">
              {quiz.answers.map((option, index) => (
                <button key={option} type="button" aria-pressed={answer === index} onClick={() => { setAnswer(index); setChecked(false); setMessage(""); }} className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${checked && index === quiz.correctAnswer ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : answer === index ? "border-amber-300/40 bg-amber-300/5 text-white" : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600"}`}>
                  <span className="mr-2 text-xs text-slate-500">{String.fromCharCode(65 + index)}.</span>{option}
                </button>
              ))}
            </div>
            <button type="button" disabled={answer === null} onClick={checkAnswer} className="mt-4 rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40">Antwort prüfen</button>
            {message && <p role="status" aria-live="polite" className={`mt-3 text-sm leading-6 ${answer === quiz.correctAnswer ? "text-emerald-200" : "text-rose-200"}`}>{message}</p>}
            {learned && checked && answer === quiz.correctAnswer && <p className="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-100">Methode gelernt – du kannst sie jederzeit wiederholen.</p>}
          </>}
        </div>
      </div>
    </article>
  );
}

export function CheckmateTraining() {
  const [lessonId, setLessonId] = useState(lessons[0].id);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const lesson = lessons.find((item) => item.id === lessonId) ?? lessons[0];
  const completedCount = completed.length;

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (Array.isArray(stored)) {
          setCompleted(Array.from(new Set(stored.filter((id): id is string => (
            typeof id === "string" && lessons.some((item) => item.id === id)
          )))));
        }
      } catch (error) {
        console.error("Der Mattkurs-Fortschritt konnte nicht gelesen werden:", error);
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
      console.error("Der Mattkurs-Fortschritt konnte nicht gespeichert werden:", error);
    }
  }, [completed, ready]);

  function markCompleted(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/lernen" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Selbstständiges Lernen</Link>
        <header className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Selbstständiges Lernen · Mattmethoden</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Mattsetzen lernen</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Probiere jedes Mattbild zuerst selbst am Brett. Danach erklärt der Kurs die Lösung Zug für Zug und prüft dein Verständnis. Lerne bekannte Mattbilder und alle grundlegenden erzwungenen Mattführungen gegen den alleinstehenden König; zwei Springer können ein Matt nicht erzwingen.</p>
        </header>

        <section aria-label="Mattmethode auswählen" className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Was möchtest du lernen?</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lessons.map((item, index) => {
              const active = item.id === lessonId;
              return <button key={item.id} type="button" onClick={() => setLessonId(item.id)} aria-pressed={active} className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 ${active ? "border-amber-300/50 bg-amber-300/10" : "border-slate-800 bg-slate-900/60 hover:border-slate-600"}`}>
                <span className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-white">{index + 1}. {item.shortTitle}</span>
                  <span className={`shrink-0 text-xs ${completed.includes(item.id) ? "text-emerald-200" : "text-slate-500"}`}>{completed.includes(item.id) ? "Gelernt" : item.forceable ? "Lernen" : "Verstehen"}</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-400">{item.material}</span>
              </button>;
            })}
          </div>
        </section>

        <section aria-label="Mattkurs-Fortschritt" className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300"><strong className="text-white">{completedCount} von {lessons.length}</strong> Methoden gelernt</p>
            <span className="text-sm font-semibold tabular-nums text-amber-200">{ready ? Math.round(completedCount / lessons.length * 100) : 0}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Fortschritt im Mattkurs" aria-valuemin={0} aria-valuemax={lessons.length} aria-valuenow={completedCount}>
            <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${completedCount / lessons.length * 100}%` }} />
          </div>
        </section>

        {!ready ? <p role="status" className="mt-5 text-sm text-slate-400">Dein Lernfortschritt wird geladen …</p> : (
          <div className="mt-5">
            <CheckmateWorkspace key={lesson.id} lesson={lesson} learned={completed.includes(lesson.id)} onComplete={() => markCompleted(lesson.id)} />
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-500">Die Varianten beginnen in Beispielstellungen und zeigen jeweils eine vollständige legale Mattfolge; die tatsächliche Partie kann andere beste Züge enthalten. Läufer+Springer erfordert präzises Zusammenspiel bis zur richtigen Ecke. Läufer oder Springer allein sowie zwei Springer gegen den alleinstehenden König reichen nicht, um Matt zu erzwingen.</p>
      </div>
    </main>
  );
}
