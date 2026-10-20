"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MiniChessboard } from "@/components/mini-chessboard";
import { tacticsPreviewFen } from "@/lib/tactics";
import { getTacticsProgress, INITIAL_TACTICS_PROGRESS, subscribeToTacticsProgress } from "@/lib/tactics-progress";
import { createClient } from "@/lib/supabase/client";
import { InstallAppLink } from "@/components/install-app-link";

const trainingActions = [
  { title: "Eigene Partie analysieren", detail: "PGN einfügen oder Partie-Datei laden", href: "/analyse", tag: "ANALYSE", mark: "⌕" },
  { title: "Taktik trainieren", detail: "Löse Aufgaben und verfolge deinen Trainingsstand", href: "/taktik", tag: "SOLO", mark: "♞" },
  { title: "Vereinstraining planen", detail: "Gruppen, Pläne und Aufgaben organisieren", href: "/verein", tag: "TEAM", mark: "♙" },
];

const dashboardSections = [
  {
    id: "training-analysis",
    title: "Dein Schachtraining",
    description: "Analysiere Partien, übe konkrete Motive und baue dein Wissen Schritt für Schritt aus.",
    items: [
      { title: "Selbstständig Schach lernen", detail: "Arbeite dich ohne Vorwissen vom ersten Zug bis zu Endspielen vor.", href: "/lernen", mark: "↗" },
      { title: "Taktikaufgaben", detail: "Trainiere mit Aufgaben passend zu deiner Taktik-Elo.", href: "/taktik", mark: "♞" },
      { title: "Eröffnungen", detail: "Spiele ausgewählte Varianten Zug für Zug nach.", href: "/repertoire", mark: "⌂" },
      { title: "Analysebrett", detail: "Untersuche Stellungen und spiele Züge nach.", href: "/analyse", mark: "⌕" },
      { title: "Partieverlauf", detail: "Finde deine gespeicherten Partien wieder und arbeite sie nach.", href: "/partien", mark: "↗" },
    ],
  },
  {
    id: "club-training",
    title: "Training im Verein",
    description: "Bereite Einheiten vor, teile Aufgaben mit deiner Gruppe und verfolge die Teilnahme.",
    items: [
      { title: "Vereins- und Gruppentraining", detail: "Erstelle Trainingspläne, weise Aufgaben zu und begleite deine Gruppe.", href: "/verein", mark: "♙" },
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
          <Link href="/" aria-label="CHESSCAGE Startseite" className="flex items-center gap-3 text-xl font-semibold tracking-tight text-white">
            <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl object-cover" />
            <span className="text-base tracking-[0.12em]"><span>CHESS</span><span className="text-[#d4af37]">CAGE</span></span>
          </Link>
          <div className="flex items-center gap-3">
            {!loading && !username && <Link href="/login" className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Anmelden</Link>}
          </div>
          <InstallAppLink className="hidden items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-400/70 hover:text-emerald-200 md:inline-flex">
            <span aria-hidden="true">↓</span>App installieren
          </InstallAppLink>
        </header>

        <section aria-labelledby="coach-heading" className="mb-9 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-slate-900/80 to-slate-900/40 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Dein Training · allein und im Verein</p>
          <h1 id="coach-heading" className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Verstehe deine Partien. Trainiere gezielt. Entwickle dich weiter.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Analysiere eigene Partien mit Stockfish, übe Taktik und organisiere Trainingsaufgaben für deine Gruppe. Deine Trainingswerte zeigen echte Ergebnisse – keine erfundenen Empfehlungen.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/analyse" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200">
              Eigene Partie analysieren
            </Link>
            <Link href="/verein" className="rounded-xl border border-slate-700 bg-slate-950/50 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
              Vereinstraining planen
            </Link>
          </div>
        </section>

        <section aria-label="Taktikvorschau" className="mx-auto mb-10 w-full max-w-md">
          <Link href="/taktik" aria-label="Taktikaufgabe öffnen" className="block transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            <MiniChessboard fen={tacticsPreviewFen} label="Vorschau einer Taktikaufgabe" />
          </Link>
        </section>

        <section aria-labelledby="progress-heading" className="mb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Persönlicher Trainingsstand</p>
              <h2 id="progress-heading" className="mt-1 text-xl font-semibold text-white">Dein Taktik-Fortschritt</h2>
            </div>
            <p className="max-w-sm text-xs leading-5 text-slate-500">Taktikwerte werden aktuell nur in diesem Browser gespeichert. Sie sind keine DWZ- oder Elo-Prognose.</p>
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

        <section aria-labelledby="training-actions-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Dein nächster Schritt</p>
              <h2 id="training-actions-heading" className="mt-1 text-xl font-semibold text-white">Training starten</h2>
            </div>
            <Link href="/partien" className="text-sm text-slate-400 transition hover:text-emerald-300">Meine Partien <span aria-hidden="true">→</span></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trainingActions.map((activity) => (
              <Link key={activity.href} href={activity.href} className="group flex min-h-36 flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-emerald-500/50 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                <div className="flex items-start justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-lg text-emerald-300" aria-hidden="true">{activity.mark}</span>
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
