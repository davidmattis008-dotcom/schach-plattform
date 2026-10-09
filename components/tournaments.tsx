"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getOnlineRatingMode, getOnlineRatingModeLabel, ONLINE_TIME_CONTROLS } from "@/app/online/protocol";
import { SelectMenu, type SelectMenuOption } from "@/components/select-menu";

type Tournament = {
  tournament_id: string;
  name: string;
  creator_username: string;
  initial_seconds: number;
  increment_seconds: number;
  max_players: number;
  status: "open" | "running" | "completed";
  player_count: number;
  is_joined: boolean;
  is_creator: boolean;
  can_join: boolean;
  can_manage: boolean;
  created_at: string;
};
type Player = { user_id: string; username: string; score: number; is_creator: boolean };
type TournamentGame = {
  game_id: string;
  white_user_id: string;
  white_username: string;
  black_user_id: string;
  black_username: string;
  status: "pending" | "disputed" | "finished";
  result: "white" | "black" | "draw" | null;
  white_report: "white" | "black" | "draw" | null;
  black_report: "white" | "black" | "draw" | null;
};
const statusLabels = { open: "Anmeldung offen", running: "Läuft", completed: "Beendet" } as const;
const gameStatusLabels = { pending: "Ergebnis offen", disputed: "Ergebnisse weichen ab", finished: "Bestätigt" } as const;
const resultLabels = { white: "Weiß gewinnt", black: "Schwarz gewinnt", draw: "Remis" } as const;

function roomUrl(game: TournamentGame, tournament: Tournament, playerId: string) {
  const white = playerId === game.white_user_id;
  const player = `${game.game_id}_${white ? "white" : "black"}`;
  const opponent = `${game.game_id}_${white ? "black" : "white"}`;
  const params = new URLSearchParams({
    room: [player, opponent].sort().join("_"),
    player,
    opponent,
    tournamentGameId: game.game_id,
    white: String(white),
    initial: String(tournament.initial_seconds),
    increment: String(tournament.increment_seconds),
    rated: "false",
    whiteName: game.white_username,
    blackName: game.black_username,
  });
  return `/online/partie?${params.toString()}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function Tournaments() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<TournamentGame[]>([]);
  const [name, setName] = useState("");
  const [timeControl, setTimeControl] = useState(ONLINE_TIME_CONTROLS[4].id);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = createClient();
    return clientRef.current;
  }, []);
  const timeControlOptions: SelectMenuOption[] = ONLINE_TIME_CONTROLS
    .filter((control) => control.initialSeconds >= 60)
    .map((control) => ({ value: control.id, label: `${control.label} · ${control.group}` }));
  const playerCountOptions: SelectMenuOption[] = [2, 4, 6, 8, 10, 12, 14, 16]
    .map((count) => ({ value: String(count), label: `${count} Spieler` }));

  const loadTournaments = useCallback(async () => {
    const { data, error: queryError } = await getClient().rpc("list_chess_tournaments");
    if (queryError) throw queryError;
    const rows = (data ?? []) as Tournament[];
    setTournaments(rows);
    return rows;
  }, [getClient]);

  const loadDetails = useCallback(async (tournament: Tournament) => {
    const [{ data: playerData, error: playerError }, { data: gameData, error: gameError }] = await Promise.all([
      getClient().rpc("list_chess_tournament_players", { p_tournament_id: tournament.tournament_id }),
      getClient().rpc("list_chess_tournament_games", { p_tournament_id: tournament.tournament_id }),
    ]);
    if (playerError) throw new Error(`Teilnehmerliste: ${errorMessage(playerError, "unbekannter Fehler")}`);
    if (gameError) throw new Error(`Paarungen: ${errorMessage(gameError, "unbekannter Fehler")}`);
    setPlayers((playerData ?? []) as Player[]);
    setGames((gameData ?? []) as TournamentGame[]);
  }, [getClient]);

  const refresh = useCallback(async (preferred?: Tournament | string) => {
    const rows = await loadTournaments();
    const preferredId = typeof preferred === "string" ? preferred : preferred?.tournament_id ?? selected?.tournament_id;
    const next = rows.find((item) => item.tournament_id === preferredId) ?? null;
    setSelected(next);
    if (next?.is_joined || next?.can_manage) await loadDetails(next);
    else {
      setPlayers([]);
      setGames([]);
    }
  }, [loadDetails, loadTournaments, selected?.tournament_id]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data: { user }, error: authError } = await getClient().auth.getUser();
          if (authError) throw authError;
          if (!active) return;
          setUserId(user?.id ?? null);
          if (user) {
            const rows = await loadTournaments();
            if (!active) return;
            const requestedTournamentId = new URLSearchParams(window.location.search).get("clubTournament");
            const requested = rows.find((item) => item.tournament_id === requestedTournamentId);
            const initialSelection = requested ?? rows.find((item) => item.is_joined);
            if (initialSelection) {
              setSelected(initialSelection);
              if (initialSelection.is_joined || initialSelection.can_manage) await loadDetails(initialSelection);
            }
          }
        } catch (loadError) {
          console.error("Turniere konnten nicht geladen werden:", loadError);
          if (active) setError("Turniere konnten nicht geladen werden. Wurde die Turnier-Migration bereits angewendet?");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [getClient, loadDetails, loadTournaments]);

  async function perform(label: string, operation: () => Promise<void>, preferred?: Tournament) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await refresh(preferred);
      setNotice(label);
    } catch (actionError) {
      console.error("Turnieraktion fehlgeschlagen:", actionError);
      setError(actionError instanceof Error ? actionError.message : "Turnieraktion konnte nicht ausgeführt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const control = ONLINE_TIME_CONTROLS.find((option) => option.id === timeControl);
    if (!control) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await getClient().rpc("create_chess_tournament", {
        p_name: name,
        p_initial_seconds: control.initialSeconds,
        p_increment_seconds: control.incrementSeconds,
        p_max_players: maxPlayers,
      });
      if (createError) throw createError;
      setName("");
      await refresh(data as string);
      setNotice("Turnier erstellt. Du bist automatisch angemeldet.");
    } catch (createError) {
      console.error("Turnier konnte nicht erstellt werden:", createError);
      setError(createError instanceof Error ? createError.message : "Turnier konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function reportResult(game: TournamentGame, result: "white" | "black" | "draw") {
    setBusy(true);
    setError("");
    try {
      const { data: status, error: reportError } = await getClient().rpc("report_chess_tournament_result", {
        p_game_id: game.game_id,
        p_result: result,
      });
      if (reportError) throw reportError;
      if (selected) await refresh(selected);
      setNotice(status === "finished"
        ? `Beide Spieler haben das Ergebnis bestätigt. Elo wurde für ${getOnlineRatingModeLabel(getOnlineRatingMode(selected?.initial_seconds ?? 0, selected?.increment_seconds ?? 0))} gewertet.`
        : "Dein Ergebnis wurde gespeichert. Die Paarung und Elo-Wertung werden abgeschlossen, sobald dein Gegner dasselbe Ergebnis bestätigt.");
    } catch (reportError) {
      console.error("Turnierergebnis konnte nicht gemeldet werden:", reportError);
      setError(reportError instanceof Error ? reportError.message : "Ergebnis konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status" className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Turniere werden geladen …</p>;
  if (!userId) return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-slate-300">Melde dich an, um Turnieren beizutreten oder eines zu erstellen.</p><Link href="/login" className="mt-3 inline-block text-emerald-300 underline">Zum Login</Link></section>;

  const activeGameCount = games.filter((game) => game.status !== "finished").length;
  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-3 text-sm text-emerald-200">{notice}</p>}
      <form onSubmit={(event) => void createTournament(event)} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_1fr_1fr_auto] lg:items-end">
        <label className="text-sm">Turnier erstellen
          <input required minLength={3} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Turniername" className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5" />
        </label>
        <label className="block text-sm">Bedenkzeit
          <SelectMenu className="mt-1" aria-label="Bedenkzeit" value={timeControl} options={timeControlOptions} onChange={setTimeControl} />
        </label>
        <label className="block text-sm">Plätze
          <SelectMenu className="mt-1" aria-label="Maximale Spielerzahl" value={String(maxPlayers)} options={playerCountOptions} onChange={(value) => setMaxPlayers(Number(value))} />
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Erstellen</button>
      </form>

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Turnierübersicht</h2><button type="button" onClick={() => void refresh()} disabled={busy} className="text-xs text-slate-400 underline disabled:opacity-50">Aktualisieren</button></div>
          {tournaments.map((tournament) => <article key={tournament.tournament_id} className={`rounded-xl border p-4 ${selected?.tournament_id === tournament.tournament_id ? "border-emerald-400/60 bg-slate-900" : "border-slate-800 bg-slate-900/60"}`}>
            <button type="button" onClick={() => { setSelected(tournament); setError(""); if (tournament.is_joined || tournament.can_manage) void loadDetails(tournament).catch((loadError) => { console.error("Turnierdetails konnten nicht geladen werden:", loadError); setError(`Turnierdetails konnten nicht geladen werden: ${errorMessage(loadError, "unbekannter Fehler")}`); }); }} className="block w-full text-left">
              <span className="flex items-start justify-between gap-2"><strong>{tournament.name}</strong><span className="shrink-0 text-xs text-emerald-300">{statusLabels[tournament.status]}</span></span>
              <span className="mt-1 block text-xs text-slate-400">{tournament.player_count}/{tournament.max_players} Spieler · {Math.floor(tournament.initial_seconds / 60)}+{tournament.increment_seconds} · von {tournament.creator_username}</span>
            </button>
            {!tournament.is_joined && tournament.can_join && tournament.status === "open" && <button type="button" disabled={busy || tournament.player_count >= tournament.max_players} onClick={() => void perform("Du bist dem Turnier beigetreten.", async () => { const { error: joinError } = await getClient().rpc("join_chess_tournament", { p_tournament_id: tournament.tournament_id }); if (joinError) throw joinError; }, tournament)} className="mt-3 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">Beitreten</button>}
            {!tournament.is_joined && !tournament.can_join && !tournament.can_manage && tournament.status === "open" && <p className="mt-3 text-xs text-slate-500">Nur Mitglieder der Trainingsgruppe können teilnehmen.</p>}
            {tournament.is_joined && !tournament.is_creator && tournament.status === "open" && <button type="button" disabled={busy} onClick={() => void perform("Du hast das Turnier verlassen.", async () => { const { error: leaveError } = await getClient().rpc("leave_chess_tournament", { p_tournament_id: tournament.tournament_id }); if (leaveError) throw leaveError; }, tournament)} className="mt-3 ml-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">Verlassen</button>}
            {selected?.tournament_id === tournament.tournament_id && tournament.is_creator && tournament.status === "open" && <button type="button" disabled={busy || tournament.player_count < 2} onClick={() => void perform("Turnier gestartet. Die Paarungen sind jetzt sichtbar.", async () => { const { error: startError } = await getClient().rpc("start_chess_tournament", { p_tournament_id: tournament.tournament_id }); if (startError) throw startError; }, tournament)} className="mt-3 rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">Turnier starten</button>}
          </article>)}
          {tournaments.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Noch keine Turniere. Erstelle das erste.</p>}
        </section>

        <section className="space-y-4">
          {selected && !selected.is_joined && !selected.can_manage ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">Du bist für dieses Turnier noch nicht angemeldet. Tritt einem offenen Turnier über die Übersicht bei, um Tabelle und Paarungen zu sehen.</p> : selected && (selected.is_joined || selected.can_manage) ? <>
            {selected.can_manage && !selected.is_joined && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">Du kannst dieses Vereinsturnier administrativ einsehen, bist aber nicht zur Teilnahme angemeldet.</p>}
            <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-slate-400">{statusLabels[selected.status]} · {games.length} Paarungen, {activeGameCount} offen · Elo-Modus: {getOnlineRatingModeLabel(getOnlineRatingMode(selected.initial_seconds, selected.increment_seconds))}</p></div></div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h3 className="font-semibold">Tabelle</h3>
              <ol className="mt-3 space-y-2">{players.map((player, index) => <li key={player.user_id} className="flex items-center justify-between rounded-lg bg-slate-950/70 px-3 py-2 text-sm"><span>{index + 1}. {player.username}{player.is_creator ? " · Veranstalter" : ""}</span><strong className="text-emerald-300">{player.score} Pkt.</strong></li>)}</ol>
            </div>
            {selected.status !== "open" && <div className="space-y-3">
              <h3 className="font-semibold">Paarungen</h3>
              {games.map((game) => {
                const involved = userId === game.white_user_id || userId === game.black_user_id;
                const myReport = userId === game.white_user_id ? game.white_report : game.black_report;
                return <article key={game.game_id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{game.white_username} <span className="text-slate-500">vs.</span> {game.black_username}</p><span className="text-xs text-slate-400">{gameStatusLabels[game.status]}</span></div>
                  {game.result && <p className="mt-2 text-sm text-emerald-300">{resultLabels[game.result]} · Elo gewertet ({getOnlineRatingModeLabel(getOnlineRatingMode(selected.initial_seconds, selected.increment_seconds))})</p>}
                  {game.status !== "finished" && involved && <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={roomUrl(game, selected, userId)} className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-200">Partie öffnen</Link>
                    {(["white", "draw", "black"] as const).map((result) => <button key={result} type="button" disabled={busy} onClick={() => void reportResult(game, result)} className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${myReport === result ? "border-amber-400/60 text-amber-200" : "border-slate-700 text-slate-300"}`}>{myReport === result ? "✓ " : ""}{resultLabels[result]}</button>)}
                  </div>}
                  {game.status === "disputed" && <p className="mt-2 text-xs text-amber-200">Die Spieler müssen sich auf dasselbe Ergebnis einigen. Deine Auswahl kann geändert werden.</p>}
                  {game.status !== "finished" && !involved && <p className="mt-2 text-xs text-slate-500">{game.white_username}: {game.white_report ? resultLabels[game.white_report] : "offen"} · {game.black_username}: {game.black_report ? resultLabels[game.black_report] : "offen"}</p>}
                </article>;
              })}
            </div>}
            {selected.status === "completed" && players[0] && <p className="rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-4 text-emerald-200">Turnier beendet. Gewinner: {players[0].username} mit {players[0].score} Punkten.</p>}
          </> : <p className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">Wähle ein Turnier aus, dem du beigetreten bist, um Tabelle und Paarungen zu sehen.</p>}
        </section>
      </div>
      <p className="text-xs leading-5 text-slate-500">Turniere verwenden Rundenturnier-Paarungen. Nach übereinstimmender Ergebnisbestätigung wird die Elo beider Spieler genau einmal im zugehörigen Zeitmodus (Bullet, Blitz, Rapid oder Klassisch) aktualisiert. Das Ergebnis wird nicht automatisch vom Partie-Server verifiziert.</p>
    </div>
  );
}
