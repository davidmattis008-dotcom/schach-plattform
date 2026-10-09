'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';import { ChessPieceIcon } from '@/components/chess-piece';
import { getMaterialAdvantage } from '@/lib/chess/material';
import { createClient } from '@/lib/supabase/client';

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes + ':' + remainingSeconds.toString().padStart(2, '0');
}

export default function Home() {
  const [game, setGame] = useState(() => new Chess());
  const [botRouteReady, setBotRouteReady] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]); const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);
  const [whiteTime, setWhiteTime] = useState(600);
  const [blackTime, setBlackTime] = useState(600);
  const [clockMinutes, setClockMinutes] = useState(10);
  const [incrementSeconds, setIncrementSeconds] = useState(0);
  const [moves, setMoves] = useState<string[]>([]);
  const [viewedPly, setViewedPly] = useState<number | null>(null);
  const [botElo, setBotElo] = useState<number | null>(null);
  const [botColor, setBotColor] = useState<'w' | 'b'>('b');
  const [botThinking, setBotThinking] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [engineError, setEngineError] = useState(''); const [playerName, setPlayerName] = useState('Gast');
  const [animatedMove, setAnimatedMove] = useState<{ from: string; to: string } | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const requestedFenRef = useRef<string | null>(null);
  const pendingGameRef = useRef<Chess | null>(null);
  const gameGenerationRef = useRef(0);
  const pendingGenerationRef = useRef<number | null>(null);
  const botDelayRef = useRef<number | null>(null);
  const animationTimerRef = useRef<number | null>(null);  useEffect(() => { let active = true; const loadPlayerName = async () => { try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(); if (active && typeof data?.username === 'string' && data.username.trim()) setPlayerName(data.username.trim().slice(0, 20)); } catch { /* optional profile name */ } }; void loadPlayerName(); return () => { active = false; }; }, []); const isFlipped = botElo !== null && botColor === 'w';  const whitePlayerName = botElo !== null ? (botColor === 'w' ? 'Bot' : playerName) : 'Weiß'; const blackPlayerName = botElo !== null ? (botColor === 'b' ? 'Bot' : playerName) : 'Schwarz'; const boardRows = game.board();
  const historyPositions = useMemo(() => {
    const replay = new Chess();
    const positions = [replay.fen()];
    for (const san of moves) {
      replay.move(san);
      positions.push(replay.fen());
    }
    return positions;
  }, [moves]);
  const displayedRows = viewedPly === null
    ? boardRows
    : new Chess(historyPositions[viewedPly] ?? game.fen()).board();
  const displayedBoard = isFlipped
    ? displayedRows.slice().reverse().map((row) => row.slice().reverse())
    : displayedRows;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const elo = Number(params.get('elo'));
    if (params.get('mode') !== 'bot' || ![500, 1000, 1500, 2000, 2500].includes(elo)) {
      window.location.replace('/bot');
      return;
    }

    setBotElo(elo);
    const color = params.get('color');
    if (color === 'black') setBotColor('w');
    else if (color === 'random') setBotColor(Math.random() < 0.5 ? 'w' : 'b');
    else setBotColor('b');
    const minutes = Number(params.get('time'));
    const increment = Number(params.get('increment'));
    if ([0, 1, 3, 5, 10, 15, 30].includes(minutes)) {
      setClockMinutes(minutes);
      setWhiteTime(minutes * 60);
      setBlackTime(minutes * 60);
    }
    if ([0, 1, 2, 5, 10].includes(increment)) setIncrementSeconds(increment);
    setBotRouteReady(true);
  }, []);

  useEffect(() => {
    if (botElo === null) return;
    let worker: Worker;
    try {
      worker = new Worker('/stockfish/stockfish-19-lite-single.js');
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<string>) => {
        const message = String(event.data);
        if (message.includes('uciok')) {
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('setoption name Hash value 16');
          worker.postMessage('isready');
          return;
        }
        if (message.includes('readyok')) {
          readyRef.current = true;
          setEngineReady(true);
          return;
        }
        if (message.startsWith('bestmove')) {
          if (pendingGenerationRef.current !== gameGenerationRef.current) return;
          const uciMove = message.split(/\s+/)[1];
          const current = pendingGameRef.current;
          if (current && uciMove && uciMove !== '(none)' && uciMove !== '0000') {
            try {
              const move = current.move({
                from: uciMove.slice(0, 2),
                to: uciMove.slice(2, 4),
                promotion: uciMove[4] ?? 'q',
              });
              animateMove(move.from, move.to);
              setMoves((oldMoves) => [...oldMoves, move.san]);
              const nextGame = new Chess(current.fen());
              if (clockMinutes > 0 && incrementSeconds > 0) {
                if (move.color === 'w') setWhiteTime((time) => time + incrementSeconds);
                else setBlackTime((time) => time + incrementSeconds);
              }
              setGame(nextGame);
            } catch {
              setEngineError('Der Bot-Zug konnte nicht übernommen werden. Bitte starte ein neues Spiel.');
            }
          }
          pendingGameRef.current = null;
          pendingGenerationRef.current = null;
          setBotThinking(false);
        }
      };
      worker.onerror = () => {
        setEngineError('Der Bot konnte nicht geladen werden. Bitte lade die Seite neu und versuche es noch einmal.');
        setBotThinking(false);
      };
      worker.postMessage('uci');
    } catch {
      setEngineError('Dein Browser konnte den Bot nicht starten. Bitte lade die Seite neu.');
    }
    return () => {
      if (botDelayRef.current !== null) window.clearTimeout(botDelayRef.current);
      botDelayRef.current = null;
      readyRef.current = false;
      workerRef.current = null;
      worker.terminate();
    };
  }, [botElo, botColor, clockMinutes, incrementSeconds]);

  useEffect(() => {
    if (clockMinutes === 0) return;
    const timer = setInterval(() => {
      if (game.isGameOver()) return;
      if (game.turn() === 'w') setWhiteTime((time) => Math.max(0, time - 1));
      else setBlackTime((time) => Math.max(0, time - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [game, clockMinutes]);

  useEffect(() => {
    if (botElo === null || game.turn() !== botColor || game.isGameOver() || (clockMinutes > 0 && (whiteTime === 0 || blackTime === 0))) return;
    if (!readyRef.current || !workerRef.current) return;
    const fen = game.fen();
    if (requestedFenRef.current === fen) return;
    requestedFenRef.current = fen;
    pendingGameRef.current = new Chess(fen);
    pendingGenerationRef.current = gameGenerationRef.current;
    setBotThinking(true);
    setEngineError('');
    const engine = workerRef.current;
    const targetElo = Math.max(1320, botElo);
    const depth = botElo === 500 ? 1 : botElo === 1000 ? 4 : botElo === 1500 ? 8 : botElo === 2000 ? 9 : 10;
    const thinkDelay = 650 + Math.floor(Math.random() * 850);
    botDelayRef.current = window.setTimeout(() => {
      botDelayRef.current = null;
      if (pendingGenerationRef.current !== gameGenerationRef.current) return;
      engine.postMessage('setoption name UCI_LimitStrength value true');
      engine.postMessage('setoption name UCI_Elo value ' + targetElo);
      engine.postMessage('position fen ' + fen);
      engine.postMessage('go depth ' + depth);
    }, thinkDelay);
  }, [game, botElo, botColor, whiteTime, blackTime, engineReady]);

  function animateMove(from: string, to: string) {
    if (animationTimerRef.current !== null) window.clearTimeout(animationTimerRef.current);
    setAnimatedMove({ from, to });
    animationTimerRef.current = window.setTimeout(() => {
      setAnimatedMove(null);
      animationTimerRef.current = null;
    }, 260);
  }

  function viewPosition(ply: number | null) {
    setViewedPly(ply === null || ply >= moves.length ? null : Math.max(0, ply));
    setSelectedSquare(null);
    setPossibleMoves([]);
  }

  function choosePromotion(piece: 'q' | 'r' | 'b' | 'n') { if (!promotionPending) return; try { const move = game.move({ from: promotionPending.from, to: promotionPending.to, promotion: piece }); animateMove(move.from, move.to); setMoves((oldMoves) => [...oldMoves, move.san]); if (clockMinutes > 0 && incrementSeconds > 0) { if (move.color === 'w') setWhiteTime((time) => time + incrementSeconds); else setBlackTime((time) => time + incrementSeconds); } setGame(new Chess(game.fen())); setSelectedSquare(null); setPossibleMoves([]); setPromotionPending(null); } catch { setPromotionPending(null); } } function handleSquareClick(square: string) {
    if (viewedPly !== null || game.isGameOver() || (clockMinutes > 0 && (whiteTime === 0 || blackTime === 0)) || botThinking) return;
    if (botElo !== null && game.turn() === botColor) return;
    const piece = game.get(square as never);
    if (selectedSquare) {
      try {
        const movingPiece = game.get(selectedSquare as never); const promotionMove = movingPiece?.type === 'p' && ((movingPiece.color === 'w' && square[1] === '8') || (movingPiece.color === 'b' && square[1] === '1')) && game.moves({ square: selectedSquare as never, verbose: true }).some((legalMove) => legalMove.to === square); if (promotionMove) { setPromotionPending({ from: selectedSquare, to: square }); setSelectedSquare(null); setPossibleMoves([]); return; } const move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
        animateMove(move.from, move.to);
        setMoves((oldMoves) => [...oldMoves, move.san]);
        if (clockMinutes > 0 && incrementSeconds > 0) {
          if (move.color === 'w') setWhiteTime((time) => time + incrementSeconds);
          else setBlackTime((time) => time + incrementSeconds);
        }
        const nextGame = new Chess(game.fen());
        setGame(nextGame);
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      } catch {
        // Ungültiger Zug; eine eigene Figur kann neu ausgewählt werden.
      }
    }
    if (piece && piece.color === game.turn()) {
      const availableMoves = game.moves({ square: square as never, verbose: true });
      setSelectedSquare(square);
      setPossibleMoves(availableMoves.map((move) => move.to));
    } else {
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  }

  function newGame() {
    gameGenerationRef.current += 1;
    if (botDelayRef.current !== null) window.clearTimeout(botDelayRef.current);
    botDelayRef.current = null;
    if (animationTimerRef.current !== null) window.clearTimeout(animationTimerRef.current);
    animationTimerRef.current = null;
    setAnimatedMove(null);
    requestedFenRef.current = null;
    pendingGenerationRef.current = null;
    pendingGameRef.current = null;
    workerRef.current?.postMessage('stop');
    setPromotionPending(null); setGame(new Chess());
    setSelectedSquare(null);
    setPossibleMoves([]);
    setWhiteTime(clockMinutes * 60);
    setBlackTime(clockMinutes * 60);
    setMoves([]);
    setViewedPly(null);
    setBotThinking(false);
    setEngineError('');
  }

  const userColor = botColor === 'w' ? 'b' : 'w';
  const materialAdvantage = getMaterialAdvantage(game);
  const materialScore = botElo !== null
    ? (userColor === 'w' ? materialAdvantage : -materialAdvantage)
    : materialAdvantage;
  const materialLeader = materialScore === 0
    ? 'Material ausgeglichen'
    : botElo !== null
      ? (materialScore > 0 ? playerName : 'Bot') + ' hat ' + Math.abs(materialScore) + ' Punkt' + (Math.abs(materialScore) === 1 ? '' : 'e') + ' mehr'
      : (materialScore > 0 ? 'Weiß' : 'Schwarz') + ' hat ' + Math.abs(materialScore) + ' Punkt' + (Math.abs(materialScore) === 1 ? '' : 'e') + ' mehr';
  const currentPlayer = botElo !== null
    ? game.turn() === botColor ? 'Bot' : playerName
    : game.turn() === 'w' ? 'Weiß' : 'Schwarz';
  let status = 'Am Zug: ' + currentPlayer;
  if (clockMinutes > 0 && whiteTime === 0) status = '⏱️ Zeit abgelaufen – ' + (botElo !== null ? (botColor === 'b' ? 'Bot' : playerName) : 'Schwarz') + ' gewinnt.';
  else if (clockMinutes > 0 && blackTime === 0) status = '⏱️ Zeit abgelaufen – ' + (botElo !== null ? (botColor === 'w' ? 'Bot' : playerName) : 'Weiß') + ' gewinnt.';
  else if (game.isCheckmate()) status = '♚ Schachmatt! ' + (game.turn() === 'w' ? blackPlayerName : whitePlayerName) + ' gewinnt.';
  else if (game.isStalemate()) status = '🤝 Patt – Unentschieden.';
  else if (game.isDraw()) status = '🤝 Remis – Unentschieden.';
  else if (botThinking) status = '🤖 Der Bot denkt nach …';
  else if (game.inCheck()) status = '⚠️ Schach! ' + currentPlayer + ' muss reagieren.';

  if (!botRouteReady) return null;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <style>{`@keyframes chess-piece-move { from { transform: translate(var(--move-from-x), var(--move-from-y)); } to { transform: translate(0, 0); } } .animate-chess-piece-move { animation: chess-piece-move 220ms ease-out both; }`}</style>
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center px-4 py-10">
        <div className="mb-6 w-full max-w-2xl">
          <a href="/" className="text-sm text-slate-300 underline underline-offset-4 hover:text-white">← Zur Startseite</a>
          {botElo !== null && <p className="mt-3 text-sm text-emerald-300">Spiel gegen den {botElo}-Elo-Bot · {playerName} · {clockMinutes === 0 ? 'ohne Zeit' : clockMinutes + '+' + incrementSeconds}</p>}
        </div>
        <div className="mb-6 text-center">
          <div className="mb-2 text-5xl">♟️</div>
          <h1 className="text-4xl font-bold">Deine Schachplattform</h1>
          <p className="mt-2 text-slate-300">Schach. Community. Creator. Deine persönliche Schachreise.</p>
        </div>
        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-center font-semibold" role="status">{status}</div>
        {promotionPending && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="promotion-title"><div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"><h2 id="promotion-title" className="text-xl font-bold">Wähle eine Figur</h2><p className="mt-1 text-sm text-slate-400">Dein Bauer kann umgewandelt werden in:</p><div className="mt-4 grid grid-cols-4 gap-2">{([{ piece: 'q', label: 'Dame' }, { piece: 'r', label: 'Turm' }, { piece: 'b', label: 'Läufer' }, { piece: 'n', label: 'Springer' }] as const).map(({ piece, label }) => <button key={piece} type="button" onClick={() => choosePromotion(piece)} className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-950 p-3 hover:border-emerald-400 hover:bg-slate-800"><ChessPieceIcon color={game.get(promotionPending.from as never)?.color ?? 'w'} type={piece} /><span className="mt-1 text-xs">{label}</span></button>)}</div><button type="button" onClick={() => setPromotionPending(null)} className="mt-4 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Abbrechen</button></div></div>} {engineError && <p role="alert" className="mb-4 max-w-2xl rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">{engineError}</p>}
        {botElo !== null && !engineReady && !engineError && <p className="mb-4 text-sm text-slate-400">Bot wird geladen …</p>}
        <div className="mb-4 flex w-full max-w-2xl justify-between gap-4">
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3"><div className="text-sm text-slate-400">{whitePlayerName}</div><div className="text-2xl font-bold">{clockMinutes === 0 ? '∞' : formatTime(whiteTime)}</div></div>
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-right"><div className="text-sm text-slate-400">{blackPlayerName}</div><div className="text-2xl font-bold">{clockMinutes === 0 ? '∞' : formatTime(blackTime)}</div></div>
        </div>
        <div className="mb-4 flex w-full max-w-2xl items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-5 py-3" aria-live="polite" aria-label={'Materialbilanz: ' + materialLeader}>
          <div><div className="text-sm text-slate-400">Figurenpunkte</div><div className="text-sm font-medium">{materialLeader}</div></div>
          <div className={'text-2xl font-bold tabular-nums ' + (materialScore > 0 ? 'text-emerald-300' : materialScore < 0 ? 'text-rose-300' : 'text-slate-200')}>{materialScore > 0 ? '+' : materialScore < 0 ? '−' : ''}{Math.abs(materialScore)}</div>
        </div>
        {viewedPly !== null && (
          <p className="mb-4 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
            <span>Frühere Stellung nach {viewedPly} von {moves.length} Halbzügen. Die Partie läuft unverändert weiter.</span>
            <button type="button" onClick={() => viewPosition(null)} className="shrink-0 underline underline-offset-4">Zur Live-Stellung</button>
          </p>
        )}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="chessboard-frame overflow-hidden shadow-2xl">
            <div className="relative grid grid-cols-8">
              {displayedBoard.map((row, rowIndex) => row.map((piece, colIndex) => {
                const square = isFlipped
                  ? String.fromCharCode(104 - colIndex) + (rowIndex + 1)
                  : String.fromCharCode(97 + colIndex) + (8 - rowIndex);
                const isLight = (rowIndex + colIndex) % 2 === 1;
                const fileDelta = animatedMove ? animatedMove.to.charCodeAt(0) - animatedMove.from.charCodeAt(0) : 0;
                const rankDelta = animatedMove ? Number(animatedMove.to[1]) - Number(animatedMove.from[1]) : 0;
                const moveFromX = (isFlipped ? fileDelta : -fileDelta) * 100;
                const moveFromY = (isFlipped ? -rankDelta : rankDelta) * 100;
                const isAnimatedMove = viewedPly === null && animatedMove?.to === square;
                return (
                  <button key={square} type="button" aria-label={square + (piece ? ', ' + (piece.color === 'w' ? 'weiße' : 'schwarze') + ' Figur' : '')}
                    disabled={viewedPly !== null || botThinking || (botElo !== null && game.turn() === botColor)}
                    onClick={() => handleSquareClick(square)}
                    className={'relative flex aspect-square w-11 items-center justify-center text-3xl disabled:cursor-wait sm:w-16 sm:text-5xl md:w-20 md:text-6xl ' + (isLight ? 'chessboard-light' : 'chessboard-dark') + (selectedSquare === square ? ' ring-4 ring-blue-500 ring-inset' : '')}>
                    {piece && <span style={isAnimatedMove ? ({ '--move-from-x': moveFromX + '%', '--move-from-y': moveFromY + '%' } as import('react').CSSProperties) : undefined} className={'absolute inset-0 flex items-center justify-center' + (isAnimatedMove ? ' animate-chess-piece-move' : '')}><ChessPieceIcon color={piece.color} type={piece.type} /></span>}{colIndex === 0 && <span aria-hidden="true" className={'pointer-events-none absolute left-1 top-0.5 z-10 text-[9px] font-bold sm:text-xs ' + (isLight ? 'text-[#537765]' : 'text-[#dbe5dc]')}>{square[1]}</span>}{rowIndex === 7 && <span aria-hidden="true" className={'pointer-events-none absolute bottom-0 right-1 z-10 text-[9px] font-bold sm:text-xs ' + (isLight ? 'text-[#537765]' : 'text-[#dbe5dc]')}>{square[0].toUpperCase()}</span>}{possibleMoves.includes(square) && <span className="absolute h-3 w-3 rounded-full bg-slate-800/60" />}
                  </button>
                );
              }))}
            </div>

          </div>
          <div className="w-full rounded-xl border border-slate-700 bg-slate-900 p-4 lg:w-64">
            <h2 className="mb-3 text-lg font-bold">Zugliste</h2>
            {moves.length === 0 ? <p className="text-sm text-slate-500">Noch keine Züge.</p> : (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {moves.map((move, index) => <button type="button" key={index} onClick={() => viewPosition(index + 1)} className={'rounded px-2 py-1 text-left ' + ((viewedPly ?? moves.length) === index + 1 ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-300')}>{index % 2 === 0 ? (Math.floor(index / 2) + 1) + '. ' + move : move}</button>)}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => viewPosition(Math.max(0, (viewedPly ?? moves.length) - 1))} disabled={(viewedPly ?? moves.length) === 0} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">← Zurück</button>
              <span className="text-xs tabular-nums text-slate-400">{viewedPly ?? moves.length} / {moves.length}</span>
              <button type="button" onClick={() => viewPosition(Math.min(moves.length, (viewedPly ?? moves.length) + 1))} disabled={(viewedPly ?? moves.length) >= moves.length} className="rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Weiter →</button>
            </div>
            <button type="button" onClick={() => viewPosition(null)} disabled={viewedPly === null} className="mt-2 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm disabled:opacity-40">Live-Stellung anzeigen</button>
          </div>
        </div>
        <button type="button" onClick={newGame} className="mt-6 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950">🔄 Neues Spiel</button>
        <p className="mt-5 max-w-md text-center text-sm text-slate-400">{clockMinutes === 0 ? 'Ohne Zeitbegrenzung' : 'Bedenkzeit: ' + clockMinutes + '+' + incrementSeconds + ' · nach jedem Zug +' + incrementSeconds + ' s'} · Wähle eine Figur und anschließend ihr Zielfeld.</p>
      </div>
    </main>
  );
}
