"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/auth/callback" });
      if (error) throw error;
      setMessage("Wenn ein Konto mit dieser E-Mail existiert, erhältst du in Kürze eine E-Mail mit dem Link zum Zurücksetzen.");
    } catch (error) {
      console.error("Passwort-Reset konnte nicht angefordert werden:", error);
      setMessage("Die Anfrage konnte gerade nicht gesendet werden. Bitte versuche es später erneut.");
    } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="CHESSCAGE Startseite" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-white transition hover:text-slate-200"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover"/><span>CHESS<span className="text-[#d4af37]">CAGE</span></span></Link>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Passwort zurücksetzen</h1>
          <p className="mt-2 text-slate-400">Gib die E-Mail-Adresse deines Accounts ein. Wenn sie registriert ist, schicken wir dir einen Link.</p>
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">E-Mail</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-emerald-400" placeholder="deine@email.de" /></div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">{loading ? "Sende Link..." : "Link per E-Mail senden"}</button>
          </form>
          {message && <p role="status" className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}
          <p className="mt-6 text-sm text-slate-400"><Link className="underline hover:text-white" href="/login">Zurück zum Einloggen</Link></p>
        </section>
      </div>
    </main>
  );
}
