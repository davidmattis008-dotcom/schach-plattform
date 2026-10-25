"use client";

import Link from "next/link";
import { Chess, type Square } from "chess.js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChessPieceIcon } from "@/components/chess-piece";
import { describeMaterialAdvantage, getMaterialAdvantage } from "@/lib/chess/material";
import { formatClock, getOnlineRatingMode, getOnlineRatingModeLabel, type OnlineRatingMode } from "../protocol";
import { saveOnlineGame, type OnlineGameRecord, type SavedMove } from "../history-store";
type MatchConfig = { room: string; player: string; opponent: string; white: boolean; initialSeconds: number; incrementSeconds: number; ratingMode: OnlineRatingMode; rated: boolean; whiteName: string; blackName: string };
type ClockState = { whiteMs: number; blackMs: number; lastTick: number };
type MovePayload = { from: string; to: string; promotion?: string; by: string; whiteMs: number; blackMs: number };
type MatchEnd = { result: "1-0" | "0-1" | "1/2-1/2"; reason: string };

function moveSnapshot(game: Chess): SavedMove[] {
  return game.history({ verbose: true }).map((move) => ({
    san: move.san,
    color: move.color,
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
  }));
}

function monotonicNow() {
  return performance.now();
}

function gameFromMoves(moves: SavedMove[]) {
  const restored = new Chess();
  for (const move of moves) {
    restored.move({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  }
  return restored;
}

export default function OnlineGamePage() {
  const [config, setConfig] = useState<MatchConfig | null>(null);
  const [pageError, setPageError] = useState("");
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [started, setStarted] = useState(false);
  const [game, setGame] = useState(() => new Chess());
  const gameRef = useRef(game);
  const [moves, setMoves] = useState<SavedMove[]>([]);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const movesRef = useRef<SavedMove[]>([]);
  const [clocks, setClocks] = useState({ whiteMs: 0, blackMs: 0 });
  const clocksRef = useRef<ClockState>({ whiteMs: 0, blackMs: 0, lastTick: 0 });
  const [finished, setFinished] = useState<MatchEnd | null>(null);
    const [ratingMessage, setRatingMessage] = useState("");
    const [archiveMessage, setArchiveMessage] = useState("");
  const finishedRef = useRef<MatchEnd | null>(null);
  const finishGameRef = useRef<(end: MatchEnd, broadcast?: boolean) => void>(() => undefined);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const startedRef = useRef(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Square[]>([]);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [incomingDrawOffer, setIncomingDrawOffer] = useState(false);
  const displayedGame = useMemo(
    () => viewPly === null ? game : gameFromMoves(moves.slice(0, viewPly)),
    [game, moves, viewPly],
  );

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room") ?? "";
    const player = params.get("player") ?? "";
    const opponent = params.get("opponent") ?? "";
    const white = params.get("white") === "true";
    const initialSeconds = Number(params.get("initial"));
    const incrementSeconds = Number(params.get("increment"));
    const rated = params.get("rated") !== "false";
    const safeName = (value: string | null) => value?.trim().slice(0, 20) || "Gast";
    const whiteName = safeName(params.get("whiteName"));
    const blackName = safeName(params.get("blackName"));
    const expectedRoom = [player, opponent].sort().join("_");

    if (!player || !opponent || !room || room !== expectedRoom || !Number.isFinite(initialSeconds) || initialSeconds < 30 || !Number.isFinite(incrementSeconds) || incrementSeconds < 0 || incrementSeconds > 60) {
      queueMicrotask(() => {
        if (active) setPageError("Diese Partie-Adresse ist ungültig. Öffne eine neue Partie über Freunde.");
      });
      return;
    }

    const ratingMode = getOnlineRatingMode(initialSeconds, incrementSeconds);
    const matchConfig = { room, player, opponent, white, initialSeconds, incrementSeconds, ratingMode, rated, whiteName, blackName };
    queueMicrotask(() => {
      if (!active) return;
      setConfig(matchConfig);
      gameRef.current = new Chess();
      setGame(gameRef.current);
      movesRef.current = [];
      setMoves([]);
      setViewPly(null);
      finishedRef.current = null;
      setFinished(null);
      startedRef.current = false;
      const initialMs = initialSeconds * 1000;
      clocksRef.current = { whiteMs: initialMs, blackMs: initialMs, lastTick: 0 };
      setClocks({ whiteMs: initialMs, blackMs: initialMs });
    });
    return () => {
      active = false;
    };
  }, []);

  function saveEnd(end: MatchEnd, match: MatchConfig) {
    const wonColor = end.result === "1-0" ? "w" : end.result === "0-1" ? "b" : null;
    const myColor: OnlineGameRecord["color"] = match.white ? "w" : "b";
    const result: OnlineGameRecord["result"] = wonColor === null ? "draw" : wonColor === myColor ? "win" : "loss";
    const record = {
      id: match.room,
      playedAt: new Date().toISOString(),
      timeControl: `${Math.floor(match.initialSeconds / 60)}+${match.incrementSeconds}`,
      color: myColor,
      whiteName: match.whiteName,
      blackName: match.blackName,
      result,
      resultText: result === "win" ? "Gewonnen" : result === "loss" ? "Verloren" : "Remis",
      reason: end.reason,
      moves: movesRef.current,
    };
    saveOnlineGame(record);
    void (async () => {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          setArchiveMessage("Diese Partie wurde auf diesem Gerät gespeichert. Melde dich an, damit dein Verlauf synchronisiert wird.");
          return;
        }
        const { error } = await supabase.rpc("save_my_online_game", { p_record: record });
        if (error) throw error;
        setArchiveMessage("Partie im Konto gespeichert und synchronisiert.");
      } catch (error) {
        console.error("Partie konnte nicht mit dem Konto synchronisiert werden:", error);
        setArchiveMessage("Partie auf diesem Gerät gespeichert; die Kontosynchronisierung ist fehlgeschlagen.");
      }
    })();
  }

  async function saveOnlineRating(end: MatchEnd, match: MatchConfig) {
    if (!match.rated) {
      setRatingMessage("Ungewertete Partie");
      return;
    }
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRatingMessage("Melde dich an, damit deine Online-Elo gespeichert wird.");
        return;
      }
      const result = end.result === "1-0" ? "white" : end.result === "0-1" ? "black" : "draw";
      const { data, error } = await supabase.rpc("record_online_chess_result", {
        p_game_id: match.room,
        p_game_mode: match.ratingMode,
        p_white_username: match.whiteName,
        p_black_username: match.blackName,
        p_result: result,
      });
      const rating = data as { rating?: number; delta?: number } | null;
      if (error || typeof rating?.delta !== "number") {
        setRatingMessage("Die Elo-Wertung konnte nicht gespeichert werden.");
        return;
      }
      setRatingMessage("Elo " + getOnlineRatingModeLabel(match.ratingMode) + ": " + (rating.delta > 0 ? "+" : "") + rating.delta + " · neu " + rating.rating);
    } catch {
      setRatingMessage("Die Elo-Wertung konnte nicht gespeichert werden.");
    }
  }

function finishGame(end: MatchEnd, broadcast = false) {
    if (!config || finishedRef.current) return;
    finishedRef.current = end;
    setFinished(end);
    startedRef.current = false;
    setStarted(false);
    setPromotion(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
    saveEnd(end, config);
    setRatingMessage("");
    void saveOnlineRating(end, config);
    if (broadcast && channelRef.current) {
      void channelRef.current.send({ type: "broadcast", event: "game-end", payload: { by: config.player, ...end } });
    }
  }
  useEffect(() => {
    finishGameRef.current = finishGame;
  });

  useEffect(() => {
    if (!config) return;
    let active = true;
    const supabase = createClient();
    const channel = supabase.channel("online-match-" + config.room, {
      config: { private: true, presence: { key: config.player }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    const askForSnapshot = () => {
      void channel.send({ type: "broadcast", event: "snapshot-request", payload: { by: config.player } });
    };

    const reconcilePlayers = () => {
      if (!active) return;
      const connectedPlayers = Object.values(channel.presenceState())
        .flat()
        .map((presence) => (presence as unknown as { playerId?: string }).playerId)
        .filter((playerId): playerId is string => Boolean(playerId));
      const bothConnected = connectedPlayers.includes(config.player) && connectedPlayers.includes(config.opponent);
      setOpponentOnline(connectedPlayers.includes(config.opponent));
      if (bothConnected && !startedRef.current && !finishedRef.current) {
        startedRef.current = true;
        clocksRef.current.lastTick = monotonicNow();
        setStarted(true);
      }
      if (bothConnected) askForSnapshot();
    };

    // The initial/full state arrives as `sync`; subsequent arrivals and
    // disconnects are `join`/`leave`. Reconcile all three so the first player
    // does not remain stuck waiting after the opponent has joined.
    channel.on("presence", { event: "sync" }, reconcilePlayers);
    channel.on("presence", { event: "join" }, reconcilePlayers);
    channel.on("presence", { event: "leave" }, reconcilePlayers);

    channel.on("broadcast", { event: "snapshot-request" }, ({ payload }) => {
      if (!active || payload?.by === config.player) return;
      void channel.send({
        type: "broadcast",
        event: "snapshot",
        payload: {
          by: config.player,
          moves: movesRef.current,
          whiteMs: clocksRef.current.whiteMs,
          blackMs: clocksRef.current.blackMs,
          finished: finishedRef.current,
        },
      });
    });

    channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
      if (!active || payload?.by === config.player || !Array.isArray(payload?.moves)) return;
      try {
        const restored = gameFromMoves(payload.moves as SavedMove[]);
        gameRef.current = restored;
        setGame(new Chess(restored.fen()));
        movesRef.current = moveSnapshot(restored);
        setMoves(movesRef.current);
        const whiteMs = Number(payload.whiteMs);
        const blackMs = Number(payload.blackMs);
        if (Number.isFinite(whiteMs) && Number.isFinite(blackMs)) {
          clocksRef.current = { whiteMs, blackMs, lastTick: monotonicNow() };
          setClocks({ whiteMs, blackMs });
        }
        if (payload.finished && (payload.finished.result === "1-0" || payload.finished.result === "0-1" || payload.finished.result === "1/2-1/2")) {
          finishGameRef.current(payload.finished as MatchEnd);
        }
      } catch {
        setPageError("Der Partieverlauf konnte nicht mit deinem Gegner abgeglichen werden. Bitte starte eine neue Partie.");
      }
    });

    channel.on("broadcast", { event: "move" }, ({ payload }) => {
      if (!active || payload?.by === config.player) return;
      try {
        const current = gameRef.current;
        current.move({ from: payload.from as Square, to: payload.to as Square, ...(payload.promotion ? { promotion: payload.promotion } : {}) });
        gameRef.current = current;
        setGame(new Chess(current.fen()));
        movesRef.current = moveSnapshot(current);
        setMoves(movesRef.current);
        if (Number.isFinite(payload.whiteMs) && Number.isFinite(payload.blackMs)) {
          clocksRef.current = { whiteMs: payload.whiteMs, blackMs: payload.blackMs, lastTick: monotonicNow() };
          setClocks({ whiteMs: payload.whiteMs, blackMs: payload.blackMs });
        }
        if (current.isCheckmate()) finishGameRef.current({ result: current.turn() === "w" ? "0-1" : "1-0", reason: "Schachmatt" }, true);
        else if (current.isDraw()) finishGameRef.current({ result: "1/2-1/2", reason: current.isStalemate() ? "Patt" : "Remis" }, true);
      } catch {
        askForSnapshot();
      }
    });

    channel.on("broadcast", { event: "game-end" }, ({ payload }) => {
      if (!active || payload?.by === config.player) return;
      if (payload.result === "1-0" || payload.result === "0-1" || payload.result === "1/2-1/2") {
        finishGameRef.current({ result: payload.result, reason: typeof payload.reason === "string" ? payload.reason : "Partie beendet" });
      }
    });

    channel.on("broadcast", { event: "draw-offer" }, ({ payload }) => {
      if (active && payload?.by !== config.player) setIncomingDrawOffer(true);
    });
    channel.on("broadcast", { event: "draw-response" }, ({ payload }) => {
      if (!active || payload?.by === config.player) return;
      setDrawOffered(false);
      if (payload?.accepted) finishGameRef.current({ result: "1/2-1/2", reason: "Remis vereinbart" }, true);
    });

    channel.subscribe((status) => {
      if (!active) return;
      if (status === "SUBSCRIBED") {
        void channel.track({ playerId: config.player });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setPageError("Die Verbindung zur Partie ist abgebrochen. Lade die Seite neu, sobald du wieder online bist.");
      }
    });

    return () => {
      active = false;
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [config]);

  useEffect(() => {
    if (!started || !config || config.initialSeconds === 0) return;
    const timer = window.setInterval(() => {
      if (!startedRef.current || finishedRef.current) return;
      const now = monotonicNow();
      const elapsed = Math.max(0, now - clocksRef.current.lastTick);
      clocksRef.current.lastTick = now;
      const key = gameRef.current.turn() === "w" ? "whiteMs" : "blackMs";
      const remaining = Math.max(0, clocksRef.current[key] - elapsed);
      clocksRef.current[key] = remaining;
      setClocks({ whiteMs: clocksRef.current.whiteMs, blackMs: clocksRef.current.blackMs });
      if (remaining === 0) {
        const winner = key === "whiteMs" ? "0-1" : "1-0";
        finishGameRef.current({ result: winner, reason: "Zeit abgelaufen" }, true);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [started, config]);

  function advanceClockBeforeMove() {
    if (!config || config.initialSeconds === 0) return;
    const now = monotonicNow();
    const elapsed = Math.max(0, now - clocksRef.current.lastTick);
    clocksRef.current.lastTick = now;
    const key = gameRef.current.turn() === "w" ? "whiteMs" : "blackMs";
    clocksRef.current[key] = Math.max(0, clocksRef.current[key] - elapsed);
    setClocks({ whiteMs: clocksRef.current.whiteMs, blackMs: clocksRef.current.blackMs });
    if (clocksRef.current[key] === 0) {
      finishGameRef.current({ result: key === "whiteMs" ? "0-1" : "1-0", reason: "Zeit abgelaufen" }, true);
    }
  }

  function commitMove(from: Square, to: Square, promotionPiece = "q") {
    if (!config || !startedRef.current || finishedRef.current || !opponentOnline) return;
    const current = gameRef.current;
    if ((current.turn() === "w") !== config.white) return;
    advanceClockBeforeMove();
    if (finishedRef.current) return;

    try {
      const move = current.move({ from, to, promotion: promotionPiece });
      if (config.initialSeconds > 0) {
        const key = move.color === "w" ? "whiteMs" : "blackMs";
        clocksRef.current[key] += config.incrementSeconds * 1000;
      }
      clocksRef.current.lastTick = monotonicNow();
      gameRef.current = current;
      setGame(new Chess(current.fen()));
      movesRef.current = moveSnapshot(current);
      setMoves(movesRef.current);
      setClocks({ whiteMs: clocksRef.current.whiteMs, blackMs: clocksRef.current.blackMs });
      setSelectedSquare(null);
      setPossibleMoves([]);
      setPromotion(null);
      if (channelRef.current) {
        const payload: MovePayload = {
          from: move.from,
          to: move.to,
          ...(move.promotion ? { promotion: move.promotion } : {}),
          by: config.player,
          whiteMs: clocksRef.current.whiteMs,
          blackMs: clocksRef.current.blackMs,
        };
        void channelRef.current.send({ type: "broadcast", event: "move", payload });
      }
      if (current.isCheckmate()) finishGame({ result: current.turn() === "w" ? "0-1" : "1-0", reason: "Schachmatt" }, true);
      else if (current.isDraw()) finishGame({ result: "1/2-1/2", reason: current.isStalemate() ? "Patt" : "Remis" }, true);
    } catch {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  function viewPosition(ply: number | null) {
    setViewPly(ply === null || ply >= moves.length ? null : Math.max(0, ply));
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function handleSquareClick(square: Square) {
    if (viewPly !== null || !config || finished || !started || !opponentOnline || (game.turn() === "w") !== config.white) return;
    const current = gameRef.current;
    if (selectedSquare && possibleMoves.includes(square)) {
      const piece = current.get(selectedSquare);
      if (piece?.type === "p" && ((piece.color === "w" && square.endsWith("8")) || (piece.color === "b" && square.endsWith("1")))) {
        setPromotion({ from: selectedSquare, to: square });
      } else commitMove(selectedSquare, square);
      return;
    }
    const piece = current.get(square);
    if (piece && piece.color === current.turn()) {
      setSelectedSquare(square);
      setPossibleMoves(current.moves({ square, verbose: true }).map((move) => move.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  function offerDraw() {
    if (!config || !channelRef.current || finished) return;
    setDrawOffered(true);
    void channelRef.current.send({ type: "broadcast", event: "draw-offer", payload: { by: config.player } });
  }

  function respondToDraw(accepted: boolean) {
    if (!config || !channelRef.current) return;
    setIncomingDrawOffer(false);
    void channelRef.current.send({ type: "broadcast", event: "draw-response", payload: { by: config.player, accepted } });
    if (accepted) finishGame({ result: "1/2-1/2", reason: "Remis vereinbart" }, true);
  }

  function resign() {
    if (!config || finished) return;
    finishGame({ result: config.white ? "0-1" : "1-0", reason: "Aufgabe" }, true);
  }

  const boardRows = displayedGame.board();
  const shownRows = config && !config.white ? boardRows.slice().reverse().map((row) => row.slice().reverse()) : boardRows;
  const whoseTurn = game.turn() === "w" ? "Weiß" : "Schwarz";
  const material = describeMaterialAdvantage(getMaterialAdvantage(game), config?.white ? "w" : "b");
  const localTurn = config ? (game.turn() === "w") === config.white : false;
  const endMessage = finished
    ? finished.result === "1/2-1/2" ? `Remis · ${finished.reason}` : (finished.result === (config?.white ? "1-0" : "0-1") ? "Du gewinnst" : "Dein Gegner gewinnt") + ` · ${finished.reason}`
    : null;

  if (pageError) return <main className="min-h-screen bg-slate-950 px-5 py-16 text-white"><div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6"><h1 className="text-2xl font-bold">Partie nicht verfügbar</h1><p className="mt-3 text-slate-300">{pageError}</p><Link href="/freunde" className="mt-6 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950">Freunde</Link></div></main>;
  if (!config) return <main className="min-h-screen bg-slate-950 p-10 text-center text-slate-300">Partie wird vorbereitet …</main>;

  const whiteClock = config.initialSeconds === 0 ? "∞" : formatClock(clocks.whiteMs);
  const blackClock = config.initialSeconds === 0 ? "∞" : formatClock(clocks.blackMs);
  const gameStatus = endMessage ?? (!opponentOnline ? "Warte, bis dein Gegner der Partie beitritt …" : !started ? "Verbinde beide Spieler …" : game.isCheckmate() ? "Schachmatt" : game.isStalemate() ? "Patt" : game.inCheck() ? `Schach · ${whoseTurn} am Zug` : `${whoseTurn} am Zug`);

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/freunde" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Freunde</Link>
          <span className="rounded-full border border-slate-800 px-3 py-1 text-xs font-medium text-slate-400">Ungewertete Online-Partie</span>
        </div>
        <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center font-semibold" role="status" aria-live="polite">{gameStatus}</div>

        <div className="mx-auto flex max-w-4xl flex-col gap-4 lg:flex-row lg:items-start">
          <section className="min-w-0 flex-1" aria-label="Schachpartie">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
              <span className="font-semibold">{config.white ? config.blackName : config.whiteName}</span>
              <span className={"rounded-lg px-3 py-1.5 font-mono text-xl font-bold tabular-nums " + ((config.white ? game.turn() === "b" : game.turn() === "w") && started && !finished ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-white")}>{config.white ? blackClock : whiteClock}</span>
            </div>

            <div className="overflow-hidden rounded-xl chessboard-frame shadow-2xl">
              <div className="grid aspect-square grid-cols-8 grid-rows-8">
                {shownRows.map((row, rowIndex) => row.map((piece, colIndex) => {
                  const square = (!config.white
                    ? String.fromCharCode(104 - colIndex) + (rowIndex + 1)
                    : String.fromCharCode(97 + colIndex) + (8 - rowIndex)) as Square;
                  const light = (rowIndex + colIndex) % 2 === 1;
                  const selected = selectedSquare === square;
                  const target = possibleMoves.includes(square);
                  return (
                    <button key={square} type="button" aria-label={square + (piece ? `, ${piece.color === "w" ? "weiße" : "schwarze"} Figur` : "")} onClick={() => handleSquareClick(square)} disabled={viewPly !== null || !localTurn || !started || !opponentOnline || Boolean(finished)}
                      className={"relative flex h-full w-full items-center justify-center p-0 " + (light ? "chessboard-light" : "chessboard-dark") + (selected ? " ring-4 ring-inset ring-amber-300" : "") + " disabled:cursor-default"}>
                      {piece && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><ChessPieceIcon color={piece.color} type={piece.type} /></span>}{colIndex === 0 && <span aria-hidden="true" className={"pointer-events-none absolute left-1 top-0.5 z-10 text-[9px] font-bold sm:text-xs " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{square[1]}</span>}{rowIndex === 7 && <span aria-hidden="true" className={"pointer-events-none absolute bottom-0 right-1 z-10 text-[9px] font-bold sm:text-xs " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{square[0].toUpperCase()}</span>}
                      {target && <span aria-hidden="true" className={"absolute h-3 w-3 rounded-full " + (piece ? "chessboard-capture-target" : "chessboard-move-target")} />}
                    </button>
                  );
                }))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
              <span className="font-semibold">{config.white ? config.whiteName : config.blackName}</span>
              <span className={"rounded-lg px-3 py-1.5 font-mono text-xl font-bold tabular-nums " + ((config.white ? game.turn() === "w" : game.turn() === "b") && started && !finished ? "bg-emerald-400 text-slate-950" : "bg-slate-800 text-white")}>{config.white ? whiteClock : blackClock}</span>
            </div>
            {viewPly !== null && (
              <p className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
                <span>Frühere Stellung nach {viewPly} von {moves.length} Halbzügen. Die Partie läuft unverändert weiter.</span>
                <button type="button" onClick={() => viewPosition(null)} className="shrink-0 underline underline-offset-4">Live-Stellung</button>
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
              <button type="button" onClick={() => viewPosition(Math.max(0, (viewPly ?? moves.length) - 1))} disabled={(viewPly ?? moves.length) === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">← Zurück</button>
              <span className="text-xs tabular-nums text-slate-400">{viewPly ?? moves.length} / {moves.length}</span>
              <button type="button" onClick={() => viewPosition(Math.min(moves.length, (viewPly ?? moves.length) + 1))} disabled={(viewPly ?? moves.length) >= moves.length} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Weiter →</button>
            </div>
          </section>

          <aside className="flex w-full flex-col gap-4 lg:w-72">
            <section className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4" aria-live="polite" aria-label={`Materialbilanz: ${material.description}`}>
              <div><h2 className="text-sm font-semibold text-slate-300">Figurenpunkte</h2><p className="mt-1 text-sm text-slate-400">{material.description}</p></div>
              <span className={`text-2xl font-bold tabular-nums ${material.ahead ? "text-emerald-300" : material.score === "0" ? "text-slate-200" : "text-rose-300"}`}>{material.score}</span>
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-3"><span className={"h-2.5 w-2.5 rounded-full " + (opponentOnline ? "bg-emerald-400" : "bg-amber-400")} /><div><h2 className="font-semibold">{config.white ? config.blackName : config.whiteName}</h2><p className="text-sm text-slate-400">{opponentOnline ? "Verbunden" : "Verbindung wird hergestellt"}</p></div></div>
              <p className="mt-4 border-t border-slate-800 pt-3 text-sm text-slate-400">Bedenkzeit: {config.initialSeconds === 0 ? "ohne Uhr" : `${Math.floor(config.initialSeconds / 60)}+${config.incrementSeconds}`}</p>
            </section>

            <section className="min-h-52 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 font-semibold">Zugfolge</h2>
              {moves.length === 0 ? <p className="text-sm text-slate-500">Die Partie beginnt, sobald beide verbunden sind.</p> : <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto text-sm">{moves.map((move, index) => <button type="button" key={index} onClick={() => viewPosition(index + 1)} className={"rounded-lg px-3 py-2 text-left " + ((viewPly ?? moves.length) === index + 1 ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800")}><span className="mr-2 text-slate-500">{move.color === "w" ? `${Math.floor(index / 2) + 1}.` : ""}</span>{move.san}</button>)}</div>}
            </section>

            {!finished ? (
              <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                {incomingDrawOffer ? <div className="rounded-xl border border-amber-900 bg-amber-950/40 p-3"><p className="text-sm font-medium">Dein Gegner bietet Remis an.</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => respondToDraw(true)} className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-bold text-slate-950">Annehmen</button><button type="button" onClick={() => respondToDraw(false)} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm">Ablehnen</button></div></div> : <button type="button" onClick={offerDraw} disabled={drawOffered || !opponentOnline} className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{drawOffered ? "Remis angeboten" : "Remis anbieten"}</button>}
                <button type="button" onClick={resign} disabled={!started} className="w-full rounded-xl border border-rose-950 px-4 py-3 text-sm font-semibold text-rose-300 hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50">Aufgeben</button>
              </section>
            ) : (
              <div className="rounded-2xl border border-emerald-900 bg-emerald-950/30 p-4"><p className="font-bold text-emerald-200">Partie beendet</p>{ratingMessage && <p className="mt-1 text-sm text-emerald-200">{ratingMessage}</p>}<p className="mt-1 text-sm text-slate-300">{archiveMessage || "Partie auf diesem Gerät gespeichert …"}</p><div className="mt-4 flex flex-wrap gap-4"><Link href="/partien" className="font-semibold text-emerald-300 underline underline-offset-4">Zum Partieverlauf</Link></div></div>
            )}
          </aside>
        </div>

        {promotion && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="promotion-title"><div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><h2 id="promotion-title" className="text-xl font-bold">Bauer umwandeln</h2><div className="mt-4 grid grid-cols-4 gap-2">{([{ piece: "q", label: "Dame" }, { piece: "r", label: "Turm" }, { piece: "b", label: "Läufer" }, { piece: "n", label: "Springer" }] as const).map(({ piece, label }) => <button key={piece} type="button" onClick={() => commitMove(promotion.from, promotion.to, piece)} className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950 p-3 text-center hover:border-emerald-400"><ChessPieceIcon color={game.get(promotion.from)?.color ?? "w"} type={piece} /><span className="mt-1 text-xs">{label}</span></button>)}</div><button type="button" onClick={() => setPromotion(null)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Abbrechen</button></div></div>}
      </div>
    </main>
  );
}
