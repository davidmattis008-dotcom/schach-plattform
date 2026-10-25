"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const supabase = createClient();
      const usesEmail = identifier.includes("@");
      if (usesEmail) {
        const { error } = await supabase.auth.signInWithPassword({
          email: identifier.trim(),
          password,
        });
        if (error) {
          setMessage("Anmeldung fehlgeschlagen. Prüfe deine E-Mail-Adresse und dein Passwort.");
          return;
        }
      } else {
        const response = await fetch("/api/auth/username-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: identifier.trim(), password }),
        });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !result || typeof result !== "object" ||
          !("access_token" in result) || typeof result.access_token !== "string" ||
          !("refresh_token" in result) || typeof result.refresh_token !== "string") {
          setMessage(
            result && typeof result === "object" && "error" in result && typeof result.error === "string"
              ? result.error
              : "Anmeldung fehlgeschlagen. Prüfe Benutzername und Passwort.",
          );
          return;
        }
        const { error } = await supabase.auth.setSession({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        });
        if (error) {
          console.error("Die Username-Anmeldesitzung konnte nicht gespeichert werden:", error);
          setMessage("Anmeldung momentan nicht möglich. Bitte versuche es erneut.");
          return;
        }
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setMessage("Login fehlgeschlagen.");
        return;
      }
      const { data: hasAccess, error: accessError } = await supabase.rpc("get_my_site_access");
      if (accessError || hasAccess !== true) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) console.error("Abmeldung für ein nicht freigeschaltetes Konto fehlgeschlagen:", signOutError);
        setMessage(accessError && accessError.code !== "42501"
          ? "Der Testzugriff kann gerade nicht geprüft werden. Bitte versuche es später erneut."
          : "Dieses Konto ist für den privaten Testbetrieb nicht freigeschaltet.");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (profile) router.push("/");
      else router.push("/profile/setup");
    } catch (error) {
      console.error("Login fehlgeschlagen:", error);
      setMessage("Anmeldung momentan nicht möglich. Bitte überprüfe deine Verbindung und versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto w-full max-w-md">
        <Link href="/" aria-label="CHESSCAGE Startseite" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-white transition hover:text-slate-200"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover"/><span>CHESS<span className="text-[#d4af37]">CAGE</span></span></Link>
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Einloggen</h1>
          <p className="mt-2 text-slate-400">Melde dich an, um weiterzuspielen.</p>
          <form onSubmit={handleLogin} className="mt-7 space-y-5">
            <div>
              <label htmlFor="login-identifier" className="mb-2 block text-sm font-medium text-slate-200">E-Mail oder Benutzername</label>
              <input id="login-identifier" type="text" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-emerald-400" placeholder="E-Mail oder Benutzername" />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">Passwort</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition placeholder:text-slate-600 focus:border-emerald-400" placeholder="Dein Passwort" />
            </div>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">
              {loading ? "Einloggen..." : "Einloggen"}
            </button>
          </form>
          <p className="mt-4 text-sm text-slate-400"><Link href="/forgot-password" className="underline hover:text-white">Passwort vergessen?</Link></p>
          <p className="mt-6 border-t border-slate-800 pt-5 text-sm text-slate-400">Neue Testkonten werden vom Betreiber eingerichtet.</p>
          {message && <p className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}
        </section>
      </div>
    </main>
  );
}
