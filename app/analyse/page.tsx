"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { getTacticsDifficulty, getTacticsTheme, tacticsPuzzles, type TacticsPuzzle } from "@/lib/tactics";
import { createClient } from "@/lib/supabase/client";

const START_FEN = new Chess().fen();
const PIECES: Record<string, string> = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
};
type EvalInfo = { score: string; depth: string; line: string };
type SavedTacticRow = { puzzle_id: string; saved_at: string };

export default function AnalysePage() {
  const [pgn, setPgn] = useState("");
  const [moves, setMoves] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([START_FEN]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [evaluation, setEvaluation] = useState<EvalInfo | null>(null);
  const [engineError, setEngineError] = useState("");
  const [savedPuzzles, setSavedPuzzles] = useState<TacticsPuzzle[]>([]);
  const [savedPuzzleMessage, setSavedPuzzleMessage] = useState("");
  const [savedPuzzlesLoading, setSavedPuzzlesLoading] = useState(true);
  const [analysisPuzzleId, setAnalysisPuzzleId] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState(""); const [sheetFile, setSheetFile] = useState<File | null>(null); const [ocrStatus, setOcrStatus] = useState(""); const [ocrBusy, setOcrBusy] = useState(false); const [manualMove, setManualMove] = useState<{ index: number; token: string; fen: string } | null>(null); const [manualSan, setManualSan] = useState(""); const [ocrTokens, setOcrTokens] = useState<string[]>([]); const [acceptedOcrMoves, setAcceptedOcrMoves] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const game = useMemo(() => new Chess(positions[moveIndex] ?? START_FEN), [positions, moveIndex]);
  const board = game.board();
  const legalTargets = selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((move) => move.to)
    : [];

  function loadTacticsPuzzle(puzzle: TacticsPuzzle) {
    try {
      const position = new Chess(puzzle.fen);
      if (puzzle.setupMove) {
        position.move({
          from: puzzle.setupMove.slice(0, 2) as Square,
          to: puzzle.setupMove.slice(2, 4) as Square,
          ...(puzzle.setupMove.length === 5 ? { promotion: puzzle.setupMove[4] } : {}),
        });
      }
      setPgn("");
      setMoves([]);
      setPositions([position.fen()]);
      setMoveIndex(0);
      setSelectedSquare(null);
      setPromotionPending(null);
      setEvaluation(null);
      setAnalyzing(false);
      setAnalysisPuzzleId(puzzle.id);
      setMessage(`Taktikaufgabe ${puzzle.id} geladen. Spiele Züge am Brett und analysiere die Stellung mit Stockfish.`);
      setEngineError("");
      workerRef.current?.postMessage("stop");
    } catch (loadError) {
      console.error("Gespeicherte Taktikaufgabe konnte nicht geladen werden:", loadError);
      setSavedPuzzleMessage("Diese Taktikaufgabe konnte nicht geladen werden.");
    }
  }

  useEffect(() => {
    let worker: Worker | undefined;
    try {
      worker = new Worker("/stockfish/stockfish-19-lite-single.js");
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<string>) => {
        const text = String(event.data);
        if (text.includes("uciok")) {
          worker?.postMessage("setoption name Threads value 1");
          worker?.postMessage("setoption name Hash value 16");
          worker?.postMessage("isready");
        }
        if (text.includes("readyok")) setEngineReady(true);
        if (text.startsWith("info ")) {
          const depth = text.match(/depth (\d+)/)?.[1];
          const score = text.match(/score (cp|mate) (-?\d+)/);
          const line = text.match(/\spv (.+)$/)?.[1];
          if (depth && score) {
            setEvaluation({
              depth,
              score: score[1] === "mate"
                ? "Matt in " + Math.abs(Number(score[2]))
                : (Number(score[2]) / 100).toFixed(2),
              line: line ?? "",
            });
          }
        }
        if (text.startsWith("bestmove")) setAnalyzing(false);
      };
      worker.onerror = () => {
        setEngineError("Stockfish konnte nicht geladen werden. Bitte lade die Seite neu.");
        setAnalyzing(false);
      };
      worker.postMessage("uci");
    } catch {
      setEngineError("Dieser Browser konnte Stockfish nicht starten.");
    }
    return () => {
      workerRef.current = null;
      worker?.terminate();
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSavedTactics() {
      try {
        const client = createClient();
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          if (active) setSavedPuzzleMessage("Melde dich an, um deine gespeicherten Taktikaufgaben zu sehen.");
          return;
        }
        const { data, error: savedError } = await client.rpc("list_my_saved_tactics");
        if (savedError) throw savedError;
        if (!active) return;
        const rows = (data ?? []) as SavedTacticRow[];
        setSavedPuzzles(rows.flatMap((row) => {
          const puzzle = tacticsPuzzles.find((item) => item.id === row.puzzle_id);
          return puzzle ? [puzzle] : [];
        }));
        setSavedPuzzleMessage("");
      } catch (loadError) {
        console.error("Gespeicherte Taktikaufgaben konnten nicht geladen werden:", loadError);
        if (active) setSavedPuzzleMessage("Deine gespeicherten Taktikaufgaben konnten nicht geladen werden.");
      } finally {
        if (active) setSavedPuzzlesLoading(false);
      }
    }
    void loadSavedTactics();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const puzzleId = new URLSearchParams(window.location.search).get("puzzle");
      if (!puzzleId) return;
      const puzzle = tacticsPuzzles.find((item) => item.id === puzzleId);
      if (puzzle) loadTacticsPuzzle(puzzle);
      else setMessage("Die angeforderte Taktikaufgabe wurde nicht gefunden.");
    });
    return () => { active = false; };
  }, []);

  function loadPgn(source: string) {
    try {
      const parsed = new Chess();
      parsed.loadPgn(source);
      const headers = parsed.header();
      const replay = new Chess(headers.FEN || START_FEN);
      const sanMoves = parsed.history();
      const nextPositions = [replay.fen()];
      sanMoves.forEach((san) => {
        replay.move(san);
        nextPositions.push(replay.fen());
      });
      setPgn(source);
      setMoves(sanMoves);
      setPositions(nextPositions);
      setMoveIndex(sanMoves.length);
      setSelectedSquare(null);
      setPromotionPending(null);
      setEvaluation(null);
      setAnalysisPuzzleId(null);
      setMessage(sanMoves.length ? sanMoves.length + " Züge geladen." : "Partie geladen. Noch keine Züge gefunden.");
      setEngineError("");
    } catch {
      setMessage("Die PGN konnte nicht gelesen werden. Bitte prüfe die Zugnotation.");
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then(loadPgn).catch(() => setMessage("Die Datei konnte nicht gelesen werden."));
  }

  function processOcrTokens(tokens: string[], start: number, current: Chess, accepted: string[]) { for (let index = start; index < tokens.length; index += 1) { let rawToken = tokens[index].trim(); if (/^[KDTLS]$/i.test(rawToken) && tokens[index + 1]) { rawToken += tokens[index + 1].trim(); index += 1; } let token = rawToken.replace(/^[0-9]+\.{1,3}/, "").replace(/^[0-9]+$/, "").replace(/[!?+#.,;:]+$/g, "").replace(/^0-0-0$/i, "O-O-O").replace(/^0-0$/i, "O-O").replace(/^[KDTLS](?=[a-h1-8x=])/i, (letter) => ({ D: "Q", T: "R", L: "B", S: "N", K: "K" }[letter.toUpperCase()] ?? letter)).replace(/^0-0-0$/i, "O-O-O").replace(/^0-0$/i, "O-O").replace(/^[KDTLS](?=[a-h1-8x=])/i, (letter) => ({ D: "Q", T: "R", L: "B", S: "N", K: "K" }[letter.toUpperCase()] ?? letter)); if (!/^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)$/i.test(token)) continue; try { const result = current.move(token); accepted.push(result.san); } catch { setAcceptedOcrMoves(accepted); setManualSan(""); setManualMove({ index, token, fen: current.fen() }); setOcrStatus("Zug " + (accepted.length + 1) + " ist unklar. Bitte prüfe die Stellung und gib den Zug ein."); return; } } const score = accepted.join(" "); setPgn(score); loadPgn(score); setOcrStatus("Erkannte Partie geladen. Bitte kontrolliere die Züge, bevor du analysierst."); } async function readSheet() { if (!sheetFile) return; setOcrBusy(true); setOcrStatus("Texterkennung wird im Browser geladen …"); try { let library = (window as unknown as { Tesseract?: { recognize: (image: File | HTMLCanvasElement, language: string) => Promise<{ data: { text: string } }> } }).Tesseract; if (!library) { await new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Texterkennung konnte nicht geladen werden.")); document.head.appendChild(script); }); library = (window as unknown as { Tesseract?: { recognize: (image: File | HTMLCanvasElement, language: string) => Promise<{ data: { text: string } }> } }).Tesseract; } if (!library) throw new Error("Texterkennung ist nicht verfügbar."); setOcrStatus("Das Foto wird lokal gelesen …"); const imageUrl = URL.createObjectURL(sheetFile); const image = new Image(); image.src = imageUrl; await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Das Foto konnte nicht geöffnet werden.")); }); const scale = Math.min(2, 2400 / Math.max(image.naturalWidth, image.naturalHeight));  const canvas = document.createElement("canvas"); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale); const context = canvas.getContext("2d"); if (!context) throw new Error("Das Foto konnte nicht vorbereitet werden."); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(imageUrl); const result = await library.recognize(canvas, "eng"); const tokens = result.data.text.replace(/[\[\]{}()]/g, " ").split(/\s+/).map((token) => token.trim()).filter(Boolean); if (!tokens.length) throw new Error("Auf dem Foto wurden keine Züge erkannt. Bitte versuche ein schärferes Foto oder gib die Züge manuell ein."); setOcrTokens(tokens); setAcceptedOcrMoves([]); processOcrTokens(tokens, 0, new Chess(), []); } catch (error) { setOcrStatus(error instanceof Error ? error.message : "Das Foto konnte nicht gelesen werden."); } finally { setOcrBusy(false); } } function confirmManualOcrMove() { if (!manualMove) return; try { const current = new Chess(manualMove.fen); const manual = manualSan.trim(); const germanPieces: Record<string, string> = { D: "Q", T: "R", L: "B", S: "N" }; const corrected = germanPieces[manual[0]] ? germanPieces[manual[0]] + manual.slice(1) : manual; const result = current.move(corrected); const accepted = [...acceptedOcrMoves, result.san]; setManualMove(null); setManualSan(""); processOcrTokens(ocrTokens, manualMove.index + 1, current, accepted); } catch { setOcrStatus("Dieser Zug ist in der aktuellen Stellung nicht legal. Bitte prüfe die Eingabe."); } } function playMove(from: Square, to: Square) {
    if (game.isGameOver()) return false;
    const movingPiece = game.get(from);
    const isLegalMove = game.moves({ square: from, verbose: true }).some((move) => move.to === to);
    if (!isLegalMove) return false;
    const reachesLastRank = movingPiece?.type === "p" && ((movingPiece.color === "w" && to[1] === "8") || (movingPiece.color === "b" && to[1] === "1"));
    if (reachesLastRank) {
      setPromotionPending({ from, to });
      return true;
    }
    return commitMove(from, to);
  }

  function commitMove(from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") {
    const next = new Chess(game.fen());
    try {
      const played = next.move({ from, to, promotion });
      const nextPositions = positions.slice(0, moveIndex + 1);
      nextPositions.push(next.fen());
      const nextMoves = moves.slice(0, moveIndex);
      nextMoves.push(played.san);
      setPositions(nextPositions);
      setMoves(nextMoves);
      setMoveIndex(nextMoves.length);
      setPgn(nextMoves.map((san, index) => (index % 2 === 0 ? Math.floor(index / 2) + 1 + ". " : "") + san).join(" "));
      setSelectedSquare(null);
      setPromotionPending(null);
      setEvaluation(null);
      setAnalyzing(false);
      workerRef.current?.postMessage("stop");
      setMessage("Zug übernommen. Du kannst die Stellung jetzt analysieren.");
      return true;
    } catch {
      return false;
    }
  }

  function choosePromotion(piece: "q" | "r" | "b" | "n") {
    if (!promotionPending) return;
    commitMove(promotionPending.from, promotionPending.to, piece);
  }

  function handleSquareClick(square: Square) {
    const piece = game.get(square);
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        return;
      }
      if (piece?.color === game.turn()) {
        setSelectedSquare(square);
        return;
      }
      if (playMove(selectedSquare, square)) return;
    }
    if (piece?.color === game.turn()) setSelectedSquare(square);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, target: Square) {
    event.preventDefault();
    const from = event.dataTransfer.getData("text/plain") as Square;
    if (from) playMove(from, target);
  }

  function resetGame() {
    setPgn("");
    setMoves([]);
    setPositions([START_FEN]);
    setMoveIndex(0);
    setSelectedSquare(null);
    setPromotionPending(null);
    setEvaluation(null);
    setAnalysisPuzzleId(null);
    setMessage("Neue Partie bereit. Ziehe eine weiße Figur oder tippe zuerst auf sie.");
    setEngineError("");
  }

  async function removeSavedPuzzle(puzzle: TacticsPuzzle) {
    setSavedPuzzleMessage("");
    try {
      const { error: removeError } = await createClient().rpc("remove_saved_tactics_puzzle", {
        p_puzzle_id: puzzle.id,
      });
      if (removeError) throw removeError;
      setSavedPuzzles((current) => current.filter((item) => item.id !== puzzle.id));
      setSavedPuzzleMessage(`Aufgabe ${puzzle.id} aus deinen gespeicherten Taktiken entfernt.`);
    } catch (removeError) {
      console.error("Gespeicherte Taktikaufgabe konnte nicht entfernt werden:", removeError);
      setSavedPuzzleMessage("Die Aufgabe konnte nicht entfernt werden. Bitte versuche es erneut.");
    }
  }

  function analyzePosition() {
    const worker = workerRef.current;
    if (!worker || !engineReady) {
      setEngineError("Stockfish wird noch geladen. Bitte warte kurz.");
      return;
    }
    setEngineError("");
    setEvaluation(null);
    setAnalyzing(true);
    worker.postMessage("stop");
    worker.postMessage("position fen " + game.fen());
    worker.postMessage("go depth 15");
  }

  const promotionColor = promotionPending ? game.get(promotionPending.from)?.color ?? "w" : "w";
  const scoreLabel = evaluation
    ? evaluation.score.startsWith("Matt")
      ? evaluation.score
      : (Number(evaluation.score) > 0 ? "+" : "") + evaluation.score
    : "Noch nicht analysiert";

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-7xl">
      {promotionPending && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="analysis-promotion-title"><div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><h2 id="analysis-promotion-title" className="text-xl font-bold">Bauernumwandlung</h2><p className="mt-1 text-sm text-slate-400">Welche Figur möchtest du wählen?</p><div className="mt-4 grid grid-cols-4 gap-2">{(["q", "r", "b", "n"] as const).map((piece) => <button key={piece} type="button" onClick={() => choosePromotion(piece)} className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950 p-3 hover:border-emerald-400 hover:bg-slate-800"><span className={"text-4xl " + (promotionColor === "w" ? "text-white drop-shadow-[0_2px_2px_rgba(15,23,42,0.95)]" : "text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]")}>{PIECES[promotionColor + piece.toUpperCase()]}</span><span className="mt-1 text-xs">{{ q: "Dame", r: "Turm", b: "Läufer", n: "Springer" }[piece]}</span></button>)}</div><button type="button" onClick={() => setPromotionPending(null)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Abbrechen</button></div></div>}
      <header className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Partie verstehen · besser spielen</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Analyse</h1>
        <p className="mt-2 text-slate-400">Lade eine Partie oder gib sie direkt am Brett ein und untersuche sie mit Stockfish.</p>
      </header>
      <section aria-labelledby="saved-tactics-heading" className="mb-5 rounded-2xl border border-amber-300/20 bg-slate-900 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="saved-tactics-heading" className="text-lg font-bold">Gespeicherte Taktikaufgaben</h2>
            <p className="mt-1 text-sm text-slate-400">Lade eine Aufgabe auf das Brett und analysiere sie mit Stockfish.</p>
          </div>
          <Link href="/taktik" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Taktikaufgaben öffnen</Link>
        </div>
        {savedPuzzlesLoading ? <p className="mt-4 text-sm text-slate-400" role="status">Gespeicherte Aufgaben werden geladen …</p> : savedPuzzles.length ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {savedPuzzles.map((puzzle) => {
              const preview = new Chess(puzzle.fen);
              if (puzzle.setupMove) {
                preview.move({
                  from: puzzle.setupMove.slice(0, 2) as Square,
                  to: puzzle.setupMove.slice(2, 4) as Square,
                  ...(puzzle.setupMove.length === 5 ? { promotion: puzzle.setupMove[4] } : {}),
                });
              }
              return <li key={puzzle.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <MiniChessboard
                  fen={preview.fen()}
                  label={`Vorschau der Taktikaufgabe ${puzzle.id}`}
                  orientation={preview.turn() === "w" ? "white" : "black"}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => loadTacticsPuzzle(puzzle)} className="min-w-0 text-left">
                    <span className="block truncate text-sm font-semibold text-white">Aufgabe {puzzle.id} · {puzzle.rating} Elo</span>
                    <span className="mt-1 block text-xs text-slate-400">{getTacticsDifficulty(puzzle.rating)} · {getTacticsTheme(puzzle.themes)}</span>
                  </button>
                  <button type="button" onClick={() => void removeSavedPuzzle(puzzle)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Entfernen</button>
                </div>
              </li>;
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-400">{savedPuzzleMessage || "Du hast noch keine Taktikaufgaben gespeichert. Speichere Aufgaben im Taktiktraining, um sie hier zu analysieren."}</p>
        )}
        {savedPuzzleMessage && savedPuzzles.length > 0 && <p role="status" className="mt-3 text-sm text-slate-400">{savedPuzzleMessage}</p>}
      </section>
      {analysisPuzzleId && <p className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-sm text-violet-100">Taktikaufgabe {analysisPuzzleId} ist geladen. Du kannst die Stellung verändern und analysieren.</p>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Partiebrett</h2>
              <p className="text-sm text-slate-400">{moves.length ? moveIndex === 0 ? "Ausgangsstellung" : "Nach " + Math.ceil(moveIndex / 2) + ". Zug" : "Neue Partie"}</p>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-emerald-300">Engine: {engineReady ? "bereit" : "lädt …"}</span>
          </div>
          <p className="mb-3 text-center text-sm text-slate-400">{game.isGameOver() ? "Partie beendet" : "Am Zug: " + (game.turn() === "w" ? "Weiß" : "Schwarz") + " · Ziehe eine Figur oder wähle Start- und Zielfeld."}</p>
          <div className="mx-auto grid w-full max-w-[620px] grid-cols-[1.25rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_1.25rem]">
            <div className="grid grid-rows-8 text-center text-xs text-slate-400">{Array.from({ length: 8 }, (_, index) => <span key={index} className="flex items-center justify-center">{8 - index}</span>)}</div>
            <div className="chessboard-frame grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden">
              {board.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
                const light = (rowIndex + colIndex) % 2 === 1;
                const square = (String.fromCharCode(97 + colIndex) + (8 - rowIndex)) as Square;
                const isSelected = selectedSquare === square;
                const isTarget = legalTargets.includes(square);
                return <div
                  key={square}
                  role="button"
                  tabIndex={0}
                  aria-label={square + (piece ? ", " + (piece.color === "w" ? "weiße" : "schwarze") + " " + piece.type : "")}
                  onClick={() => handleSquareClick(square)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleSquareClick(square); } }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, square)}
                  className={"relative flex aspect-square select-none items-center justify-center text-[clamp(1.8rem,7vw,3.6rem)] " + (light ? "chessboard-light" : "chessboard-dark") + (isSelected ? " ring-4 ring-inset ring-emerald-300" : "")}
                >
                  {piece && <span
                    draggable={piece.color === game.turn() && !game.isGameOver()}
                    onDragStart={(event) => { event.dataTransfer.setData("text/plain", square); setSelectedSquare(square); }}
                    onDragEnd={() => setSelectedSquare(null)}
                    className={"cursor-grab active:cursor-grabbing " + (piece.color === "w" ? "text-white drop-shadow-[0_2px_2px_rgba(15,23,42,0.95)]" : "text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.85)]")}
                  >{PIECES[piece.color + piece.type.toUpperCase()]}</span>}
                  {isTarget && <span aria-hidden="true" className={"pointer-events-none absolute h-3 w-3 rounded-full " + (piece ? "border-4 border-emerald-400" : "bg-emerald-400/70")} />}
                </div>;
              }))}
            </div>
            <div aria-hidden="true" />
            <div className="grid grid-cols-8 text-center text-xs text-slate-400">{Array.from({ length: 8 }, (_, index) => <span key={index}>{String.fromCharCode(65 + index)}</span>)}</div>
          </div>
          <div className="mx-auto mt-4 flex max-w-[620px] items-center justify-between gap-2">
            <button type="button" onClick={() => { setMoveIndex(Math.max(0, moveIndex - 1)); setSelectedSquare(null); }} disabled={moveIndex === 0} className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40">← Zurück</button>
            <span className="text-sm text-slate-400">{moveIndex} / {moves.length}</span>
            <button type="button" onClick={() => { setMoveIndex(Math.min(moves.length, moveIndex + 1)); setSelectedSquare(null); }} disabled={moveIndex >= moves.length} className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40">Weiter →</button>
            <button type="button" onClick={resetGame} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Neue Partie</button>
          </div>
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Züge</h3>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-auto">{moves.length ? moves.map((san, index) => <button type="button" key={index} onClick={() => { setMoveIndex(index + 1); setSelectedSquare(null); }} className={"rounded px-2 py-1 text-sm " + (moveIndex === index + 1 ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300")}>{index % 2 === 0 ? Math.floor(index / 2) + 1 + ". " : ""}{san}</button>) : <p className="text-sm text-slate-500">Noch keine Züge. Du kannst die Partie direkt am Brett eingeben.</p>}</div>
            {message && <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">Partie laden</h2>
            <p className="mt-1 text-sm text-slate-400">Füge PGN-Züge ein oder wähle eine .pgn- bzw. .txt-Datei aus.</p>
            <textarea value={pgn} onChange={(event) => setPgn(event.target.value)} placeholder="Zum Beispiel: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6" rows={6} className="mt-4 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-white outline-none focus:border-emerald-400" />
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => loadPgn(pgn)} className="rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-slate-950 hover:bg-emerald-300">Partie laden</button>
              <label className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2.5 text-sm hover:bg-slate-800">PGN-Datei wählen<input type="file" accept=".pgn,.txt,text/plain" onChange={handleFile} className="sr-only" /></label>
            </div>
          </section>
          <section className="rounded-2xl border border-violet-500/30 bg-slate-900 p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Stockfish-Analyse</h2><span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs text-violet-200">Lokal & kostenlos</span></div>
            <p className="mt-2 text-sm text-slate-400">Die Stellung wird in deinem Browser untersucht.</p>
            <button type="button" onClick={analyzePosition} disabled={analyzing || !engineReady} className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50">{analyzing ? "Analysiere Stellung …" : "Stellung analysieren"}</button>
            {engineError && <p role="alert" className="mt-3 text-sm text-red-300">{engineError}</p>}
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-sm text-slate-400">Engine-Bewertung</p><p className="mt-1 text-2xl font-bold text-emerald-300">{scoreLabel}</p>{evaluation && <><p className="mt-2 text-xs text-slate-500">Tiefe {evaluation.depth} · beste Zugfolge</p><p className="mt-1 break-words font-mono text-sm text-slate-200">{evaluation.line || "—"}</p></>}</div>
          </section>
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-bold">Partieformular abfotografieren</h2>
            <p className="mt-2 text-sm text-slate-400">Lade ein Foto deiner Notation hoch. Die Texterkennung läuft lokal in deinem Browser; kontrolliere die erkannten Züge anschließend.</p>
            <label className="mt-4 inline-flex cursor-pointer rounded-xl border border-slate-700 px-4 py-2.5 text-sm hover:bg-slate-800">Foto auswählen<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0] ?? null; setSheetFile(file); setSheetName(file?.name ?? ""); setOcrStatus(""); }} className="sr-only" /></label>
            {sheetName && <p className="mt-2 text-sm text-slate-300">Ausgewählt: {sheetName}</p>}<button type="button" onClick={readSheet} disabled={!sheetFile || ocrBusy} className="mt-3 w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{ocrBusy ? "Lese Partie …" : "Züge aus Foto lesen"}</button>{ocrStatus && <p role="status" className="mt-3 text-sm text-slate-300">{ocrStatus}</p>}
          </section>
        </aside>
      </div>
    </div>
  {manualMove && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="manual-ocr-title"><div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"><h2 id="manual-ocr-title" className="text-xl font-bold">Zug bitte manuell prüfen</h2><p className="mt-3 text-sm text-slate-300">Die Texterkennung konnte diesen Zug in der aktuellen Stellung nicht legal übernehmen.</p><p className="mt-2 text-sm font-semibold text-amber-200">Fehlerstelle: {Math.floor(acceptedOcrMoves.length / 2) + 1}. Zug – {acceptedOcrMoves.length % 2 === 0 ? "Weiß" : "Schwarz"} am Zug.</p><p className="mt-2 text-xs text-slate-400">Bisher erkannt: {acceptedOcrMoves.slice(-4).join(" ") || "Noch keine Züge"}</p><p className="mt-2 rounded-lg bg-slate-950 p-3 font-mono text-amber-300">Erkannt: {manualMove.token}</p><p className="mt-3 text-sm text-slate-400">Gib den Zug in deutscher oder internationaler Notation ein, z. B. e4, Sf3 oder Nf3.</p><input autoFocus value={manualSan} onChange={(event) => setManualSan(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmManualOcrMove(); }} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" placeholder="Korrigierter Zug" /><div className="mt-4 flex gap-3"><button type="button" onClick={confirmManualOcrMove} className="flex-1 rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950">Zug übernehmen</button><button type="button" onClick={() => setManualMove(null)} className="rounded-lg border border-slate-700 px-4 py-2">Abbrechen</button></div></div></div>} </main>;
}
