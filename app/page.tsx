import Link from "next/link";
import { MiniChessboard } from "@/components/mini-chessboard";
import { tacticsPreviewFen } from "@/lib/tactics";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 py-10 text-white">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <Link
          href="/taktik"
          aria-label="Taktikaufgabe öffnen"
          className="block w-full rounded-2xl transition duration-300 hover:scale-[1.015] hover:shadow-[0_0_36px_rgba(212,175,55,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
        >
          <MiniChessboard fen={tacticsPreviewFen} label="Taktikaufgabe" />
        </Link>
        <Link
          href="/bot"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d4af37]/70 bg-[#d4af37] px-7 py-3 text-sm font-bold text-black shadow-[0_8px_30px_rgba(212,175,55,0.12)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#e7c95c] hover:shadow-[0_12px_34px_rgba(212,175,55,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Gegen Bot spielen
        </Link>
      </div>
    </main>
  );
}
