"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setBusy(true);
    setError("");
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setError("Abmelden hat gerade nicht geklappt. Bitte versuche es erneut.");
      setBusy(false);
      return;
    }
    window.location.assign("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Konto</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Einstellungen</h1>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <h2 className="font-semibold">Sitzung</h2>
          <p className="mt-1 text-sm text-slate-400">Melde dich auf diesem Gerät von deinem Konto ab.</p>
          {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
          <button type="button" onClick={() => void handleLogout()} disabled={busy} className="mt-4 rounded-lg border border-rose-400/30 px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-50">{busy ? "Wird abgemeldet …" : "Abmelden"}</button>
        </section>
      </div>
    </main>
  );
}
