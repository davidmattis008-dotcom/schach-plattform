import Link from "next/link";
import { ChessClubTraining } from "@/components/chess-club-training";

export default function ChessClubTrainingPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-slate-400 underline underline-offset-4 hover:text-white">← Übersicht</Link>
        <header className="mb-7 mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Kostenloses Vereinstraining</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Gemeinsam besser werden.</h1>
        </header>
        <ChessClubTraining />
      </div>
    </main>
  );
}
