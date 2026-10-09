"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDirectMessageNotifications } from "@/components/direct-message-notifications";
import { useAdminCenter } from "@/components/admin-center-provider";

type MenuItem = { label: string; mark: string; href: string };

const sections: { title: string; items: MenuItem[] }[] = [
  {
    title: "Spielen",
    items: [
      { label: "Online spielen", mark: "◎", href: "/online" },
      { label: "Gegen Bot", mark: "♟", href: "/bot" },
      { label: "Freie Partie", mark: "＋", href: "/play" },
      { label: "Turniere", mark: "♜", href: "/tournaments" },
    ],
  },
  {
    title: "Selbstständig lernen",
    items: [
      { label: "Lernpfad", mark: "↗", href: "/lernen#lernplan" },
      { label: "Schachregeln für Anfänger", mark: "♙", href: "/lernen#anfang" },
      { label: "Tägliche Taktikaufgabe", mark: "♞", href: "/taktik?daily=1" },
      { label: "Eröffnungen Schritt für Schritt", mark: "⌂", href: "/repertoire" },
      { label: "Mattsetzen lernen", mark: "♛", href: "/lernen#matt" },
      { label: "Endspiele & Fortgeschritten", mark: "♜", href: "/lernen#endspiele" },
    ],
  },
  {
    title: "Deine Partien",
    items: [
      { label: "Partieverlauf", mark: "↗", href: "/partien" },
      { label: "Analyse", mark: "⌕", href: "/analyse" },
    ],
  },
  {
    title: "Community",
    items: [
      { label: "Vereinstraining", mark: "♙", href: "/verein" },
      { label: "Freunde", mark: "♙", href: "/freunde" },
      { label: "Globaler Chat", mark: "◌", href: "/chat" },
      { label: "Ranglisten", mark: "♜", href: "/ranglisten" },
      { label: "Support", mark: "✉", href: "/support" },
    ],
  },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { unreadTotal } = useDirectMessageNotifications();
  const { role } = useAdminCenter();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/forgot-password")) return null;

  function isActive(item: MenuItem) {
    if (item.href.includes("#")) return false;
    const route = item.href.split("?")[0];
    return pathname === route || pathname.startsWith(`${route}/`);
  }

  function navLink(item: MenuItem) {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition ${active ? "border-emerald-400 bg-emerald-400/10 text-emerald-200" : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"}`}
      >
        <span aria-hidden="true" className="w-5 text-center text-base">{item.mark}</span>
        {item.label}
        {item.href.startsWith("/freunde") && unreadTotal > 0 && <span className="ml-auto rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}
      </Link>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur md:hidden">
        <button ref={menuButtonRef} type="button" onClick={() => setOpen(true)} aria-label="Menü öffnen" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-slate-300 hover:bg-slate-800">☰</button>
        <Link href="/" aria-label="Startseite" className="ml-3 flex items-center gap-2 font-semibold tracking-tight text-slate-100"><img src="/chess-logo-192.png" alt="" className="h-8 w-8 rounded-lg" /> Schach</Link>
        <Link href="/installieren" className="ml-auto rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white">App installieren</Link>
      </div>

      {open && <button type="button" aria-label="Menü schließen" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 transition-transform duration-200 md:translate-x-0`}>
        <div className="mb-10 flex items-center gap-3 px-2 py-1">
          <Link href="/" onClick={() => setOpen(false)} aria-label="Schach Startseite" className="flex min-w-0 items-center gap-3 text-base font-semibold tracking-tight text-slate-100"><img src="/chess-logo-192.png" alt="" className="h-9 w-9 rounded-lg" /><span>Schach<span className="font-normal text-slate-400">plattform</span></span></Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Menü schließen" className="ml-auto rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-800 md:hidden">×</button>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 space-y-6 overflow-y-auto">
          <Link href="/" onClick={() => setOpen(false)} aria-current={pathname === "/" ? "page" : undefined} className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition ${pathname === "/" ? "border-emerald-400 bg-emerald-400/10 text-emerald-200" : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"}`}><span aria-hidden="true" className="w-5 text-center text-base">⌂</span>Übersicht</Link>
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{section.title}</h2>
              <div className="space-y-1">{section.items.map(navLink)}</div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 pt-4">
          {role && navLink({ label: "Administration", mark: "⚑", href: "/admin" })}
          {navLink({ label: "App installieren", mark: "↓", href: "/installieren" })}
          {navLink({ label: "Einstellungen", mark: "⚙", href: "/einstellungen" })}
          <Link href="/profile" onClick={() => setOpen(false)} aria-current={pathname.startsWith("/profile") ? "page" : undefined} className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2.5 text-sm font-medium transition ${pathname.startsWith("/profile") ? "border-emerald-400 bg-emerald-400/10 text-emerald-200" : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-white"}`}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs text-slate-300">♟</span>Profil</Link>
        </div>
      </aside>
    </>
  );
}
