"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CAGE_AI_MEMORY_TYPES,
  MAX_CAGE_AI_MEMORIES,
  MAX_CAGE_AI_MEMORY_LENGTH,
  type CageAiMemoryType,
} from "@/lib/cage-ai/memories";

type MemoryItem = {
  id: string;
  memory_type: CageAiMemoryType;
  content: string;
  created_at: string;
};

type ApiResponse = {
  memories?: MemoryItem[];
  memory?: MemoryItem;
  error?: string;
};

const MEMORY_TYPE_LABELS: Record<CageAiMemoryType, string> = {
  training_goal: "Trainingsziel",
  playing_strength: "Spielstärke / Elo",
  weakness: "Langfristige Schwäche",
  training_preference: "Bevorzugte Trainingsart",
  progress: "Fortschritt",
  personal_preference: "Persönliche Präferenz",
  conversation_summary: "Kurze Gesprächszusammenfassung",
};

function isMemoryItem(value: unknown): value is MemoryItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.memory_type === "string"
    && CAGE_AI_MEMORY_TYPES.some((type) => type === item.memory_type)
    && typeof item.content === "string"
    && typeof item.created_at === "string";
}

async function readResponse(response: Response): Promise<ApiResponse> {
  let result: ApiResponse;
  try {
    result = await response.json() as ApiResponse;
  } catch {
    throw new Error("Der CageAI-Speicher hat eine ungültige Antwort geliefert.");
  }
  if (!response.ok) throw new Error(result.error || "Die Anfrage ist fehlgeschlagen.");
  return result;
}

export function CageAiMemoryManager() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryType, setMemoryType] = useState<CageAiMemoryType>("training_goal");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cage-ai/memories", { cache: "no-store", signal: controller.signal })
      .then(readResponse)
      .then((result) => {
        if (!Array.isArray(result.memories) || !result.memories.every(isMemoryItem)) {
          throw new Error("Die gespeicherten Erinnerungen haben ein ungültiges Format.");
        }
        setMemories(result.memories);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error
            ? loadError.message
            : "Deine Erinnerungen konnten nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function addMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (!normalizedContent || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cage-ai/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryType, content: normalizedContent }),
      });
      const result = await readResponse(response);
      const savedMemory = result.memory;
      if (!isMemoryItem(savedMemory)) throw new Error("Die gespeicherte Erinnerung hat ein ungültiges Format.");
      setMemories((current) => [savedMemory, ...current]);
      setContent("");
      setNotice("Erinnerung gespeichert.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Die Erinnerung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await readResponse(await fetch("/api/cage-ai/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      }));
      setMemories((current) => current.filter((memory) => memory.id !== id));
      setNotice("Erinnerung gelöscht.");
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Die Erinnerung konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllMemories() {
    if (busy || memories.length === 0) return;
    if (!window.confirm("Möchtest du wirklich alle CageAI-Erinnerungen dauerhaft löschen?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await readResponse(await fetch("/api/cage-ai/memories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      }));
      setMemories([]);
      setNotice("Alle Erinnerungen wurden gelöscht.");
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Die Erinnerungen konnten nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-amber-300/20 bg-slate-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">CageAI Memory</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Speichere nur kurze, nützliche Informationen. CageAI speichert keine kompletten Chats oder Engine-Berechnungen automatisch.
            Erinnerungen sind privat und können jederzeit einzeln oder vollständig gelöscht werden.
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400">
          {memories.length} / {MAX_CAGE_AI_MEMORIES}
        </span>
      </div>

      <form onSubmit={addMemory} className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_2fr_auto]">
        <label className="sr-only" htmlFor="cage-ai-memory-type">Erinnerungskategorie</label>
        <select
          id="cage-ai-memory-type"
          value={memoryType}
          onChange={(event) => setMemoryType(event.target.value as CageAiMemoryType)}
          disabled={busy || memories.length >= MAX_CAGE_AI_MEMORIES}
          className="min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/20 disabled:opacity-50"
        >
          {CAGE_AI_MEMORY_TYPES.map((type) => (
            <option key={type} value={type}>{MEMORY_TYPE_LABELS[type]}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="cage-ai-memory-content">Erinnerungstext</label>
        <input
          id="cage-ai-memory-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={MAX_CAGE_AI_MEMORY_LENGTH}
          placeholder="Zum Beispiel: Ich möchte Endspiele sicherer spielen."
          disabled={busy || memories.length >= MAX_CAGE_AI_MEMORIES}
          className="min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || memories.length >= MAX_CAGE_AI_MEMORIES || content.trim().length < 3}
          className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Bitte warten …" : "Speichern"}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Keine Passwörter, Kontaktdaten oder anderen sensiblen Daten eintragen. Maximal {MAX_CAGE_AI_MEMORY_LENGTH} Zeichen pro Erinnerung.
      </p>

      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}

      <div className="mt-5 border-t border-slate-800 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Gespeicherte Erinnerungen</h3>
          <button
            type="button"
            onClick={() => void deleteAllMemories()}
            disabled={busy || loading || memories.length === 0}
            className="rounded-lg border border-rose-400/30 px-3 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Alle löschen
          </button>
        </div>
        {loading && <p className="mt-3 text-sm text-slate-400">Erinnerungen werden geladen …</p>}
        {!loading && memories.length === 0 && (
          <p className="mt-3 text-sm text-slate-400">Du hast noch keine Erinnerungen gespeichert.</p>
        )}
        {memories.length > 0 && (
          <ul className="mt-3 space-y-2">
            {memories.map((memory) => (
              <li key={memory.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-amber-200">{MEMORY_TYPE_LABELS[memory.memory_type]}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-200">{memory.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteMemory(memory.id)}
                  disabled={busy}
                  aria-label={`Erinnerung löschen: ${memory.content}`}
                  className="shrink-0 self-start rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-50"
                >
                  Löschen
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
