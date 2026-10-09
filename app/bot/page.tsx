'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChessPieceIcon } from '@/components/chess-piece';


const clockOptions = [
  { id: 'free', minutes: 0, increment: 0, label: 'Ohne Zeit', category: 'frei' },
  { id: '1+0', minutes: 1, increment: 0, label: '1+0', category: 'Bullet' },
  { id: '3+2', minutes: 3, increment: 2, label: '3+2', category: 'Blitz' },
  { id: '5+0', minutes: 5, increment: 0, label: '5+0', category: 'Blitz' },
  { id: '10+0', minutes: 10, increment: 0, label: '10+0', category: 'Rapid' },
  { id: '15+10', minutes: 15, increment: 10, label: '15+10', category: 'Rapid' },
  { id: '30+0', minutes: 30, increment: 0, label: '30+0', category: 'Klassisch' },
];

const colorOptions = [
  { id: 'white', label: 'Weiß', color: 'w' as const, description: 'Du spielst mit den weißen Figuren.' },
  { id: 'black', label: 'Schwarz', color: 'b' as const, description: 'Du spielst mit den schwarzen Figuren.' },
  { id: 'random', label: 'Zufall', color: null, description: 'Die Farbe wird für dich ausgelost.' },
];

const bots = [
  { elo: 500, name: 'Anfänger', description: 'Ein ruhiger Einstieg zum Üben der Grundlagen.', icon: '♟' },
  { elo: 1000, name: 'Gelegenheitsspieler', description: 'Ein entspannter Gegner für die ersten Partien.', icon: '♞' },
  { elo: 1500, name: 'Taktiker', description: 'Fordert dich mit taktischen Ideen.', icon: '♜' },
  { elo: 2000, name: 'Stratege', description: 'Plant voraus und nutzt kleine Fehler.', icon: '♛' },
  { elo: 2500, name: 'Meister', description: 'Die stärkste Herausforderung.', icon: '♚' },
];

export default function BotPage() {
  const [selectedElo, setSelectedElo] = useState<number | null>(null);
  const [selectedClock, setSelectedClock] = useState('10+0');
  const [selectedColor, setSelectedColor] = useState('white');
  const clock = clockOptions.find((option) => option.id === selectedClock) ?? clockOptions[4];

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-white sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="text-sm text-slate-300 underline underline-offset-4 hover:text-white">
          ← Zur Startseite
        </Link>
        <header className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Spielen · Bot</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Gegen einen Bot spielen</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Wähle die Spielstärke deines Gegners. Die Bots laufen kostenlos direkt in deinem Browser.
          </p>
        </header>
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <section aria-label="Bot auswählen" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white">1 · Spielstärke</h2>
              <span className="text-xs text-slate-500">Bot wählen</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bots.map((bot) => {
                const isSelected = selectedElo === bot.elo;
                return (
                  <button
                    key={bot.elo}
                    type="button"
                    aria-pressed={isSelected}
                    title={bot.description}
                    onClick={() => setSelectedElo(bot.elo)}
                    className={`min-h-20 rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                      isSelected
                        ? 'border-amber-300 bg-amber-300/10 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]'
                        : 'border-neutral-800 bg-black text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xl text-white" aria-hidden="true">{bot.icon}</span>
                      <span className="text-[11px] font-semibold text-amber-200">{isSelected ? "✓ " : ""}{bot.elo} Elo</span>
                    </span>
                    <span className="mt-1 block truncate text-xs font-semibold sm:text-sm">{bot.name}</span>
                    <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{bot.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="space-y-4">
            <section aria-label="Farbe auswählen" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 sm:p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">2 · Deine Farbe</h2>
              <div className="grid grid-cols-3 gap-2">
                {colorOptions.map((option) => {
                  const isSelected = selectedColor === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${option.label}: ${option.description}`}
                      onClick={() => setSelectedColor(option.id)}
                      className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                        isSelected
                          ? 'border-amber-300 bg-amber-300/10 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]'
                          : 'border-neutral-800 bg-black text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900'
                      }`}
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true">{option.color ? <ChessPieceIcon color={option.color} type="k" /> : <span className="text-lg">🎲</span>}</span>
                      <span>{isSelected ? "✓ " : ""}{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section aria-label="Bedenkzeit auswählen" className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">3 · Bedenkzeit</h2>
                <span className="text-[11px] text-neutral-500">inkl. Zuschlag</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {clockOptions.map((option) => {
                  const isSelected = selectedClock === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedClock(option.id)}
                      className={`min-h-14 rounded-xl border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                        isSelected
                          ? 'border-amber-300 bg-amber-300/10 text-amber-100 shadow-[inset_0_0_0_1px_rgba(252,211,77,0.2)]'
                          : 'border-neutral-800 bg-black text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900'
                      }`}
                    >
                      <span className="block text-sm font-bold tabular-nums">{option.label}{isSelected ? " ✓" : ""}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{option.category}{option.increment > 0 ? ` · +${option.increment}s` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:p-4">
          {selectedElo !== null && (
            <div className="mb-3 min-w-0 sm:mb-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Deine Partie</p>
              <p className="mt-1 truncate text-sm text-neutral-200">
                {bots.find((bot) => bot.elo === selectedElo)?.name} · {selectedColor === 'random' ? 'Zufallsfarbe' : selectedColor === 'white' ? 'Weiß' : 'Schwarz'} · {clock.label} {clock.category}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {selectedElo !== null ? (
              <a href={'/play?mode=bot&elo=' + selectedElo + '&time=' + clock.minutes + '&increment=' + clock.increment + '&color=' + selectedColor} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100">
                Spiel starten →
              </a>
            ) : null}
          </div>
        </div>

      </div>
    </main>
  );
}
