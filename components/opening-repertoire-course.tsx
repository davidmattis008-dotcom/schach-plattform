"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { openingRepertoire, type Opening, type OpeningVariant } from "@/lib/opening-repertoire";
import openingDatabaseData from "@/lib/opening-database.json";

const STORAGE_KEY = "schach-eroeffnungen-gelernt-v1";
type Mode = "learn" | "replay" | null;
type LearnerColor = "w" | "b";
const openingDatabase = openingDatabaseData as Opening[];
const allOpenings = [...openingRepertoire, ...openingDatabase];
const openingProgressKey = (variantId: string, color: LearnerColor) => `${variantId}:${color}`;

function formatMoveList(moves: string[]) {
  return moves.map((san, index) => `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : ""}${san}`).join(" ");
}

function describeMove(game: Chess, move: ReturnType<Chess["move"]>) {
  const side = move.color === "w" ? "Weiß" : "Schwarz";
  if (game.isCheckmate()) return `${side} spielt ${move.san} und setzt matt. Die Partie wäre beendet.`;
  if (game.isCheck()) return `${side} spielt ${move.san} und gibt Schach.`;
  if (move.flags.includes("k") || move.flags.includes("q")) return `${side} rochiert mit ${move.san} und bringt den König in Sicherheit.`;
  if (move.captured) return `${side} spielt ${move.san} und schlägt eine gegnerische Figur.`;
  return `${side} spielt ${move.san}.`;
}

function OpeningWorkspace({
  opening,
  variant,
  learnerColor,
  completed,
  onComplete,
}: {
  opening: Opening;
  variant: OpeningVariant;
  learnerColor: LearnerColor;
  completed: boolean;
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [fen, setFen] = useState(new Chess().fen());
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [message, setMessage] = useState("");
  const [played, setPlayed] = useState<string[]>([]);
  const game = useMemo(() => new Chess(fen), [fen]);
  const canMove = mode === "replay" || (mode === "learn" && game.turn() === learnerColor);
  const targets = canMove && selected && ply < variant.moves.length
    ? game.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];

  function start(nextMode: Exclude<Mode, null>) {
    const position = new Chess();
    const history: string[] = [];
    let nextPly = 0;
    if (nextMode === "learn" && learnerColor === "b") {
      const first = position.move(variant.moves[0]);
      history.push(first.san);
      nextPly = 1;
    }
    setMode(nextMode);
    setFen(position.fen());
    setPly(nextPly);
    setPlayed(history);
    setSelected(null);
    setMessage(nextMode === "learn"
      ? learnerColor === "b"
        ? `Weiß beginnt mit ${history[0]}. Jetzt bist du mit Schwarz am Zug.`
        : "Du spielst Weiß. Ziehe die Züge dieser Eröffnung selbst; die gegnerischen Antworten werden erklärt und automatisch gespielt."
      : "Spiele die gesamte Variante selbst, Zug für Zug – beide Farben sind jetzt an der Reihe.");
  }

  function selectSquare(name: string) {
    if (!mode || !canMove || ply >= variant.moves.length || game.isGameOver()) return;
    const square = name as Square;
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
    if (!game.moves({ square: selected, verbose: true }).some((move) => move.to === square)) {
      setSelected(null);
      return;
    }

    const next = new Chess(fen);
    const move = next.move({ from: selected, to: square, promotion: "q" });
    const expected = variant.moves[ply];
    if (move.san !== expected) {
      setSelected(null);
      setMessage(mode === "learn"
        ? "Der Zug ist legal, passt aber nicht zu dieser Eröffnungsvariante. Versuche einen anderen Zug."
        : "Der Zug ist legal, gehört aber nicht zur eingeübten Zugfolge. Setze die Stellung zurück und versuche es erneut.");
      return;
    }

    const nextPlayed = [...played, move.san];
    let nextPly = ply + 1;
    let explanation = describeMove(next, move);
    if (mode === "learn" && nextPly < variant.moves.length) {
      const reply = next.move(variant.moves[nextPly]);
      explanation += ` Die Gegenseite antwortet mit ${reply.san}. ${describeMove(next, reply)}`;
      nextPlayed.push(reply.san);
      nextPly += 1;
    }

    setFen(next.fen());
    setPly(nextPly);
    setPlayed(nextPlayed);
    setSelected(null);
    setMessage(explanation);
    if (nextPly >= variant.moves.length) {
      setMessage(`${explanation} Eröffnung vollständig durchgespielt.`);
      onComplete();
    }
  }

  const isFinished = ply >= variant.moves.length;
  const status = isFinished
    ? "Variante vollständig durchgespielt"
    : !mode
      ? "Bereit zum Lernen"
      : `${game.turn() === "w" ? "Weiß" : "Schwarz"} ist am Zug${mode === "learn" && game.turn() !== learnerColor ? " (Gegner)" : ""}`;

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">{opening.name} · du spielst {learnerColor === "w" ? "Weiß" : "Schwarz"} · Variante</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{variant.name}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${completed ? "border-emerald-300/30 text-emerald-200" : "border-slate-700 text-slate-400"}`}>
          {completed ? "Gelernt" : "Noch offen"}
        </span>
      </header>
      <p className="mt-3 text-sm leading-6 text-slate-300">{variant.description}</p>
      {variant.eco && <p className="mt-1 text-xs font-medium text-amber-200">ECO {variant.eco}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">Grundidee: {opening.idea}</p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,34rem)_minmax(15rem,1fr)]">
        <div>
          <MiniChessboard
            fen={fen}
            label={`${opening.name}, ${variant.name}: ${status}`}
            onSquareClick={selectSquare}
            selected={selected}
            targets={targets}
            orientation={learnerColor === "w" ? "white" : "black"}
          />
          <p role="status" aria-live="polite" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-center text-sm font-semibold text-amber-100">
            {status}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">
            {mode ? `${ply}/${variant.moves.length} Halbzüge · ${mode === "learn" ? "deine Seite selbst ziehen, Antworten automatisch" : "beide Farben selbst ziehen"}` : "Starte mit „Lernen“ oder spiele die gesamte Variante direkt durch."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => start("learn")} className="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-200">
              {completed ? "Wiederholen" : "Lernen"}
            </button>
            <button type="button" onClick={() => start("replay")} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800">
              Komplett durchspielen
            </button>
            {mode && <button type="button" onClick={() => start(mode)} className="rounded-lg border border-slate-700 px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800">Neu starten</button>}
          </div>
          {message && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-300">{message}</p>}
        </div>

        <div>
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="font-semibold text-white">{mode === "replay" ? "Komplette Zugfolge" : "Schritt für Schritt lernen"}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {mode === "replay"
                ? "Spiele jeden Zug in der angezeigten Reihenfolge selbst. So wiederholst du die gesamte Eröffnung mit beiden Farben."
                : "Wähle Lernen, um deine Seite selbst zu spielen. Die gegnerischen Züge folgen automatisch; nach jedem Zug erklären wir die Wirkung."}
            </p>
            <p className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-400">{variant.description}</p>
          </section>
          <section className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="font-semibold text-white">Zugfolge</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {variant.moves.map((san, index) => (
                <span key={`${index}-${san}`} className={`rounded px-2 py-1 text-xs ${index < ply ? "bg-amber-300/10 text-amber-100" : "bg-slate-900 text-slate-500"}`}>
                  {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{san}
                </span>
              ))}
            </div>
            {played.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">Bisher gespielt: {formatMoveList(played)}</p>}
          </section>
          {isFinished && <p className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm leading-6 text-emerald-100">
            {completed ? "Gelernt – du kannst die Eröffnung jederzeit wiederholen." : "Geschafft! Diese Variante ist jetzt als gelernt markiert."}
          </p>}
        </div>
      </div>
    </article>
  );
}

export function OpeningRepertoireCourse() {
  const [search, setSearch] = useState("");
  const [openingId, setOpeningId] = useState(openingRepertoire[0].id);
  const [variantId, setVariantId] = useState(openingRepertoire[0].variants[0].id);
  const [learnerColor, setLearnerColor] = useState<LearnerColor>("w");
  const [visibleOpeningCount, setVisibleOpeningCount] = useState(20);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const query = search.trim().toLocaleLowerCase("de");
  const filteredOpenings = useMemo(() => allOpenings.filter((opening) => (
    !query || [
      opening.name,
      opening.side,
      opening.idea,
      ...opening.variants.flatMap((variant) => [variant.name, variant.description, variant.eco ?? ""]),
    ].some((text) => text.toLocaleLowerCase("de").includes(query))
  )), [query]);
  const selectedOpening = allOpenings.find((opening) => opening.id === openingId) ?? openingRepertoire[0];
  const selectedVariant = selectedOpening.variants.find((variant) => variant.id === variantId) ?? selectedOpening.variants[0];
  const totalVariants = allOpenings.reduce((total, opening) => total + opening.variants.length, 0);
  const visibleOpenings = query ? filteredOpenings.slice(0, visibleOpeningCount) : [];
  const hasMoreOpenings = query.length > 0 && filteredOpenings.length > visibleOpenings.length;
  const selectedDone = completed.includes(openingProgressKey(selectedVariant.id, learnerColor));

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
        if (Array.isArray(saved)) {
          const legacyProgress = new Map(allOpenings.flatMap((opening) => opening.variants.map((variant) => [
            variant.id,
            openingProgressKey(variant.id, opening.side === "Schwarz" ? "b" : "w"),
          ])));
          const knownProgress = new Set(allOpenings.flatMap((opening) => opening.variants.flatMap((variant) => (
            [openingProgressKey(variant.id, "w"), openingProgressKey(variant.id, "b")]
          ))));
          setCompleted(Array.from(new Set(saved.flatMap((id): string[] => {
            if (typeof id !== "string") return [];
            if (knownProgress.has(id)) return [id];
            const migrated = legacyProgress.get(id);
            return migrated ? [migrated] : [];
          }))));
        }
      } catch (error) {
        console.error("Der Eröffnungsfortschritt konnte nicht gelesen werden:", error);
      }
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch (error) {
      console.error("Der Eröffnungsfortschritt konnte nicht gespeichert werden:", error);
    }
  }, [completed, ready]);

  function selectOpening(opening: Opening) {
    setOpeningId(opening.id);
    setVariantId(opening.variants[0].id);
    setLearnerColor(opening.side === "Schwarz" ? "b" : "w");
  }

  function selectVariant(opening: Opening, variant: OpeningVariant) {
    setOpeningId(opening.id);
    setVariantId(variant.id);
  }

  function markCompleted(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
  }

  const completedCount = completed.length;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/lernen" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Selbstständiges Lernen</Link>
        <header className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Selbstständiges Lernen · Eröffnungsrepertoire</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Eröffnungen lernen</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Lerne häufig gespielte Eröffnungsfamilien und ihre Nebenvarianten Schritt für Schritt am Schachbrett. Ziehe selbst, wiederhole die Zugfolge und spiele Varianten anschließend komplett durch.</p>
        </header>

        <section aria-label="Eröffnungen durchsuchen" className="relative mt-6">
          <label htmlFor="opening-search" className="sr-only">Eröffnungen und Varianten suchen</label>
          <input
            id="opening-search"
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setVisibleOpeningCount(20); }}
            placeholder="Eröffnung suchen, z. B. Sizilianisch oder ECO-Code …"
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
          />
          {query && <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl" aria-label="Suchergebnisse">
            {visibleOpenings.length ? visibleOpenings.map((opening) => (
              <button key={opening.id} type="button" onClick={() => { selectOpening(opening); setSearch(""); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white">{opening.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">{opening.idea}</span>
                </span>
                <span className="shrink-0 text-xs text-amber-200">{opening.variants.length} Varianten</span>
              </button>
            )) : <p className="px-3 py-4 text-sm text-slate-400">Keine passende Eröffnung gefunden.</p>}
            {hasMoreOpenings && <button type="button" onClick={() => setVisibleOpeningCount((count) => count + 20)} className="w-full border-t border-slate-800 px-3 py-3 text-sm text-amber-200 hover:bg-slate-800">Weitere Treffer anzeigen ({filteredOpenings.length - visibleOpenings.length})</button>}
          </div>}
          <p className="mt-2 text-xs text-slate-500">{allOpenings.length} Eröffnungsfamilien · {totalVariants} Varianten. Suche nach Name oder ECO-Code.</p>
        </section>

        <section aria-label="Eröffnungsfortschritt" className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300"><strong className="text-white">{completedCount} von {totalVariants * 2}</strong> Lernwegen (Weiß/Schwarz) gelernt</p>
            <span className="text-sm font-semibold tabular-nums text-amber-200">{ready ? Math.round(completedCount / (totalVariants * 2) * 100) : 0}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Eröffnungsvarianten und Farben gelernt" aria-valuemin={0} aria-valuemax={totalVariants * 2} aria-valuenow={completedCount}>
            <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${completedCount / (totalVariants * 2) * 100}%` }} />
          </div>
        </section>

        <section aria-label="Ausgewählte Eröffnung lernen" className="mt-5">
          {!ready ? <p role="status" className="text-sm text-slate-400">Dein Lernfortschritt wird geladen …</p> : (
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <label className="min-w-0 flex-1 text-sm text-slate-300">Variante aus {selectedOpening.name}
                  <select value={selectedVariant.id} onChange={(event) => selectVariant(selectedOpening, selectedOpening.variants.find((variant) => variant.id === event.target.value) ?? selectedVariant)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white">
                    {selectedOpening.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.eco ? `${variant.eco} · ` : ""}{variant.name}</option>)}
                  </select>
                </label>
                <div>
                  <p className="mb-1 text-xs text-slate-400">Deine Farbe</p>
                  <div className="flex gap-2">
                    {(["w", "b"] as const).map((color) => <button key={color} type="button" onClick={() => setLearnerColor(color)} aria-pressed={learnerColor === color} className={`rounded-lg border px-3 py-2 text-sm ${learnerColor === color ? "border-amber-300/50 bg-amber-300/10 text-amber-100" : "border-slate-700 text-slate-400"}`}>{color === "w" ? "Weiß" : "Schwarz"}</button>)}
                  </div>
                </div>
              </div>
              <OpeningWorkspace
                key={`${selectedVariant.id}:${learnerColor}`}
                opening={selectedOpening}
                variant={selectedVariant}
                learnerColor={learnerColor}
                completed={selectedDone}
                onComplete={() => markCompleted(openingProgressKey(selectedVariant.id, learnerColor))}
              />
            </>
          )}
        </section>
        <p className="mt-4 text-xs leading-5 text-slate-500">Ausgewählt: {selectedOpening.name} · {selectedOpening.variants.length} Varianten · Die Datenbank enthält benannte ECO-Eröffnungen und Zugfolgen aus der Lichess Open Database (CC0), aber nicht jede mögliche Zugfolge oder Schach-Transposition. Fortschritt wird lokal in diesem Browser gespeichert.</p>
      </div>
    </main>
  );
}
