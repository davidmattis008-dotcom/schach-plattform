"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createPlayerId, getRoomId, ONLINE_TIME_CONTROLS, type TimeControl } from "./protocol";type LobbyPlayer = { playerId: string; queuedAt: number; username?: string };

export default function OnlinePage() {
  const [selectedControl, setSelectedControl] = useState(ONLINE_TIME_CONTROLS[2]);
  const [searching, setSearching] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [message, setMessage] = useState("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerIdRef = useRef<string | null>(null);
  const matchedRef = useRef(false);
  const usernameRef = useRef("");
  const router = useRouter();

  function openMatch(whiteId: string, blackId: string, whiteName: string, blackName: string, control: TimeControl) {
    if (matchedRef.current) return;
    matchedRef.current = true;
    const playerId = playerIdRef.current;
    if (!playerId) return;
    const opponentId = playerId === whiteId ? blackId : whiteId;
    const params = new URLSearchParams({
      room: getRoomId(whiteId, blackId),
      player: playerId,
      opponent: opponentId,
      white: String(playerId === whiteId),
      initial: String(control.initialSeconds),
      increment: String(control.incrementSeconds),
      whiteName,
      blackName,
    });
    setMessage("Gegner gefunden. Die Partie wird geöffnet …");
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) void createClient().removeChannel(channel);
    router.push("/online/partie?" + params.toString());
  }

  async function startSearch() {
    if (searching) return;
    setMessage("");
    setQueueCount(1);
    setSearching(true);
    matchedRef.current = false;

    try {
      const supabase = createClient();
      const playerId = createPlayerId();
      playerIdRef.current = playerId;
      let username = "";
      let authUser: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] | null = null;
      try { const { data: { user } } = await supabase.auth.getUser(); if (user) { authUser = user; const { data } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(); if (typeof data?.username === "string") username = data.username.trim().slice(0, 20); } } catch { /* profile is optional */ }
      if (!username && authUser) { const metadata = authUser.user_metadata ?? {}; const profileName = [metadata.username, metadata.display_name, metadata.full_name, metadata.name].find((value) => typeof value === "string" && value.trim()); if (typeof profileName === "string") username = profileName.trim().slice(0, 20); }
      if (!username) username = "Gast-" + playerId.slice(0, 4).toUpperCase();
      usernameRef.current = username;
      const channel = supabase.channel("chess-lobby-" + selectedControl.id, {
        config: { presence: { key: playerId }, broadcast: { self: false } },
      });
      channelRef.current = channel;

      let pendingMatch: {
        room: string;
        whiteId: string;
        blackId: string;
        whiteName: string;
        blackName: string;
        readyPlayers: Set<string>;
        proposalSent: boolean;
        readySendStarted: boolean;
        readySent: boolean;
      } | null = null;

      const maybeOpenMatch = () => {
        if (!pendingMatch || matchedRef.current || !pendingMatch.readySent) return;
        if (!pendingMatch.readyPlayers.has(pendingMatch.whiteId) || !pendingMatch.readyPlayers.has(pendingMatch.blackId)) return;
        openMatch(pendingMatch.whiteId, pendingMatch.blackId, pendingMatch.whiteName, pendingMatch.blackName, selectedControl);
      };

      const getPendingMatch = (whiteId: string, blackId: string, whiteName: string, blackName: string) => {
        if (whiteId === blackId || (playerId !== whiteId && playerId !== blackId)) return null;
        const room = getRoomId(whiteId, blackId);
        if (pendingMatch && pendingMatch.room !== room) return null;
        pendingMatch ??= { room, whiteId, blackId, whiteName, blackName, readyPlayers: new Set(), proposalSent: false, readySendStarted: false, readySent: false };
        return pendingMatch;
      };

      const confirmMatchReady = (match: NonNullable<typeof pendingMatch>) => {
        if (match.readySent || match.readySendStarted) return;
        match.readySendStarted = true;
        match.readyPlayers.add(playerId);
        void channel.send({ type: "broadcast", event: "match-ready", payload: { room: match.room, by: playerId } }).then((status) => {
          match.readySendStarted = false;
          if (status !== "ok") {
            setMessage("Die Verbindung zum Gegner konnte nicht bestätigt werden. Bitte starte die Suche erneut.");
            return;
          }
          match.readySent = true;
          maybeOpenMatch();
        });
      };

      channel.on("broadcast", { event: "match-proposed" }, ({ payload }) => {
        if (!payload || payload.controlId !== selectedControl.id || typeof payload.whiteId !== "string" || typeof payload.blackId !== "string") return;
        const validName = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().slice(0, 20) : "Gast";
        const match = getPendingMatch(payload.whiteId, payload.blackId, validName(payload.whiteName), validName(payload.blackName));
        if (!match || payload.room !== match.room) return;
        setMessage("Gegner gefunden. Beide Verbindungen werden bestätigt …");
        confirmMatchReady(match);
      });

      channel.on("broadcast", { event: "match-ready" }, ({ payload }) => {
        if (!pendingMatch || payload?.room !== pendingMatch.room || (payload.by !== pendingMatch.whiteId && payload.by !== pendingMatch.blackId)) return;
        pendingMatch.readyPlayers.add(payload.by);
        maybeOpenMatch();
      });

      const reconcileQueue = () => {
        const allPlayers = Object.values(channel.presenceState())
          .flat()
          .map((presence) => presence as unknown as LobbyPlayer)
          .filter((presence) => typeof presence.playerId === "string" && typeof presence.queuedAt === "number")
          // Do not expire players using this browser's clock. Realtime presence
          // already drops disconnected clients, while client clocks can differ
          // and otherwise make each browser see a different queue.
          .sort((first, second) => first.queuedAt - second.queuedAt || first.playerId.localeCompare(second.playerId));

        setQueueCount(Math.max(1, allPlayers.length));
        if (allPlayers.length < 2 || matchedRef.current) return;

        const whitePlayer = allPlayers[0];
        const blackPlayer = allPlayers[1];
        if (playerId === whitePlayer.playerId || playerId === blackPlayer.playerId) {
          const match = getPendingMatch(whitePlayer.playerId, blackPlayer.playerId, whitePlayer.username || "Gast", blackPlayer.username || "Gast");
          if (!match) return;
          setMessage("Gegner gefunden. Beide Verbindungen werden bestätigt …");
          if (!match.proposalSent) {
            match.proposalSent = true;
            void channel.send({
              type: "broadcast",
              event: "match-proposed",
              payload: { room: match.room, whiteId: match.whiteId, blackId: match.blackId, whiteName: match.whiteName, blackName: match.blackName, controlId: selectedControl.id },
            }).then((status) => {
              if (status === "ok") confirmMatchReady(match);
              else {
                match.proposalSent = false;
                setMessage("Die Verbindung zum Gegner konnte nicht bestätigt werden. Bitte starte die Suche erneut.");
              }
            });
          }
        }
      };

      // `sync` is only the initial/full snapshot. A player who was already
      // waiting receives later arrivals as `join`, so both events must
      // reconcile the queue or the first player can wait forever.
      channel.on("presence", { event: "sync" }, reconcileQueue);
      channel.on("presence", { event: "join" }, reconcileQueue);
      channel.on("presence", { event: "leave" }, reconcileQueue);

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ playerId, username: usernameRef.current, queuedAt: Date.now() });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSearching(false);
          setMessage("Die Online-Verbindung konnte nicht aufgebaut werden. Bitte prüfe deine Internetverbindung und versuche es erneut.");
        }
      });
    } catch (error) {
      console.error("Online-Suche konnte nicht gestartet werden:", error);
      setSearching(false);
      setMessage("Die Online-Suche ist gerade nicht verfügbar. Bitte versuche es später erneut.");
    }
  }

  async function cancelSearch() {
    matchedRef.current = true;
    const channel = channelRef.current;
    channelRef.current = null;
    playerIdRef.current = null;
    setSearching(false);
    setQueueCount(0);
    setMessage("");
    if (channel) await createClient().removeChannel(channel);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Zur Startseite</Link>

        <header className="mt-8 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Spielen · Online</p>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">Finde einen Gegner</h1>
          <p className="mt-4 text-lg leading-7 text-slate-300">Wähle deine Bedenkzeit und wir suchen jemanden, der dieselbe Partie spielen möchte.</p>
        </header>

        <section className="mt-6 rounded-2xl border border-neutral-800 bg-black p-3 sm:p-5" aria-labelledby="clock-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="clock-heading" className="text-lg font-bold">Bedenkzeit</h2>
              <p className="mt-1 text-xs text-neutral-400">Zahl nach dem Plus: Sekunden Zuschlag pro Zug.</p>
            </div>
            <span className="rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-xs text-neutral-300">Ungewertet</span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {ONLINE_TIME_CONTROLS.map((control) => {
              const selected = selectedControl.id === control.id;
              return (
                <button
                  key={control.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={searching}
                  onClick={() => setSelectedControl(control)}
                  className={"min-h-14 rounded-xl border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-60 " + (selected ? "border-amber-300 bg-amber-300/10 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]" : "border-neutral-800 bg-neutral-950 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900")}
                >
                  <span className="block text-sm font-bold tabular-nums">{control.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{control.group}{control.incrementSeconds ? ` · +${control.incrementSeconds}s` : ""}</span>
                </button>
              );
            })}
          </div>

          {!searching ? (
            <button type="button" onClick={() => void startSearch()} className="mt-4 min-h-11 w-full rounded-xl bg-amber-300 px-5 py-3 text-sm font-bold text-black transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100 sm:w-auto sm:min-w-56">
              Gegner suchen · {selectedControl.label}
            </button>
          ) : (
            <div className="mt-7 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-900 bg-emerald-950/40 p-4" role="status" aria-live="polite">
              <span className="flex h-10 w-10 animate-pulse items-center justify-center rounded-full bg-emerald-400/15 text-xl text-emerald-300">♟</span>
              <div className="min-w-48 flex-1">
                <p className="font-semibold">Suche nach einem Gegner …</p>
                <p className="mt-1 text-sm text-slate-400">{queueCount > 1 ? `${queueCount - 1} weitere Person${queueCount === 2 ? "" : "en"} in dieser Bedenkzeit` : "Du bist in der Warteschlange."}</p>
              </div>
              <button type="button" onClick={() => void cancelSearch()} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">Suche abbrechen</button>
            </div>
          )}

          {message && <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300" role="status">{message}</p>}
        </section>

      </div>
    </main>
  );
}
