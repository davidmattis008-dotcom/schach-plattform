"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MiniChessboard } from "@/components/mini-chessboard";
import { tacticsPreviewFen } from "@/lib/tactics";
import { createClient } from "@/lib/supabase/client";
import { InstallAppLink } from "@/components/install-app-link";

const modules = [
  { title: "Bot", href: "/bot", mark: "♟" },
  { title: "Analyse", href: "/analyse", mark: "⌕" },
  { title: "Taktik", href: "/taktik", mark: "♞" },
  { title: "Lernpfad", href: "/lernen", mark: "↗" },
  { title: "Eröffnungen", href: "/repertoire", mark: "⌂" },
  { title: "Mattmuster", href: "/lernen/mattsetzen", mark: "♛" },
  { title: "Endspiele", href: "/lernen/endspiele", mark: "♜" },
  { title: "Schachregeln", href: "/lernen/regeln", mark: "♙" },
  { title: "KI-Analyse", href: "/ki", mark: "✧" },
  { title: "Coach", href: "/coach", mark: "✦" },
  { title: "Verein", href: "/verein", mark: "♙" },
  { title: "Freunde", href: "/freunde", mark: "♟" },
  { title: "Chat", href: "/chat", mark: "✉" },
];

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
        if (error) throw error;
        if (active && data?.username) setUsername(data.username);
      } catch (error) {
        console.error("Profil konnte nicht geladen werden:", error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <Link href="/" aria-label="CHESSCAGE Startseite" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
            <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl object-cover" />
            <span className="text-base tracking-[0.12em]"><span>CHESS</span><span className="text-[#d4af37]">CAGE</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {!loading && (username
              ? <Link href="/profile" className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:border-emerald-400/70">{username}</Link>
              : <Link href="/login" className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Anmelden</Link>)}
            <InstallAppLink className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/70 hover:text-emerald-200">
              <span aria-hidden="true">↓</span>App installieren
            </InstallAppLink>
          </div>
        </header>

        <section aria-label="Taktik" className="mx-auto mb-8 w-full max-w-md">
          <Link href="/taktik" aria-label="Taktikaufgabe öffnen" className="block transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <MiniChessboard fen={tacticsPreviewFen} label="Taktikaufgabe" />
          </Link>
        </section>

        <nav aria-label="Module" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.href} href={module.href} className="group flex min-h-24 items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-500/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-xl text-emerald-300">{module.mark}</span>
              <span className="flex-1 font-semibold text-slate-100">{module.title}</span>
              <span aria-hidden="true" className="text-xl text-slate-500 transition group-hover:translate-x-1 group-hover:text-emerald-300">→</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
