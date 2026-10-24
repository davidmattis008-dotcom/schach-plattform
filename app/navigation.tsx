"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAdminCenter } from "@/components/admin-center-provider";
import { InstallAppLink } from "@/components/install-app-link";
import { createClient } from "@/lib/supabase/client";

type MenuItem = { label: string; href: string; dividerBefore?: boolean };

const menuItems: MenuItem[] = [
  { label: "Startseite", href: "/" },
  { label: "Coach", href: "/coach" },
  { label: "Analyse", href: "/analyse" },
  { label: "Taktikaufgaben", href: "/taktik" },
  { label: "Lernen", href: "/lernen" },
  { label: "Verein", href: "/verein", dividerBefore: true },
  { label: "Freunde", href: "/freunde" },
  { label: "Chat", href: "/chat" },
  { label: "Profile", href: "/profile", dividerBefore: true },
  { label: "Einstellungen", href: "/einstellungen" },
  { label: "Support", href: "/support", dividerBefore: true },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState("Profil");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { role } = useAdminCenter();

  useEffect(() => {
    let active = true;
    async function loadAccountName() {
      setAccountName("Profil");
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          if (active) setAccountName("Profil");
          return;
        }
        const { data, error } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
        if (error) throw error;
        if (active && typeof data?.username === "string" && data.username.trim()) {
          setAccountName(data.username.trim());
        }
      } catch (error) {
        console.error("Profilname in der Navigation konnte nicht geladen werden:", error);
      }
    }
    void loadAccountName();
    return () => { active = false; };
  }, [pathname]);

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
    return item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  function navLink(item: MenuItem) {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-400/10 text-emerald-200" : "text-slate-300 hover:bg-slate-900 hover:text-white"} ${item.dividerBefore ? "mt-4 border-t border-slate-800 pt-5" : ""}`}
      >
        {item.label}
        {active && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />}
      </Link>
    );
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-slate-800 bg-slate-950/95 px-4 backdrop-blur md:hidden">
        <button ref={menuButtonRef} type="button" onClick={() => setOpen(true)} aria-label="Menü öffnen" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl text-slate-300 hover:bg-slate-800">☰</button>
        <Link href="/" aria-label="CHESSCAGE Startseite" className="ml-3 flex items-center gap-2 font-semibold tracking-tight text-slate-100"><img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" /><span className="text-sm tracking-[0.12em]"><span>CHESS</span><span className="text-[#d4af37]">CAGE</span></span></Link>
        <InstallAppLink className="ml-auto rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white">App installieren</InstallAppLink>
      </div>

      {open && <button type="button" aria-label="Menü schließen" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 md:hidden" />}
      <aside className={`${open ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 transition-transform duration-200 md:translate-x-0`}>
        <div className="mb-5 flex items-center gap-3 border-b border-slate-800 px-2 pb-5 pt-1">
          <Link href="/profile" onClick={() => setOpen(false)} aria-label="Profil öffnen" className="flex min-w-0 items-center gap-3 text-sm font-semibold text-slate-100">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 shrink-0 text-emerald-300">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" />
            </svg>
            <span className="truncate">{accountName}</span>
          </Link>
          <button type="button" onClick={() => setOpen(false)} aria-label="Menü schließen" className="ml-auto rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-800 md:hidden">×</button>
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 overflow-y-auto">
          {menuItems.map(navLink)}
        </nav>

        <div className="border-t border-slate-800 pt-4">
          <InstallAppLink className="flex items-center justify-between rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-900 hover:text-white">App installieren</InstallAppLink>
          {role && navLink({ label: "Adminbereich", href: "/admin" })}
        </div>
      </aside>
    </>
  );
}
