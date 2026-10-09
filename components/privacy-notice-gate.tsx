"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NOTICE_KEY = "schach-datenschutzhinweis-gelesen-v1";

export function PrivacyNoticeGate() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [checked, setChecked] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setAuthenticated(Boolean(session?.user));
      setReady(true);
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error("Anmeldestatus für Datenschutzhinweis konnte nicht geprüft werden:", error);
      }
      setAuthenticated(Boolean(data.session?.user));
      setReady(true);
    }).catch((error: unknown) => {
      console.error("Anmeldestatus für Datenschutzhinweis konnte nicht geprüft werden:", error);
      if (active) setReady(true);
    });

    try {
      setAcknowledged(window.localStorage.getItem(NOTICE_KEY) === "true");
    } catch {
      setStorageWarning("Dein Browser erlaubt keine lokale Speicherung. Die Kenntnisnahme gilt nur bis zum Schließen dieser Sitzung.");
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function acknowledge() {
    try {
      window.localStorage.setItem(NOTICE_KEY, "true");
    } catch {
      setStorageWarning("Die Kenntnisnahme konnte nicht dauerhaft gespeichert werden und gilt nur bis zum Schließen dieser Sitzung.");
    }
    setAcknowledged(true);
  }

  if (pathname === "/datenschutz") return null;
  if (!ready) {
    return (
      <div role="status" className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950 text-sm text-slate-300">
        Anmeldestatus wird geprüft …
      </div>
    );
  }
  if (authenticated || acknowledged) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-slate-950/95 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title" className="my-auto w-full max-w-lg rounded-2xl border border-amber-400/40 bg-slate-900 p-6 text-slate-100 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Datenschutz</p>
        <h1 id="privacy-notice-title" className="mt-2 text-2xl font-semibold">Bitte lies unsere Datenschutzhinweise</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Für nicht angemeldete Besucher ist die Übersicht erst nach der Kenntnisnahme verfügbar. Das ist keine Einwilligung in eine optionale Datenverarbeitung.
        </p>
        <Link href="/datenschutz" className="mt-5 inline-flex rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-amber-200 transition hover:border-amber-300">
          Datenschutzhinweise öffnen
        </Link>
        {storageWarning && <p role="status" className="mt-4 text-xs leading-5 text-amber-200">{storageWarning}</p>}
        <label className="mt-6 flex items-start gap-3 text-sm leading-5 text-slate-300">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 accent-amber-400" />
          <span>Ich habe die Datenschutzhinweise gelesen und zur Kenntnis genommen.</span>
        </label>
        <button type="button" onClick={acknowledge} disabled={!checked} className="mt-5 w-full rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
          Gelesen – weiter
        </button>
      </section>
    </div>
  );
}
