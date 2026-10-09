"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { readOnlineHistory, type OnlineGameRecord } from "@/app/online/history-store";
import { createClient } from "@/lib/supabase/client";
import { MiniChessboard } from "@/components/mini-chessboard";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Datum unbekannt" : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isOnlineGameRecord(value: unknown): value is OnlineGameRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<OnlineGameRecord>;
  return typeof record.id === "string"
    && typeof record.playedAt === "string"
    && typeof record.timeControl === "string"
    && (record.color === "w" || record.color === "b")
    && (record.result === "win" || record.result === "loss" || record.result === "draw")
    && typeof record.resultText === "string"
    && typeof record.reason === "string"
    && Array.isArray(record.moves)
    && record.moves.every((move) => move && typeof move.san === "string"
      && (move.color === "w" || move.color === "b")
      && typeof move.from === "string" && typeof move.to === "string");
}

export default function GameHistoryPage() {
  const [games, setGames] = useState<OnlineGameRecord[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [replayPly, setReplayPly] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const selectedGame = games.find((game) => game.id === selectedGameId) ?? null;
  const replayFen = useMemo(() => {
    const replay = new Chess();
    if (!selectedGame) return replay.fen();
    try {
      selectedGame.moves.slice(0, replayPly).forEach((move) => {
        replay.move({ from: move.from as Square, to: move.to as Square, ...(move.promotion ? { promotion: move.promotion } : {}) });
      });
    } catch {
      return new Chess().fen();
    }
    return replay.fen();
  }, [replayPly, selectedGame]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const localGames = readOnlineHistory();
      setGames(localGames);
      void (async () => {
        try {
          const supabase = createClient();
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user) {
            if (active) setSyncMessage("Melde dich an, um deine Partien kontoübergreifend zu synchronisieren.");
            return;
          }
          const { data, error } = await supabase.rpc("list_my_online_games");
          if (error) throw error;
          if (!active) return;
          const remoteGames = ((data ?? []) as unknown[]).flatMap((value) => {
            if (!value || typeof value !== "object" || !("record" in value)) return [];
            return isOnlineGameRecord(value.record) ? [value.record] : [];
          });
          const merged = new Map(localGames.map((game) => [game.id, game]));
          remoteGames.forEach((game) => merged.set(game.id, game));
          setGames([...merged.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)));
          setSyncMessage("Partien werden mit deinem Konto synchronisiert.");
        } catch (error) {
          console.error("Gespeicherte Online-Partien konnten nicht geladen werden:", error);
          if (active) setSyncMessage("Kontoverlauf konnte nicht geladen werden. Die Synchronisierung ist derzeit nicht verfügbar.");
        }
      })();
    };
    refresh();
    window.addEventListener("online-history-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("online-history-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Zur Startseite</Link>
        <header className="mt-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Deine Schachreise</p>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Partieverlauf</h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-300">Hier findest du deine beendeten Online-Partien mit Ergebnis, Bedenkzeit und Zugfolge.</p>
        </header>

        {syncMessage && <p role="status" className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm leading-6 text-slate-400">{syncMessage}</p>}

        {selectedGame && <section className="mt-5 grid gap-4 rounded-2xl border border-emerald-400/30 bg-slate-900 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] sm:p-5" aria-label="Partie nachspielen">
          <div><h2 className="text-lg font-semibold">Partie nachspielen</h2><p className="mt-1 text-sm text-slate-400">{selectedGame.whiteName ?? "Weiß"} – {selectedGame.blackName ?? "Schwarz"}</p><MiniChessboard fen={replayFen} label={`Partie nachspielen, Halbzug ${replayPly}`} orientation={selectedGame.color === "w" ? "white" : "black"} /><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => setReplayPly((ply) => Math.max(0, ply - 1))} disabled={replayPly === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">← Zurück</button><span className="text-xs tabular-nums text-slate-400">{replayPly}/{selectedGame.moves.length} Halbzüge</span><button type="button" onClick={() => setReplayPly((ply) => Math.min(selectedGame.moves.length, ply + 1))} disabled={replayPly >= selectedGame.moves.length} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Weiter →</button><button type="button" onClick={() => setSelectedGameId(null)} className="text-xs text-slate-400 underline">Schließen</button></div></div>
          <div><h3 className="font-semibold">Zugfolge</h3><div className="mt-3 grid max-h-96 grid-cols-2 gap-1 overflow-y-auto">{selectedGame.moves.map((move, index) => <button key={`${selectedGame.id}-${index}`} type="button" onClick={() => setReplayPly(index + 1)} className={`rounded px-2 py-1.5 text-left text-sm ${replayPly === index + 1 ? "bg-emerald-400/20 text-emerald-200" : "bg-slate-950 text-slate-300"}`}><span className="mr-2 text-slate-500">{move.color === "w" ? `${Math.floor(index / 2) + 1}.` : ""}</span>{move.san}</button>)}</div></div>
        </section>}

        {games.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center sm:p-12">
            <div className="text-5xl" aria-hidden="true">♟</div>
            <h2 className="mt-4 text-xl font-bold">Noch keine Online-Partien</h2>
            <p className="mt-2 text-slate-400">Deine abgeschlossenen Partien erscheinen nach dem ersten Spiel hier.</p>
            <Link href="/online" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-400 px-5 font-semibold text-slate-950 transition hover:bg-emerald-300">Online-Partie starten</Link>
          </section>
        ) : (
          <section className="mt-6 space-y-3" aria-label="Beendete Partien">
            {games.map((game, index) => {
              const badge = game.result === "win" ? "bg-emerald-950 text-emerald-300" : game.result === "loss" ? "bg-rose-950 text-rose-300" : "bg-slate-800 text-slate-200";
              const whiteMoves = game.moves.filter((move) => move.color === "w");
              const blackMoves = game.moves.filter((move) => move.color === "b");
              return (
                <details key={game.id} className="group rounded-2xl border border-slate-800 bg-slate-900/60">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 sm:p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 font-semibold text-slate-300">{games.length - index}</span>
                    <span className="min-w-36 flex-1">
                      <span className="block font-semibold">Gegen {game.color === "w" ? game.blackName ?? "Gast" : game.whiteName ?? "Gast"} · {game.timeControl}</span>
                      <span className="mt-1 block text-sm text-slate-400">{dateLabel(game.playedAt)} · Du spieltest {game.color === "w" ? "Weiß" : "Schwarz"}</span>
                    </span>
                    <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${badge}`}>{game.resultText}</span>
                    <span className="ml-1 text-slate-500 transition group-open:rotate-180" aria-hidden="true">⌄</span>
                  </summary>
                  <div className="border-t border-slate-800 px-4 py-4 sm:px-5">
                    <p className="text-sm text-slate-400">{game.reason} · Weiß: {game.whiteName ?? "Gast"} · Schwarz: {game.blackName ?? "Gast"}</p>
                    <button type="button" onClick={() => { setSelectedGameId(game.id); setReplayPly(0); }} className="mt-3 rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-200">Partie nachspielen</button>
                    {game.moves.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-500">In dieser Partie wurden keine Züge gespeichert.</p>
                    ) : (
                      <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
                        <div className="grid grid-cols-[3rem_1fr_1fr] bg-slate-950 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><span>Zug</span><span>Weiß</span><span>Schwarz</span></div>
                        {whiteMoves.map((move, moveIndex) => (
                          <div key={moveIndex} className="grid grid-cols-[3rem_1fr_1fr] border-t border-slate-800 px-3 py-2.5 text-sm even:bg-slate-950/40">
                            <span className="text-slate-500">{moveIndex + 1}.</span>
                            <span>{move.san}</span>
                            <span>{blackMoves[moveIndex]?.san ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
