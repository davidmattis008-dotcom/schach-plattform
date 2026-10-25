import Link from "next/link";
import { ChessClubTraining, type ClubAreaSection } from "@/components/chess-club-training";

const sections: { id: Exclude<ClubAreaSection, "all">; label: string; href: string }[] = [
  { id: "clubs", label: "Vereine", href: "/verein" },
  { id: "training", label: "Vereinstraining", href: "/verein/training" },
  { id: "chat", label: "Vereinschat", href: "/verein/chat" },
];
const sectionLabels: Record<Exclude<ClubAreaSection, "all">, string> = {
  clubs: "Vereine",
  training: "Vereinstraining",
  chat: "Vereinschat",
};

export function ClubAreaPage({ section }: { section: Exclude<ClubAreaSection, "all"> }) {
  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-xs text-slate-400 underline underline-offset-4 hover:text-white">← Übersicht</Link>
        <header className="mb-4 mt-3">
          <h1 className="text-2xl font-semibold tracking-tight">{sectionLabels[section]}</h1>
        </header>
        <nav aria-label="Vereinsbereiche" className="mb-4 flex gap-4 border-b border-white/10 text-sm">
          {sections.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.id === section ? "page" : undefined}
              className={`border-b-2 pb-2 ${item.id === section ? "border-[#d4af37] font-semibold text-[#e7c95c]" : "border-transparent text-slate-400 hover:text-white"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ChessClubTraining view={section} />
      </div>
    </main>
  );
}
