import Link from "next/link";
import { MiniChessboard } from "@/components/mini-chessboard";
import { CageAiPanel } from "@/components/cage-ai-panel";
import { FIXED_BOTS } from "@/lib/bots";
import { tacticsPreviewFen } from "@/lib/tactics";

export default function Home() {
  return (
    <main className="min-h-screen bg-black px-5 pb-10 pt-1 text-white sm:px-8 sm:pt-3 md:pt-5">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 sm:gap-7">
        <div className="w-full">
          <CageAiPanel
            contextLabel="CageAI kann künftig deine Trainingsfortschritte nutzen, um passende nächste Schritte vorzuschlagen."
            contextReady
            contextBadge="Persönliche Empfehlung"
            placeholder="Frage nach deiner nächsten Trainingsempfehlung …"
            quickPrompts={["Was sollte ich als Nächstes trainieren?"]}
            requestConfig={{ purpose: "training_plan" }}
          />
        </div>
        <Link
          href="/taktik"
          aria-label="Taktikaufgabe öffnen"
          className="block w-full max-w-md rounded-2xl transition duration-300 hover:scale-[1.015] hover:shadow-[0_0_36px_rgba(212,175,55,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
        >
          <MiniChessboard fen={tacticsPreviewFen} label="Taktikaufgabe" />
        </Link>

        <section aria-label="Gegen Bot spielen" className="w-full">
          <h1 className="mb-3 text-center text-lg font-bold tracking-tight sm:mb-4 sm:text-xl">Gegen Bot spielen</h1>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {FIXED_BOTS.map((bot) => (
              <Link
                key={bot.elo}
                href={`/bot?elo=${bot.elo}&custom=false`}
                className="group flex min-h-20 items-center gap-3 rounded-xl border border-white/10 bg-neutral-950 px-3 py-3 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/70 hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
              >
                <span aria-hidden="true" className="text-2xl text-[#d4af37] transition-transform duration-200 group-hover:scale-110">{bot.icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{bot.name}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-neutral-400">{bot.elo} Elo</span>
                </span>
              </Link>
            ))}
            <Link
              href="/bot?elo=1500&custom=true"
              className="flex min-h-20 items-center justify-center rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/[0.06] px-3 py-3 text-center text-sm font-semibold text-[#e7c95c] transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37] hover:bg-[#d4af37]/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
            >
              Eigene Spielstärke
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
