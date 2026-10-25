import { Chess } from "chess.js";
import { ChessPieceIcon } from "@/components/chess-piece";

type Props = { fen: string; label?: string; onSquareClick?: (square: string) => void; selected?: string | null; targets?: string[]; orientation?: "white" | "black"; };
const files = "abcdefgh";
export function MiniChessboard({ fen, label, onSquareClick, selected, targets = [], orientation = "white" }: Props) {
 const board = new Chess(fen).board();
 const rows = orientation === "black" ? board.slice().reverse().map((rank) => rank.slice().reverse()) : board;
 const columns = orientation === "black" ? files.split("").reverse().join("") : files;
 return <div role={onSquareClick ? "grid" : "img"} aria-label={label ?? "Schachbrett"} className="chessboard-frame grid aspect-square w-full grid-cols-8 overflow-hidden shadow-xl shadow-black/20">
  {rows.flatMap((rank, row) => rank.map((piece, col) => {
   const rankNumber = orientation === "black" ? row + 1 : 8 - row;
   const square = columns[col] + rankNumber; const light = (row+col)%2===1; const isTarget = targets.includes(square);
   const className = "relative flex aspect-square items-center justify-center " + (light ? "chessboard-light " : "chessboard-dark ") + (selected===square ? "ring-4 ring-inset ring-amber-300 " : "") + (onSquareClick ? "cursor-pointer" : "");
   const contents = <>{piece && <ChessPieceIcon color={piece.color} type={piece.type} />}{isTarget && <span aria-hidden="true" className={"pointer-events-none absolute h-3 w-3 rounded-full " + (piece ? "chessboard-capture-target" : "chessboard-move-target")} />}{col===0 && <span className={"absolute left-1 top-0.5 text-[9px] font-bold " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{rankNumber}</span>}{row===7 && <span className={"absolute bottom-0 right-1 text-[9px] font-bold " + (light ? "text-[#537765]" : "text-[#dbe5dc]")}>{columns[col].toUpperCase()}</span>}</>;
   return onSquareClick ? <button type="button" role="gridcell" aria-label={square} key={square} onClick={() => onSquareClick(square)} className={className}>{contents}</button> : <div key={square} className={className}>{contents}</div>;
  }))}
 </div>;
}
