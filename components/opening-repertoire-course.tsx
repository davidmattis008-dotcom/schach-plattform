"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { CageAiPanel } from "@/components/cage-ai-panel";
import { openingRepertoire, type Opening, type OpeningVariant } from "@/lib/opening-repertoire";
import openingDatabaseData from "@/lib/opening-database.json";
import { subscribeToAccountProgressUpdates, writeProgressStorage } from "@/lib/account-progress";

const STORAGE_KEY = "schach-eroeffnungen-gelernt-v1";
type Mode = "learn" | "replay" | null;
type LearnerColor = "w" | "b";
const openingDatabase = openingDatabaseData as Opening[];
const allOpenings = [...openingRepertoire, ...openingDatabase];
const openingProgressKey = (variantId: string, color: LearnerColor) => `${variantId}:${color}`;

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
  const game = useMemo(() => new Chess(fen), [fen]);
  const canMove = mode === "replay" || (mode === "learn" && game.turn() === learnerColor);
  const targets = canMove && selected && ply < variant.moves.length
    ? game.moves({ square: selected, verbose: true }).map((move) => move.to)
    : [];

  function start(nextMode: Exclude<Mode, null>) {
    const position = new Chess();
    let nextPly = 0;
    if (nextMode === "learn" && learnerColor === "b") {
      position.move(variant.moves[0]);
      nextPly = 1;
    }
    setMode(nextMode);
    setFen(position.fen());
    setPly(nextPly);
    setSelected(null);
    setMessage(nextMode === "learn"
      ? learnerColor === "b"
        ? "Weiß beginnt. Du bist am Zug."
        : "Ziehe die Eröffnungszüge. Antworten folgen automatisch."
      : "Spiele beide Farben.");
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

    let nextPly = ply + 1;
    let explanation = describeMove(next, move);
    if (mode === "learn" && nextPly < variant.moves.length) {
      const reply = next.move(variant.moves[nextPly]);
      explanation += ` Die Gegenseite antwortet mit ${reply.san}. ${describeMove(next, reply)}`;
      nextPly += 1;
    }

    setFen(next.fen());
    setPly(nextPly);
    setSelected(null);
    setMessage(explanation);
    if (nextPly >= variant.moves.length) {
      setMessage("Variante vollständig.");
      onComplete();
    }
  }

  const isFinished = ply >= variant.moves.length;
  const status = isFinished
    ? "Fertig"
    : !mode
      ? "Bereit zum Lernen"
      : `${game.turn() === "w" ? "Weiß" : "Schwarz"} ist am Zug${mode === "learn" && game.turn() !== learnerColor ? " (Gegner)" : ""}`;

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-200">{opening.name} · {learnerColor === "w" ? "Weiß" : "Schwarz"} · {variant.eco ?? "Variante"}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{variant.name}</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${completed ? "border-emerald-300/30 text-emerald-200" : "border-slate-700 text-slate-400"}`}>
          {completed ? "Gelernt" : "Offen"}
        </span>
      </header>
      <p className="mt-2 text-xs text-slate-400">{opening.idea}</p>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,34rem)_minmax(15rem,1fr)]">
        <div>
          <MiniChessboard
            fen={fen}
            label={`${opening.name}, ${variant.name}: ${status}`}
            onSquareClick={selectSquare}
            selected={selected}
            targets={targets}
            orientation={learnerColor === "w" ? "white" : "black"}
          />
          <p role="status" aria-live="polite" className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-1.5 text-center text-sm font-semibold text-amber-100">
            {status}
          </p>
          <p className="mt-1 text-center text-xs text-slate-500">
            {mode ? `${ply}/${variant.moves.length} Züge` : "Lernen oder durchspielen"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => start("learn")} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-200">
              {completed ? "Wiederholen" : "Lernen"}
            </button>
            <button type="button" onClick={() => start("replay")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
              Durchspielen
            </button>
            {mode && <button type="button" onClick={() => start(mode)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800">Neustart</button>}
          </div>
          {message && <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-300">{message}</p>}
        </div>

        <div>
          <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <h3 className="text-sm font-semibold text-white">Zugfolge</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {variant.moves.map((san, index) => (
                <span key={`${index}-${san}`} className={`rounded px-1.5 py-1 text-xs ${index < ply ? "bg-amber-300/10 text-amber-100" : "bg-slate-900 text-slate-500"}`}>
                  {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{san}
                </span>
              ))}
            </div>
          </section>
          {isFinished && <p className="mt-2 rounded-lg border border-emerald-300/20 bg-emerald-300/5 p-2 text-sm text-emerald-100">
            {completed ? "Gelernt" : "Variante gelernt"}
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
    const loadProgress = () => {
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
    };
    queueMicrotask(loadProgress);
    const unsubscribe = subscribeToAccountProgressUpdates(loadProgress);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      writeProgressStorage(STORAGE_KEY, JSON.stringify(completed));
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
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/lernen" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Lernpfad</Link>
        <header className="mt-4">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Eröffnungen</h1>
        </header>

        <section aria-label="Eröffnungen durchsuchen" className="relative mt-3">
          <label htmlFor="opening-search" className="sr-only">Eröffnungen und Varianten suchen</label>
          <input
            id="opening-search"
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setVisibleOpeningCount(20); }}
            placeholder="Eröffnung suchen"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
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
        </section>

        <section aria-label="Eröffnungsfortschritt" className="mt-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-300"><strong className="text-white">{completedCount}/{totalVariants * 2}</strong> gelernt</p>
            <span className="text-sm font-semibold tabular-nums text-amber-200">{ready ? Math.round(completedCount / (totalVariants * 2) * 100) : 0}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800" role="progressbar" aria-label="Eröffnungsvarianten und Farben gelernt" aria-valuemin={0} aria-valuemax={totalVariants * 2} aria-valuenow={completedCount}>
            <div className="h-full bg-amber-300 transition-[width]" style={{ width: `${completedCount / (totalVariants * 2) * 100}%` }} />
          </div>
        </section>

        <section aria-label="Ausgewählte Eröffnung lernen" className="mt-3">
          {!ready ? <p role="status" className="text-sm text-slate-400">Dein Lernfortschritt wird geladen …</p> : (
            <>
              <div className="mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-2">
                <label className="min-w-0 flex-1 text-xs text-slate-300">{selectedOpening.name}
                  <select value={selectedVariant.id} onChange={(event) => selectVariant(selectedOpening, selectedOpening.variants.find((variant) => variant.id === event.target.value) ?? selectedVariant)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
                    {selectedOpening.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.eco ? `${variant.eco} · ` : ""}{variant.name}</option>)}
                  </select>
                </label>
                <div>
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
              {openingRepertoire.some((opening) => opening.id === selectedOpening.id) && (
                <div className="mt-4">
                  <CageAiPanel
                    key={selectedOpening.id}
                    contextLabel={`Frage CageAI zur Eröffnung „${selectedOpening.name}“.`}
                    contextReady
                    contextBadge="Eröffnungskurs"
                    placeholder="Frage zu dieser Eröffnung …"
                    quickPrompts={["Was ist der typische Plan in dieser Eröffnung?"]}
                    requestConfig={{
                      purpose: "course_question",
                      course: {
                        courseId: "openings",
                        lessonTitle: selectedOpening.name,
                        sourceKeys: [`course:opening:${selectedOpening.id}`],
                      },
                    }}
                  />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
