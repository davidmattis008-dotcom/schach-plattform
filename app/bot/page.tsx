"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChessPieceIcon } from "@/components/chess-piece";
import { BOT_ELO_MAX, BOT_ELO_MIN, FIXED_BOTS } from "@/lib/bots";

const clockOptions = [
  { minutes: 0, increment: 0, label: "Ohne Zeit", category: "frei" },
  { minutes: 1, increment: 0, label: "1+0", category: "Bullet" },
  { minutes: 3, increment: 2, label: "3+2", category: "Blitz" },
  { minutes: 5, increment: 0, label: "5+0", category: "Blitz" },
  { minutes: 10, increment: 0, label: "10+0", category: "Rapid" },
  { minutes: 15, increment: 10, label: "15+10", category: "Rapid" },
  { minutes: 30, increment: 0, label: "30+0", category: "Klassisch" },
];

const colorOptions = [
  { id: "white", label: "Weiß", color: "w" as const },
  { id: "black", label: "Schwarz", color: "b" as const },
  { id: "random", label: "Zufall", color: null },
];

export default function BotPage() {
  const [ready, setReady] = useState(false);
  const [selectedElo, setSelectedElo] = useState(1500);
  const [customBot, setCustomBot] = useState(false);
  const [selectedClock, setSelectedClock] = useState(4);
  const [selectedColor, setSelectedColor] = useState("white");
  const selectedBot = FIXED_BOTS.find((bot) => bot.elo === selectedElo);
  const clock = clockOptions[selectedClock];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const elo = Number(params.get("elo"));
    const isCustom = params.get("custom") === "true";
    const isFixedBot = FIXED_BOTS.some((bot) => bot.elo === elo);
    if (!Number.isInteger(elo) || elo < BOT_ELO_MIN || elo > BOT_ELO_MAX || (!isCustom && !isFixedBot)) {
      window.location.replace("/");
      return;
    }

    queueMicrotask(() => {
      setSelectedElo(elo);
      setCustomBot(isCustom);
      const minutes = Number(params.get("time"));
      const increment = Number(params.get("increment"));
      const clockIndex = clockOptions.findIndex((option) => option.minutes === minutes && option.increment === increment);
      if (clockIndex >= 0) setSelectedClock(clockIndex);
      const color = params.get("color");
      if (color === "white" || color === "black" || color === "random") setSelectedColor(color);
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-neutral-400 underline underline-offset-4 hover:text-white">
          ← Startseite
        </Link>
        <header className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Partie vorbereiten</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {customBot ? "Eigene Spielstärke" : `Gegen ${selectedBot?.name ?? "Bot"}`}
          </h1>
          {!customBot && <p className="mt-1 text-sm text-neutral-400">{selectedElo} Elo</p>}
        </header>

        {customBot && (
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 sm:p-6" aria-label="Eigene Bot-Spielstärke">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="custom-bot-elo" className="font-semibold">Spielstärke</label>
              <span className="rounded-lg bg-white px-3 py-1.5 text-sm font-bold tabular-nums text-black">{selectedElo} Elo</span>
            </div>
            <input
              id="custom-bot-elo"
              type="range"
              min={BOT_ELO_MIN}
              max={BOT_ELO_MAX}
              step="50"
              value={selectedElo}
              aria-label="Eigene Bot-Spielstärke"
              onChange={(event) => setSelectedElo(Number(event.target.value))}
              className="mt-5 w-full accent-white"
            />
            <div className="flex justify-between text-xs tabular-nums text-neutral-500">
              <span>{BOT_ELO_MIN}</span>
              <span>{BOT_ELO_MAX}</span>
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5" aria-label="Farbe auswählen">
          <h2 className="mb-3 font-semibold">Deine Farbe</h2>
          <div className="grid grid-cols-3 gap-2">
            {colorOptions.map((option) => {
              const selected = selectedColor === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedColor(option.id)}
                  className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    selected ? "border-white bg-white text-black" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  {option.color ? <span className="h-6 w-6" aria-hidden="true"><ChessPieceIcon color={option.color} type="k" /></span> : <span aria-hidden="true">🎲</span>}
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:p-5" aria-label="Bedenkzeit auswählen">
          <h2 className="mb-3 font-semibold">Bedenkzeit</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {clockOptions.map((option, index) => {
              const selected = selectedClock === index;
              return (
                <button
                  key={`${option.minutes}+${option.increment}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedClock(index)}
                  className={`min-h-14 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    selected ? "border-white bg-white text-black" : "border-neutral-800 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  <span className="block text-sm font-bold tabular-nums">{option.label}</span>
                  <span className={`mt-0.5 block text-xs ${selected ? "text-neutral-600" : "text-neutral-500"}`}>
                    {option.increment ? `${option.category} · +${option.increment}s` : option.category}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-400">
            {customBot ? `${selectedElo} Elo` : selectedBot?.name} · {selectedColor === "random" ? "Zufallsfarbe" : selectedColor === "white" ? "Weiß" : "Schwarz"} · {clock.label}
          </p>
          <Link
            href={`/play?mode=bot&elo=${selectedElo}&time=${clock.minutes}&increment=${clock.increment}&color=${selectedColor}&custom=${customBot}&configured=1`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 py-3 font-semibold text-black transition hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Partie starten
          </Link>
        </div>
      </div>
    </main>
  );
}
