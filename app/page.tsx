"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MiniChessboard } from "@/components/mini-chessboard";
import { tacticsPreviewFen } from "@/lib/tactics";
import { getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress } from "@/lib/tactics-progress";
import { createClient } from "@/lib/supabase/client";
import { InstallAppLink } from "@/components/install-app-link";

const activities = [
  { title: "Online spielen", detail: "Finde einen Gegner", href: "/online", tag: "LIVE", mark: "↗" },
  { title: "Gegen den Bot", detail: "Spiele in deinem Tempo", href: "/bot", tag: "SOLO", mark: "♟" },
];

const dashboardSections = [
  {
    id: "training-analysis",
    title: "Training & Analyse",
    description: "Verbessere deine Taktik, lerne Eröffnungen und untersuche Stellungen.",
    items: [
      { title: "Selbstständig Schach lernen", detail: "Arbeite dich ohne Vorwissen vom ersten Zug bis zu Endspielen vor.", href: "/lernen", mark: "↗" },
      { title: "Taktikaufgaben", detail: "Trainiere mit Aufgaben passend zu deiner Taktik-Elo.", href: "/taktik", mark: "♞" },
      { title: "Eröffnungen", detail: "Spiele ausgewählte Varianten Zug für Zug nach.", href: "/repertoire", mark: "⌂" },
      { title: "Analysebrett", detail: "Untersuche Stellungen und spiele Züge nach.", href: "/analyse", mark: "⌕" },
    ],
  },
  {
    id: "community",
    title: "Community",
    description: "Finde Mitspieler, tritt Turnieren bei und vergleiche Wertungen.",
    items: [
      { title: "Verein & Training", detail: "Organisiere Gruppen, gemeinsame Aufgaben und Turniere.", href: "/verein", mark: "♙" },
      { title: "Turniere", detail: "Erstelle ein Turnier oder spiele in einer Runde mit.", href: "/tournaments", mark: "♜" },
      { title: "Freunde & Nachrichten", detail: "Finde Spieler und verwalte deine Kontakte.", href: "/freunde", mark: "♙" },
      { title: "Ranglisten", detail: "Vergleiche Online-Wertungen mit anderen Spielern.", href: "/ranglisten", mark: "↗" },
    ],
  },
];

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const progress = useSyncExternalStore(
    subscribeToTacticsProgress,
    getTacticsProgress,
    () => INITIAL_TACTICS_PROGRESS,
  );
  const accuracy = progress.attempted > 0
    ? `${Math.round((progress.solved / progress.attempted) * 100)}%`
    : "—";

  useEffect(() => {
    async function loadProfile() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.from("profiles").select("username").eq("id", user.id).single();
        if (data) setUsername(data.username);
      } catch (error) {
        console.error("Profil konnte nicht geladen werden:", error);
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-5 border-b border-slate-800 pb-7">
          <Link href="/" aria-label="Schachplattform Startseite" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
            <img src="/chess-logo-192.png" alt="" className="h-11 w-11 rounded-xl" />
            <span>Schach<span className="font-normal text-slate-400">plattform</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {username && <Link href="/einstellungen" className="rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white">Einstellungen</Link>}
            {!loading && !username && <Link href="/login" className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Anmelden</Link>}
          </div>
          <InstallAppLink className="hidden items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/70 hover:text-emerald-200 md:inline-flex">
            <span aria-hidden="true">↓</span>App installieren
          </InstallAppLink>
        </header>

        <section aria-labelledby="welcome-heading" className="mb-10 grid gap-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl shadow-black/10 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Selbstständig lernen</p>
            <h1 id="welcome-heading" className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">{username ? <>Willkommen zurück, <span className="text-emerald-300">{username}</span>.</> : "Lerne Schach von Anfang an."}</h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">Lerne die Regeln, übe in deinem Tempo und arbeite dich Schritt für Schritt bis zu Taktik und Endspielen vor.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/lernen" className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                Lernpfad starten <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <Link href="/taktik" aria-label="Taktikaufgabe öffnen" className="mx-auto block w-full max-w-md transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <MiniChessboard fen={tacticsPreviewFen} label="Vorschau einer Taktikaufgabe" />
          </Link>
        </section>

        <section aria-labelledby="progress-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Training</p>
              <h2 id="progress-heading" className="mt-1 text-xl font-semibold text-white">Dein Taktik-Fortschritt</h2>
            </div>
            <p className="text-xs text-slate-500">Wird in diesem Browser gespeichert</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Taktik-Elo", value: progress.rating, detail: "Dein aktueller Trainingsstand" },
              { label: "Gelöste Aufgaben", value: progress.solved, detail: `von ${progress.attempted} Versuchen` },
              { label: "Trefferquote", value: accuracy, detail: progress.attempted > 0 ? "bei deinen bisherigen Aufgaben" : "erscheint nach deinem ersten Versuch" },
            ].map((stat) => (
              <article key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <p className="text-sm text-slate-400">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="spielen-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dein nächster Zug</p>
              <h2 id="spielen-heading" className="mt-1 text-xl font-semibold text-white">Spielen</h2>
            </div>
            <Link href="/partien" className="text-sm text-slate-400 transition hover:text-emerald-300">Partieverlauf <span aria-hidden="true">→</span></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activities.map((activity, index) => (
              <Link key={activity.href} href={activity.href} className="group flex min-h-36 flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-emerald-500/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                <div className="flex items-start justify-between">
                  <span className={index === 0 ? "flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-lg text-emerald-300" : "flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-lg text-slate-300"} aria-hidden="true">{activity.mark}</span>
                  <span className="rounded-md border border-slate-700/80 px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500">{activity.tag}</span>
                </div>
                <div className="mt-5 flex items-end justify-between gap-2">
                  <div><h3 className="font-semibold text-slate-100">{activity.title}</h3><p className="mt-1 text-sm text-slate-400">{activity.detail}</p></div>
                  <span aria-hidden="true" className="text-xl text-slate-500 transition group-hover:translate-x-1 group-hover:text-emerald-300">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {dashboardSections.map((section) => (
          <section key={section.id} aria-labelledby={`section-${section.id}`} className="mt-10">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Entdecken</p>
              <h2 id={`section-${section.id}`} className="mt-1 text-xl font-semibold text-white">{section.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{section.description}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="group flex min-h-32 items-start gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition hover:border-emerald-500/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-lg text-emerald-300">{item.mark}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 font-semibold text-slate-100">
                      {item.title}
                      <span aria-hidden="true" className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-emerald-300">→</span>
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-slate-400">{item.detail}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
