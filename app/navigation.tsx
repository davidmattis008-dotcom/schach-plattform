"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAdminCenter } from "@/components/admin-center-provider";
import { InstallAppLink } from "@/components/install-app-link";

type MenuItem = { label: string; href: string };

const learningItems: MenuItem[] = [
  { label: "Eröffnungen", href: "/repertoire" },
  { label: "Mattsetzen", href: "/lernen/mattsetzen" },
  { label: "Endspiele", href: "/lernen/endspiele" },
  { label: "Schachregeln", href: "/lernen/regeln" },
  { label: "Lernpfad", href: "/lernen" },
];

const clubItems: MenuItem[] = [
  { label: "Vereine", href: "/verein" },
  { label: "Vereinstraining", href: "/verein/training" },
  { label: "Vereinschat", href: "/verein/chat" },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [learningExpanded, setLearningExpanded] = useState(() =>
    pathname === "/lernen" || pathname.startsWith("/lernen/") || pathname === "/repertoire",
  );
  const [clubExpanded, setClubExpanded] = useState(() => pathname.startsWith("/verein"));
  const menuButtonRef = useRef<HTMLButtonElement>(null);
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

  if (pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/forgot-password") || pathname.startsWith("/update-password")) return null;

  function isActive(item: MenuItem) {
    const [route] = item.href.split("#");
    if (route === "/verein") return pathname === route;
    return route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`);
  }

  function navLink(item: MenuItem, nested = false) {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => {
          setOpen(false);
        }}
        aria-current={active ? "page" : undefined}
        className={`group flex items-center justify-between rounded-lg px-4 py-2.5 text-sm transition-all duration-200 hover:translate-x-1 ${nested ? "ml-3 border-l border-white/10 pl-4" : ""} ${active ? "font-bold text-[#e7c95c]" : "font-medium text-neutral-300 hover:bg-white/[0.04] hover:text-[#e7c95c]"}`}
      >
        {item.label}
        {active && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#d4af37] shadow-[0_0_10px_rgba(212,175,55,0.8)]" />}
      </Link>
    );
  }

  function sectionButton(label: string, expanded: boolean, onClick: () => void, active: boolean, controls: string) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-controls={controls}
        className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left text-sm transition-all duration-200 hover:translate-x-1 hover:bg-white/[0.04] hover:text-[#e7c95c] ${active ? "font-bold text-[#e7c95c]" : "font-medium text-neutral-300"}`}
      >
        {label}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}>
          <path d="m7.5 4.5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-white/10 bg-black/95 px-4 backdrop-blur md:hidden">
        <button ref={menuButtonRef} type="button" onClick={() => setOpen(true)} aria-label="Menü öffnen" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-neutral-300 transition-colors hover:bg-white/10 hover:text-white">☰</button>
        <Link href="/" aria-label="CHESSCAGE Startseite" className="ml-3 flex items-center gap-2 font-semibold tracking-tight text-white"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" /><span className="text-sm tracking-[0.12em]"><span>CHESS</span><span className="text-[#d4af37]">CAGE</span></span></Link>
        <InstallAppLink className="ml-auto rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-[#d4af37] hover:text-[#e7c95c]">App installieren</InstallAppLink>
      </div>

      {open && <button type="button" aria-label="Menü schließen" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-black px-4 py-5 shadow-2xl shadow-black/30 transition-transform duration-300 ease-out md:translate-x-0`}>
        <div className="mb-5 flex items-center gap-3 border-b border-white/10 px-2 pb-5 pt-1">
          <Link href="/" onClick={() => setOpen(false)} aria-label="CHESSCAGE Startseite" className="flex min-w-0 items-center gap-3 text-sm font-semibold tracking-[0.12em] text-white">
            <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
            <span className="truncate">CHESS<span className="text-[#d4af37]">CAGE</span></span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Menü schließen" className="ml-auto rounded-lg px-2 py-1 text-xl text-neutral-500 transition-colors hover:bg-white/10 hover:text-white md:hidden">×</button>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 overflow-y-auto">
          {navLink({ label: "Startseite", href: "/" })}
          {navLink({ label: "Coach", href: "/coach" })}
          {navLink({ label: "Analyse", href: "/analyse" })}
          {navLink({ label: "Taktikaufgaben", href: "/taktik" })}

          <div className="pt-2">
            {sectionButton("Lernen", learningExpanded, () => setLearningExpanded((value) => !value), learningItems.some(isActive), "learning-navigation")}
            <div id="learning-navigation" className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${learningExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">{learningItems.map((item) => navLink(item, true))}</div>
            </div>
          </div>

          <div className="mt-2 border-t border-white/10 pt-2">
            {sectionButton("Verein", clubExpanded, () => setClubExpanded((value) => !value), pathname.startsWith("/verein"), "club-navigation")}
            <div id="club-navigation" className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${clubExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">{clubItems.map((item) => navLink(item, true))}</div>
            </div>
          </div>

          {navLink({ label: "Freunde", href: "/freunde" })}
          {navLink({ label: "Chat", href: "/chat" })}
          {navLink({ label: "Profil", href: "/profile" })}
          {navLink({ label: "Einstellungen", href: "/einstellungen" })}
          {navLink({ label: "Support", href: "/support" })}
        </nav>

        <div className="border-t border-white/10 pt-4">
          <InstallAppLink className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/[0.04] hover:text-[#e7c95c]">App installieren</InstallAppLink>
          {role && navLink({ label: "Adminbereich", href: "/admin" })}
        </div>
      </aside>
    </>
  );
}
