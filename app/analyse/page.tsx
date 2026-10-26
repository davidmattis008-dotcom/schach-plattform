"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { MiniChessboard } from "@/components/mini-chessboard";
import { ChessPieceIcon } from "@/components/chess-piece";
import { CageAiPanel } from "@/components/cage-ai-panel";
import { ChessScoreSheetImporter } from "@/components/chess-score-sheet-importer";
import {
  analyzePlayedMoves,
  formatEngineScore,
  parseStockfishBestMove,
  parseStockfishInfoLine,
  uciLineToSan,
  type AnalyzedMove,
  type EngineLine,
  type PositionAnalysis,
} from "@/lib/chess/stockfish-analysis";
import { getTacticsDifficulty, getTacticsTheme, tacticsPuzzles, type TacticsPuzzle } from "@/lib/tactics";
import { createClient } from "@/lib/supabase/client";

const START_FEN = new Chess().fen();
const MAX_GAME_ANALYSIS_PLIES = 200;
type EvalInfo = { score: string; depth: string; line: string; lines: EngineLine[] };
type SavedTacticRow = { puzzle_id: string; saved_at: string };
type PendingPositionAnalysis = {
  lines: Map<number, EngineLine>;
  resolve: (analysis: PositionAnalysis | null) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export default function AnalysePage() {
  const [pgn, setPgn] = useState("");
  const [moves, setMoves] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([START_FEN]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState("");
  const [engineReady, setEngineReady] = useState(false);
  const [engineStopping, setEngineStopping] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [gameAnalyzing, setGameAnalyzing] = useState(false);
  const [gameAnalysisProgress, setGameAnalysisProgress] = useState<{ current: number; total: number } | null>(null);
  const [gameAnalysis, setGameAnalysis] = useState<AnalyzedMove[]>([]);
  const [gameAnalysisError, setGameAnalysisError] = useState("");
  const [analysisMemoryMessage, setAnalysisMemoryMessage] = useState("");
  const [savingAnalysisMemory, setSavingAnalysisMemory] = useState(false);
  const [cageAiInitialQuestion, setCageAiInitialQuestion] = useState("");
  const [evaluation, setEvaluation] = useState<EvalInfo | null>(null);
  const [engineError, setEngineError] = useState("");
  const [savedPuzzles, setSavedPuzzles] = useState<TacticsPuzzle[]>([]);
  const [savedPuzzleMessage, setSavedPuzzleMessage] = useState("");
  const [savedPuzzlesLoading, setSavedPuzzlesLoading] = useState(true);
  const [analysisPuzzleId, setAnalysisPuzzleId] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingPositionAnalysisRef = useRef<PendingPositionAnalysis | null>(null);
  const regularAnalysisLinesRef = useRef<Map<number, EngineLine>>(new Map());
  const currentAnalysisFenRef = useRef(START_FEN);
  const gameAnalysisRunRef = useRef(0);
  const engineStoppingRef = useRef(false);
  const game = useMemo(() => new Chess(positions[moveIndex] ?? START_FEN), [positions, moveIndex]);
  const board = game.board();
  const legalTargets = selectedSquare
    ? game.moves({ square: selectedSquare, verbose: true }).map((move) => move.to)
    : [];

  function loadTacticsPuzzle(puzzle: TacticsPuzzle) {
    try {
      cancelGameAnalysis();
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
      setMessage("Taktikaufgabe geladen.");
      setEngineError("");
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
          worker?.postMessage("setoption name MultiPV value 3");
          worker?.postMessage("isready");
        }
        if (text.includes("readyok")) setEngineReady(true);
        if (engineStoppingRef.current) {
          if (parseStockfishBestMove(text)) {
            engineStoppingRef.current = false;
            setEngineStopping(false);
            setAnalyzing(false);
          }
          return;
        }
        const pendingAnalysis = pendingPositionAnalysisRef.current;
        const info = parseStockfishInfoLine(text);
        if (info) {
          if (pendingAnalysis) {
            const previousLine = pendingAnalysis.lines.get(info.multipv);
            if (!previousLine || info.depth >= previousLine.depth) {
              pendingAnalysis.lines.set(info.multipv, info);
            }
          } else {
            const previousLine = regularAnalysisLinesRef.current.get(info.multipv);
            if (!previousLine || info.depth >= previousLine.depth) {
              regularAnalysisLinesRef.current.set(info.multipv, info);
            }
            const bestLine = regularAnalysisLinesRef.current.get(1);
            if (bestLine) {
              setEvaluation({
                score: formatEngineScore(bestLine.score, new Chess(currentAnalysisFenRef.current).turn()),
                depth: String(bestLine.depth),
                line: uciLineToSan(currentAnalysisFenRef.current, bestLine.pv).join(" "),
                lines: [...regularAnalysisLinesRef.current.values()].sort((a, b) => a.multipv - b.multipv),
              });
            }
          }
        }
        const bestMove = parseStockfishBestMove(text);
        if (bestMove) {
          const activeAnalysis = pendingPositionAnalysisRef.current;
          if (activeAnalysis) {
            clearTimeout(activeAnalysis.timeout);
            pendingPositionAnalysisRef.current = null;
            activeAnalysis.resolve({
              lines: [...activeAnalysis.lines.values()].sort((a, b) => a.multipv - b.multipv),
              bestMove,
            });
          } else {
            setAnalyzing(false);
          }
        }
      };
      worker.onerror = () => {
        setEngineError("Stockfish konnte nicht geladen werden. Bitte lade die Seite neu.");
        engineStoppingRef.current = false;
        setEngineStopping(false);
        setAnalyzing(false);
        const pendingAnalysis = pendingPositionAnalysisRef.current;
        if (pendingAnalysis) {
          clearTimeout(pendingAnalysis.timeout);
          pendingPositionAnalysisRef.current = null;
          pendingAnalysis.reject(new Error("Stockfish konnte nicht geladen werden."));
        }
      };
      worker.postMessage("uci");
    } catch {
      setEngineError("Dieser Browser konnte Stockfish nicht starten.");
    }
    return () => {
      gameAnalysisRunRef.current += 1;
      const pendingAnalysis = pendingPositionAnalysisRef.current;
      if (pendingAnalysis) {
        clearTimeout(pendingAnalysis.timeout);
        pendingPositionAnalysisRef.current = null;
        pendingAnalysis.resolve(null);
      }
      engineStoppingRef.current = false;
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
      const params = new URLSearchParams(window.location.search);
      const sharedPgn = params.get("pgn");
      const initialQuestion = params.get("cageAiQuestion");
      if (initialQuestion) setCageAiInitialQuestion(initialQuestion.slice(0, 500));
      if (sharedPgn) {
        loadPgn(sharedPgn);
        return;
      }
      const puzzleId = params.get("puzzle");
      if (puzzleId) {
        const puzzle = tacticsPuzzles.find((item) => item.id === puzzleId);
        if (puzzle) loadTacticsPuzzle(puzzle);
        else setMessage("Die angeforderte Taktikaufgabe wurde nicht gefunden.");
      }
    });
    return () => { active = false; };
  }, []);

  function loadPgn(source: string) {
    try {
      cancelGameAnalysis();
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

  function playMove(from: Square, to: Square) {
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
      cancelGameAnalysis();
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
    cancelGameAnalysis();
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

  async function saveAnalysisTrainingFocus() {
    if (gameAnalysis.length === 0 || savingAnalysisMemory) return;
    setSavingAnalysisMemory(true);
    setAnalysisMemoryMessage("");
    const counts = {
      inaccuracy: gameAnalysis.filter((item) => item.quality === "inaccuracy").length,
      mistake: gameAnalysis.filter((item) => item.quality === "mistake").length,
      blunder: gameAnalysis.filter((item) => item.quality === "blunder").length,
    };
    const content = `Stockfish-Partieanalyse: ${counts.inaccuracy} Ungenauigkeiten, ${counts.mistake} Fehler und ${counts.blunder} schwere Fehler. Bitte hilf mir, wiederkehrende Ursachen zu erkennen und diese Züge künftig bewusster zu prüfen.`;
    try {
      const response = await fetch("/api/cage-ai/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryType: "weakness", content }),
      });
      let result: { error?: string };
      try {
        result = await response.json() as { error?: string };
      } catch {
        throw new Error("Der Memory-Endpunkt hat eine ungültige Antwort geliefert.");
      }
      if (!response.ok) throw new Error(result.error || "Die Erkenntnis konnte nicht gespeichert werden.");
      setAnalysisMemoryMessage("Eine kurze Zusammenfassung der Analyse ist als Trainingsschwerpunkt gespeichert. PGN, Züge und Engine-Varianten wurden nicht gespeichert.");
    } catch (saveError) {
      setAnalysisMemoryMessage(saveError instanceof Error
        ? saveError.message
        : "Die Erkenntnis konnte nicht gespeichert werden.");
    } finally {
      setSavingAnalysisMemory(false);
    }
  }

  function analyzePosition() {
    const worker = workerRef.current;
    if (gameAnalyzing || engineStoppingRef.current) return;
    if (!worker || !engineReady) {
      setEngineError("Stockfish wird noch geladen. Bitte warte kurz.");
      return;
    }
    currentAnalysisFenRef.current = game.fen();
    regularAnalysisLinesRef.current.clear();
    setEngineError("");
    setEvaluation(null);
    setAnalyzing(true);
    worker.postMessage("stop");
    worker.postMessage("position fen " + game.fen());
    worker.postMessage("go depth 15");
  }

  function cancelGameAnalysis() {
    gameAnalysisRunRef.current += 1;
    const pendingAnalysis = pendingPositionAnalysisRef.current;
    if (pendingAnalysis) {
      clearTimeout(pendingAnalysis.timeout);
      pendingPositionAnalysisRef.current = null;
      pendingAnalysis.resolve(null);
    }
    if (pendingAnalysis || analyzing) {
      engineStoppingRef.current = true;
      setEngineStopping(true);
      workerRef.current?.postMessage("stop");
    }
    setGameAnalyzing(false);
    setGameAnalysisProgress(null);
    setGameAnalysis([]);
    setGameAnalysisError("");
  }

  function analyzeFen(fen: string): Promise<PositionAnalysis | null> {
    const worker = workerRef.current;
    if (!worker || !engineReady) return Promise.reject(new Error("Stockfish ist noch nicht bereit."));

    const position = new Chess(fen);
    if (position.isCheckmate()) {
      return Promise.resolve({
        lines: [{ depth: 1, multipv: 1, score: { type: "mate", value: -0 }, pv: [] }],
        bestMove: "0000",
      });
    }
    if (position.isDraw()) {
      return Promise.resolve({
        lines: [{ depth: 1, multipv: 1, score: { type: "cp", value: 0 }, pv: [] }],
        bestMove: "0000",
      });
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pendingPositionAnalysisRef.current?.timeout !== timeout) return;
        pendingPositionAnalysisRef.current = null;
        engineStoppingRef.current = true;
        setEngineStopping(true);
        worker.postMessage("stop");
        reject(new Error("Stockfish hat eine Stellung nicht rechtzeitig ausgewertet."));
      }, 20_000);
      pendingPositionAnalysisRef.current = { lines: new Map(), resolve, reject, timeout };
      worker.postMessage("position fen " + fen);
      worker.postMessage("go depth 10");
    });
  }

  async function analyzeGame() {
    if (!workerRef.current || !engineReady || engineStoppingRef.current) {
      setGameAnalysisError("Stockfish wird noch geladen. Bitte warte kurz.");
      return;
    }
    if (moves.length === 0) {
      setGameAnalysisError("Lade zuerst eine Partie mit Zügen.");
      return;
    }
    if (moves.length > MAX_GAME_ANALYSIS_PLIES) {
      setGameAnalysisError(`Die Partieanalyse ist im Browser auf ${MAX_GAME_ANALYSIS_PLIES} Halbzüge begrenzt.`);
      return;
    }
    if (positions.length !== moves.length + 1) {
      setGameAnalysisError("Die Partie konnte nicht vollständig für Stockfish vorbereitet werden.");
      return;
    }

    const runId = ++gameAnalysisRunRef.current;
    const positionsToAnalyze = [...positions];
    const movesToAnalyze = [...moves];
    const analyses: PositionAnalysis[] = [];
    setGameAnalysis([]);
    setGameAnalysisError("");
    setGameAnalysisProgress({ current: 0, total: positionsToAnalyze.length });
    setGameAnalyzing(true);
    setEngineError("");

    try {
      for (let index = 0; index < positionsToAnalyze.length; index += 1) {
        if (runId !== gameAnalysisRunRef.current) return;
        setGameAnalysisProgress({ current: index + 1, total: positionsToAnalyze.length });
        const analysis = await analyzeFen(positionsToAnalyze[index]);
        if (runId !== gameAnalysisRunRef.current || !analysis) return;
        analyses.push(analysis);
      }
      setGameAnalysis(analyzePlayedMoves(movesToAnalyze, positionsToAnalyze, analyses));
    } catch (error) {
      console.error("Die Partie konnte nicht mit Stockfish analysiert werden:", error);
      setGameAnalysisError(error instanceof Error ? error.message : "Die Partie konnte nicht analysiert werden.");
    } finally {
      if (runId === gameAnalysisRunRef.current) {
        setGameAnalyzing(false);
        setGameAnalysisProgress(null);
      }
    }
  }

  const promotionColor = promotionPending ? game.get(promotionPending.from)?.color ?? "w" : "w";
  const scoreLabel = evaluation?.score ?? "Noch nicht analysiert";

  return <main className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-5 sm:py-6">
    <div className="mx-auto max-w-7xl">
      {promotionPending && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="analysis-promotion-title"><div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><h2 id="analysis-promotion-title" className="text-xl font-bold">Bauernumwandlung</h2><p className="mt-1 text-sm text-slate-400">Welche Figur möchtest du wählen?</p><div className="mt-4 grid grid-cols-4 gap-2">{(["q", "r", "b", "n"] as const).map((piece) => <button key={piece} type="button" onClick={() => choosePromotion(piece)} className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950 p-3 hover:border-emerald-400 hover:bg-slate-800"><span className="h-10 w-10"><ChessPieceIcon color={promotionColor} type={piece} /></span><span className="mt-1 text-xs">{{ q: "Dame", r: "Turm", b: "Läufer", n: "Springer" }[piece]}</span></button>)}</div><button type="button" onClick={() => setPromotionPending(null)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Abbrechen</button></div></div>}
      <header className="mb-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Analyse</h1>
      </header>
      <section aria-labelledby="saved-tactics-heading" className="mb-4 rounded-xl border border-amber-300/20 bg-slate-900 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="saved-tactics-heading" className="font-bold">Gespeicherte Aufgaben</h2>
          </div>
          <Link href="/taktik" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Taktik öffnen</Link>
        </div>
        {savedPuzzlesLoading ? <p className="mt-4 text-sm text-slate-400" role="status">Gespeicherte Aufgaben werden geladen …</p> : savedPuzzles.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedPuzzles.map((puzzle) => {
              const preview = new Chess(puzzle.fen);
              if (puzzle.setupMove) {
                preview.move({
                  from: puzzle.setupMove.slice(0, 2) as Square,
                  to: puzzle.setupMove.slice(2, 4) as Square,
                  ...(puzzle.setupMove.length === 5 ? { promotion: puzzle.setupMove[4] } : {}),
                });
              }
              return <li key={puzzle.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2">
                <MiniChessboard
                  fen={preview.fen()}
                  label={`Vorschau der Taktikaufgabe ${puzzle.id}`}
                  orientation={preview.turn() === "w" ? "white" : "black"}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
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
          <p className="mt-4 text-sm text-slate-400">{savedPuzzleMessage || "Keine gespeicherten Aufgaben."}</p>
        )}
        {savedPuzzleMessage && savedPuzzles.length > 0 && <p role="status" className="mt-3 text-sm text-slate-400">{savedPuzzleMessage}</p>}
      </section>
      {analysisPuzzleId && <p className="mb-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-sm text-violet-100">Aufgabe {analysisPuzzleId}</p>}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Partiebrett</h2>
              <p className="text-sm text-slate-400">{moves.length ? moveIndex === 0 ? "Ausgangsstellung" : "Nach " + Math.ceil(moveIndex / 2) + ". Zug" : "Neue Partie"}</p>
            </div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-emerald-300">Engine: {engineReady ? "bereit" : "lädt …"}</span>
          </div>
          <p className="mb-2 text-center text-xs text-slate-400">{game.isGameOver() ? "Partie beendet" : (game.turn() === "w" ? "Weiß" : "Schwarz") + " am Zug"}</p>
          <div className="chessboard-frame mx-auto grid aspect-square w-full max-w-[620px] grid-cols-8 grid-rows-8 overflow-hidden">
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
                  className={"relative flex aspect-square select-none items-center justify-center " + (light ? "chessboard-light" : "chessboard-dark") + (isSelected ? " ring-4 ring-inset ring-amber-300" : "")}
                >
                  {piece && <span
                    draggable={piece.color === game.turn() && !game.isGameOver()}
                    onDragStart={(event) => { event.dataTransfer.setData("text/plain", square); setSelectedSquare(square); }}
                    onDragEnd={() => setSelectedSquare(null)}
                    className="absolute inset-0 flex cursor-grab items-center justify-center active:cursor-grabbing"
                  ><ChessPieceIcon color={piece.color} type={piece.type} /></span>}
                  {isTarget && <span aria-hidden="true" className={"pointer-events-none absolute h-3 w-3 rounded-full " + (piece ? "chessboard-capture-target" : "chessboard-move-target")} />}
                  {colIndex === 0 && <span aria-hidden="true" className={"pointer-events-none absolute left-1 top-0.5 text-[9px] font-bold " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{8 - rowIndex}</span>}
                  {rowIndex === 7 && <span aria-hidden="true" className={"pointer-events-none absolute bottom-0 right-1 text-[9px] font-bold " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{String.fromCharCode(65 + colIndex)}</span>}
                </div>;
            }))}
          </div>
          <div className="mx-auto mt-2 flex max-w-[620px] items-center justify-between gap-1">
            <button type="button" onClick={() => { setMoveIndex(Math.max(0, moveIndex - 1)); setSelectedSquare(null); }} disabled={moveIndex === 0} className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40">← Zurück</button>
            <span className="text-sm text-slate-400">{moveIndex} / {moves.length}</span>
            <button type="button" onClick={() => { setMoveIndex(Math.min(moves.length, moveIndex + 1)); setSelectedSquare(null); }} disabled={moveIndex >= moves.length} className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40">Weiter →</button>
            <button type="button" onClick={resetGame} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Neue Partie</button>
          </div>
          <div className="mt-3">
            <h3 className="mb-1 text-sm font-semibold text-slate-300">Züge</h3>
            <div className="flex max-h-36 flex-wrap gap-2 overflow-auto">{moves.length ? moves.map((san, index) => <button type="button" key={index} onClick={() => { setMoveIndex(index + 1); setSelectedSquare(null); }} className={"rounded px-2 py-1 text-sm " + (moveIndex === index + 1 ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-300")}>{index % 2 === 0 ? Math.floor(index / 2) + 1 + ". " : ""}{san}</button>) : <p className="text-sm text-slate-500">Keine Züge.</p>}</div>
            {message && <p role="status" className="mt-3 text-sm text-slate-300">{message}</p>}
          </div>
        </section>
        <aside className="space-y-3">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
            <h2 className="font-bold">Partie laden</h2>
            <textarea value={pgn} onChange={(event) => setPgn(event.target.value)} placeholder="PGN-Züge" rows={4} className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-2.5 font-mono text-sm text-white outline-none focus:border-emerald-400" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => loadPgn(pgn)} className="rounded-xl bg-emerald-400 px-4 py-2.5 font-semibold text-slate-950 hover:bg-emerald-300">Partie laden</button>
              <label className="cursor-pointer rounded-xl border border-slate-700 px-4 py-2.5 text-sm hover:bg-slate-800">PGN-Datei wählen<input type="file" accept=".pgn,.txt,text/plain" onChange={handleFile} className="sr-only" /></label>
            </div>
          </section>
          <section className="rounded-xl border border-violet-500/30 bg-slate-900 p-3 sm:p-4">
            <h2 className="font-bold">Stockfish</h2>
            <button type="button" onClick={analyzePosition} disabled={analyzing || gameAnalyzing || engineStopping || !engineReady} className="mt-2 w-full rounded-lg bg-violet-500 px-3 py-2.5 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50">{analyzing ? "Analysiert …" : "Stellung analysieren"}</button>
            {engineError && <p role="alert" className="mt-2 text-sm text-red-300">{engineError}</p>}
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3"><p className="text-xs text-slate-400">Bewertung</p><p className="mt-1 text-xl font-bold text-emerald-300">{scoreLabel}</p>{evaluation && <><p className="mt-1 text-xs text-slate-500">Tiefe {evaluation.depth} · Variante</p><p className="break-words font-mono text-sm text-slate-200">{evaluation.line || "—"}</p></>}</div>
            {evaluation && evaluation.lines.length > 1 && <div className="mt-3 space-y-2" aria-label="Beste Stockfish-Züge">{evaluation.lines.map((line) => <div key={line.multipv} className="rounded-lg border border-slate-800 bg-slate-950 p-2"><p className="text-xs text-slate-400">Zug {line.multipv} · {formatEngineScore(line.score, new Chess(currentAnalysisFenRef.current).turn())}</p><p className="break-words font-mono text-sm text-slate-200">{uciLineToSan(currentAnalysisFenRef.current, line.pv).join(" ") || "—"}</p></div>)}</div>}
            <div className="mt-4 border-t border-slate-800 pt-3">
              <h3 className="font-semibold">Partie analysieren</h3>
              <p className="mt-1 text-xs text-slate-400">Bewertet jeden Zug lokal im Browser mit Stockfish.</p>
              <button type="button" onClick={() => void analyzeGame()} disabled={gameAnalyzing || analyzing || engineStopping || !engineReady || moves.length === 0} className="mt-2 w-full rounded-lg border border-violet-400/50 px-3 py-2.5 font-semibold text-violet-100 transition hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50">{gameAnalyzing ? "Partie wird analysiert …" : "Ganze Partie analysieren"}</button>
              {gameAnalyzing && gameAnalysisProgress && <div className="mt-2"><p className="text-xs text-slate-300" role="status">Stellung {gameAnalysisProgress.current} von {gameAnalysisProgress.total}</p><progress className="mt-1 w-full accent-violet-400" value={gameAnalysisProgress.current} max={gameAnalysisProgress.total} aria-label="Fortschritt der Partieanalyse" /><button type="button" onClick={cancelGameAnalysis} className="mt-2 text-sm text-violet-200 underline hover:text-white">Analyse abbrechen</button></div>}
              {gameAnalysisError && <p role="alert" className="mt-2 text-sm text-red-300">{gameAnalysisError}</p>}
            </div>
          </section>
          {gameAnalysis.length > 0 && <section className="rounded-xl border border-slate-800 bg-slate-900 p-3 sm:p-4">
            <h2 className="font-bold">Zugbewertung</h2>
            <p className="mt-1 text-xs text-slate-400">Näherungswerte bei Engine-Tiefe 10; die Einstufung hängt von der Engine-Bewertung ab.</p>
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {gameAnalysis.map((item) => {
                const qualityLabel = { good: "Gut", inaccuracy: "Ungenauigkeit", mistake: "Fehler", blunder: "Schwerer Fehler" }[item.quality];
                const qualityColor = item.quality === "good" ? "text-emerald-300" : item.quality === "inaccuracy" ? "text-amber-200" : "text-red-300";
                return <li key={item.ply} className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                  <button type="button" onClick={() => { setMoveIndex(item.ply); setSelectedSquare(null); }} className="w-full text-left">
                    <span className="flex flex-wrap justify-between gap-1 text-sm font-semibold"><span>{Math.ceil(item.ply / 2)}{item.color === "w" ? "." : "…"} {item.san}</span><span className={qualityColor}>{qualityLabel} · {item.centipawnLoss} cp</span></span>
                  </button>
                  {item.quality !== "good" && <p className="mt-1 text-xs text-slate-400">Besser: <span className="font-mono text-slate-200">{item.bestMove || "keine Variante verfügbar"}</span>{item.variation.length > 1 && <span> · Variante: <span className="font-mono text-slate-300">{item.variation.join(" ")}</span></span>}</p>}
                </li>;
              })}
            </ul>
          </section>}
          {gameAnalysis.length > 0 && <CageAiPanel
            key={gameAnalysis.map((item) => `${item.ply}:${item.bestMove}`).join("|")}
            contextLabel="Die abgeschlossene Stockfish-Partieanalyse und deine Frage werden CageAI zur Erklärung bereitgestellt."
            contextReady={!gameAnalyzing}
            placeholder="Frage zur Partieanalyse …"
            initialQuestion={cageAiInitialQuestion}
            quickPrompts={["Warum war mein größter Fehler schlecht?", "Was sollte ich aus der Partie lernen?"]}
            requestConfig={{ purpose: "game_review", moves: gameAnalysis, positions }}
          />}
          {gameAnalysis.length > 0 && <section className="rounded-xl border border-amber-300/20 bg-slate-900 p-3 sm:p-4">
            <h2 className="font-semibold">Analyse als Trainingsschwerpunkt merken</h2>
            <p className="mt-1 text-sm text-slate-400">
              Speichert nur die Anzahl der Ungenauigkeiten, Fehler und schweren Fehler sowie deinen Wunsch, diese Muster zu üben – keine Partie, Züge oder Engine-Varianten.
            </p>
            <button
              type="button"
              onClick={() => void saveAnalysisTrainingFocus()}
              disabled={savingAnalysisMemory}
              className="mt-3 min-h-10 rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-50"
            >
              {savingAnalysisMemory ? "Wird gespeichert …" : "Zusammenfassung im CageAI Memory speichern"}
            </button>
            {analysisMemoryMessage && <p role="status" className="mt-2 text-sm text-slate-300">{analysisMemoryMessage}</p>}
          </section>}
          <ChessScoreSheetImporter onLoadPgn={loadPgn} />
        </aside>
      </div>
    </div>
  </main>;
}
