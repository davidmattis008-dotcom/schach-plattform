"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setMessage(error.message); setLoading(false); return; }
    if (data.session) { router.push("/profile/setup"); return; }
    setMessage("Registrierung erfolgreich. Bitte bestätige zuerst deine E-Mail. Danach kannst du dich einloggen.");
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="CHESSCAGE Startseite" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-white transition hover:text-slate-200"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover"/><span>CHESS<span className="text-[#d4af37]">CAGE</span></span></Link>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Account erstellen</h1>
          <p className="mt-2 text-slate-400">Erstelle deinen Account für die Schachplattform.</p>
          <form onSubmit={handleRegister} className="mt-7 space-y-5">
            <div><label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-200">E-Mail</label><input id="register-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-emerald-400" placeholder="deine@email.de" /></div>
            <div><label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-200">Passwort</label><input id="register-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-emerald-400" placeholder="Mindestens 6 Zeichen" /></div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">{loading ? "Erstelle Account..." : "Account erstellen"}</button>
          </form>
          <p className="mt-6 border-t border-slate-800 pt-5 text-sm text-slate-400">Schon registriert? <Link href="/login" className="font-medium text-slate-200 underline underline-offset-4 hover:text-emerald-300">Einloggen</Link></p>
          {message && <p className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}
        </section>
      </div>
    </main>
  );
}
