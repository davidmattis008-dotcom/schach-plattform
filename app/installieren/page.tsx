"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isAppInstalled, markAppInstalled } from "@/lib/pwa-installation";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const buttonClass = "mt-3 inline-flex rounded-lg bg-white px-4 py-2 font-semibold text-slate-950 hover:bg-slate-200";

export default function InstallierenPage() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setInstalled(isAppInstalled());

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      markAppInstalled();
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("Fertig! Die Schachplattform ist installiert.");
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      markAppInstalled();
      setInstalled(true);
      setMessage("Fertig! Die Schachplattform ist installiert.");
    } else {
      setMessage("Installation abgebrochen.");
    }
    setInstallPrompt(null);
  }

  const chromeIntentUrl = "intent://schach-plattform.vercel.app/installieren#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fschach-plattform.vercel.app%2Finstallieren;end";
  const safariIntentUrl = "x-safari-https://schach-plattform.vercel.app/installieren";
  const edgeIntentUrl = "microsoft-edge:https://schach-plattform.vercel.app/installieren";
  const installPageUrl = "https://schach-plattform.vercel.app/installieren";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-slate-300 underline underline-offset-4 hover:text-white">← Zur Startseite</Link>
        <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-7 sm:p-10">
          <div className="relative mb-5 flex h-16 w-16 items-start justify-start" aria-label="Läufer und Springer">
            <span className="absolute left-0 top-0 text-4xl leading-none text-slate-100">♝</span>
            <span className="absolute bottom-0 right-0 text-4xl leading-none text-slate-300">♞</span>
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">{installed ? "Schachplattform" : "Schachplattform installieren"}</h1>
          {!installed && <p className="mt-3 text-slate-300">Wähle dein Gerät und folge den kurzen Schritten.</p>}
          {installed ? (
            <p className="mt-6 rounded-xl bg-emerald-900/60 px-5 py-4 font-semibold text-emerald-100" role="status">Bereits installiert ✓</p>
          ) : installPrompt ? (
            <button type="button" onClick={installApp} className="mt-6 w-full rounded-xl bg-white px-5 py-4 text-lg font-bold text-slate-950 hover:bg-slate-200">Jetzt installieren</button>
          ) : null}
          {message && <p className="mt-4 text-sm text-emerald-200" role="status">{message}</p>}
          {!installed && <details open className="mt-7 rounded-xl border border-slate-700 p-4">
            <summary className="cursor-pointer font-semibold">Installation auf Handy oder Computer</summary>
            <div className="mt-4 space-y-5 text-sm text-slate-300">
              <div>
                <p><strong className="text-white">iPhone / iPad</strong></p>
                <a href={safariIntentUrl} className={buttonClass}>Safari öffnen</a>
                <p className="mt-2">In Safari: „Teilen“ → „Zum Home-Bildschirm“ → „Hinzufügen“.</p>
              </div>
              <div>
                <p><strong className="text-white">Android</strong></p>
                <a href={chromeIntentUrl} className={buttonClass}>Chrome öffnen</a>
                <p className="mt-2">In Chrome auf „App installieren“ tippen.</p>
              </div>
              <div>
                <p><strong className="text-white">Windows</strong></p>
                <a href={edgeIntentUrl} className={buttonClass}>In Microsoft Edge öffnen</a>
                <p className="mt-2">Falls Firefox fragt, ob Edge geöffnet werden darf: bestätigen. Danach in Edge ⋯ → Weitere Tools → Apps → „Diese Website als App installieren“ wählen.</p>
              </div>
              <div>
                <p><strong className="text-white">Mac</strong></p>
                <a href={installPageUrl} target="_blank" rel="noreferrer" className={buttonClass}>Website im Browser öffnen</a>
                <p className="mt-2">In Safari: Menü „Ablage“ → „Zum Dock hinzufügen“.</p>
              </div>
            </div>
          </details>}
          <p className="mt-6 text-xs text-slate-400">Website-Änderungen sind beim nächsten Öffnen verfügbar. Das App-Symbol aktualisiert dein Gerät separat.</p>
        </div>
      </div>
    </main>
  );
}
