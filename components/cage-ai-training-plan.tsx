"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CAGE_AI_TRAINING_AREAS,
  DEFAULT_TRAINING_PREFERENCES,
  isCageAiTrainingPlan,
  MAX_WEEKLY_TRAINING_MINUTES,
  MIN_WEEKLY_TRAINING_MINUTES,
  type CageAiTrainingArea,
  type CageAiTrainingPlan,
  type CageAiTrainingPreferences,
} from "@/lib/cage-ai/training-plan";

type ApiResponse = {
  plan?: unknown;
  preferences?: unknown;
  error?: string;
};

const AREA_LABELS: Record<CageAiTrainingArea, string> = {
  tactics: "Taktik",
  endgames: "Endspiel",
  openings: "Eröffnungen",
  strategy: "Strategie",
  game_analysis: "Partien analysieren",
};

async function readResponse(response: Response): Promise<ApiResponse> {
  let result: ApiResponse;
  try {
    result = await response.json() as ApiResponse;
  } catch {
    throw new Error("Der Trainingsplan-Endpunkt hat eine ungültige Antwort geliefert.");
  }
  if (!response.ok) throw new Error(result.error || "Die Anfrage ist fehlgeschlagen.");
  return result;
}

function isPreferences(value: unknown): value is CageAiTrainingPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const preferences = value as Record<string, unknown>;
  return Number.isInteger(preferences.minutesPerWeek)
    && Array.isArray(preferences.areas)
    && preferences.areas.every((area) =>
      typeof area === "string" && CAGE_AI_TRAINING_AREAS.some((valid) => valid === area)
    );
}

export function CageAiTrainingPlanManager() {
  const [plan, setPlan] = useState<CageAiTrainingPlan | null>(null);
  const [minutesPerWeek, setMinutesPerWeek] = useState(DEFAULT_TRAINING_PREFERENCES.minutesPerWeek);
  const [areas, setAreas] = useState<CageAiTrainingArea[]>([...DEFAULT_TRAINING_PREFERENCES.areas]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cage-ai/training-plan", { cache: "no-store", signal: controller.signal })
      .then(readResponse)
      .then((result) => {
        if (result.plan !== null && result.plan !== undefined) {
          if (!isCageAiTrainingPlan(result.plan)) {
            throw new Error("Der gespeicherte Trainingsplan hat ein ungültiges Format.");
          }
          setPlan(result.plan);
        }
        if (isPreferences(result.preferences)) {
          setMinutesPerWeek(result.preferences.minutesPerWeek);
          setAreas(result.preferences.areas);
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Der Trainingsplan konnte nicht geladen werden.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function toggleArea(area: CageAiTrainingArea) {
    setAreas((current) => current.includes(area)
      ? current.filter((item) => item !== area)
      : [...current, area]);
  }

  async function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!Number.isInteger(minutesPerWeek)
      || minutesPerWeek < MIN_WEEKLY_TRAINING_MINUTES
      || minutesPerWeek > MAX_WEEKLY_TRAINING_MINUTES) {
      setError(`Wähle zwischen ${MIN_WEEKLY_TRAINING_MINUTES} und ${MAX_WEEKLY_TRAINING_MINUTES} Trainingsminuten pro Woche.`);
      return;
    }
    if (areas.length === 0) {
      setError("Wähle mindestens einen Trainingsbereich aus.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await readResponse(await fetch("/api/cage-ai/training-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { minutesPerWeek, areas } }),
      }));
      if (!isCageAiTrainingPlan(result.plan)) throw new Error("Der erstellte Trainingsplan ist ungültig.");
      setPlan(result.plan);
      setNotice("Dein persönlicher Wochenplan wurde aktualisiert.");
    } catch (generateError: unknown) {
      setError(generateError instanceof Error ? generateError.message : "Der Trainingsplan konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(taskId: string, completed: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await readResponse(await fetch("/api/cage-ai/training-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, completed }),
      }));
      if (!isCageAiTrainingPlan(result.plan)) throw new Error("Der aktualisierte Trainingsplan ist ungültig.");
      setPlan(result.plan);
      setNotice(completed ? "Trainingseinheit als erledigt markiert." : "Einheit wieder geöffnet.");
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Der Fortschritt konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  const completedTasks = plan?.tasks.filter((task) => task.completed).length ?? 0;
  const today = new Date();
  const day = today.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const currentWeek = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate() + mondayOffset,
  )).toISOString().slice(0, 10);
  const planNeedsRefresh = Boolean(plan && plan.weekOf < currentWeek);

  return (
    <div className="mt-6 space-y-5">
      <section className="rounded-xl border border-amber-300/30 bg-slate-900 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg border border-amber-300/30 bg-amber-300/10 font-bold text-amber-200">C</span>
          <div>
            <h2 className="font-semibold text-white">Dein persönlicher Trainingsplan</h2>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Der Wochenplan wird aus deinen ChessCage-Daten und den von dir gespeicherten Zielen und Schwerpunkten berechnet. ChessCageAI kann deine Fragen zum Plan mit dem verfügbaren Textmodell beantworten; Stockfish bleibt für Schachberechnungen zuständig.
            </p>
          </div>
        </div>

        <form onSubmit={(event) => void generatePlan(event)} className="mt-5 space-y-4">
          <div>
            <label htmlFor="cage-ai-weekly-minutes" className="block text-sm font-medium text-slate-200">
              Verfügbare Trainingszeit pro Woche
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="cage-ai-weekly-minutes"
                type="number"
                min={MIN_WEEKLY_TRAINING_MINUTES}
                max={MAX_WEEKLY_TRAINING_MINUTES}
                step={15}
                value={minutesPerWeek}
                onChange={(event) => setMinutesPerWeek(Number(event.target.value))}
                disabled={busy}
                className="min-h-11 w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/20 disabled:opacity-50"
              />
              <span className="text-sm text-slate-400">
                Minuten · {MIN_WEEKLY_TRAINING_MINUTES}–{MAX_WEEKLY_TRAINING_MINUTES} pro Woche
              </span>
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-200">Trainingsbereiche</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CAGE_AI_TRAINING_AREAS.map((area) => (
                <label key={area} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                  areas.includes(area)
                    ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                    : "border-slate-700 text-slate-300 hover:border-slate-500"
                }`}>
                  <input
                    type="checkbox"
                    checked={areas.includes(area)}
                    onChange={() => toggleArea(area)}
                    disabled={busy}
                    className="accent-amber-300"
                  />
                  {AREA_LABELS[area]}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy || loading}
            className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Plan wird berechnet …" : plan ? "Plan anhand aktueller Daten aktualisieren" : "Persönlichen Plan erstellen"}
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Als persönliche Daten fließen nur Spielstärken, Taktik- und Kursfortschritt, zusammengefasste Ergebnisse deiner letzten Partien sowie passende ChessCageAI-Erinnerungen ein. Gespeicherte Partien werden nicht als Rohdaten in den Plan kopiert.
        </p>
      </section>

      {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
      {planNeedsRefresh && (
        <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">
          Der gespeicherte Plan stammt aus einer früheren Woche. Aktualisiere ihn, damit neue Partien und Fortschritte berücksichtigt werden.
        </p>
      )}
      {loading && <p role="status" className="text-sm text-slate-400">Dein gespeicherter Trainingsplan wird geladen …</p>}

      {plan && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5" aria-labelledby="cage-ai-week-plan-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="cage-ai-week-plan-title" className="font-semibold text-white">Deine Einheiten ab {plan.weekOf}</h2>
              <p className="mt-1 text-xs text-slate-400">
                {completedTasks} von {plan.tasks.length} Einheiten erledigt · {plan.preferences.minutesPerWeek} Minuten pro Woche
              </p>
            </div>
            <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400">
              Wochenplan ohne Textmodell
            </span>
          </div>

          {plan.contextSummary.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Berücksichtigte Trainingsdaten">
              {plan.contextSummary.map((summary) => (
                <span key={summary} className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-300">{summary}</span>
              ))}
            </div>
          )}

          <ol className="mt-4 space-y-3">
            {plan.tasks.map((task) => (
              <li key={task.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(event) => void toggleTask(task.id, event.target.checked)}
                    disabled={busy}
                    aria-label={`${task.completed ? "Als offen markieren" : "Als erledigt markieren"}: ${task.title}`}
                    className="mt-1 size-4 shrink-0 accent-amber-300"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-medium text-amber-200">Einheit {task.day} · {AREA_LABELS[task.area]}</span>
                      <span className="text-xs text-slate-500">{task.minutes} Min.</span>
                    </div>
                    <h3 className={`mt-1 text-sm font-semibold ${task.completed ? "text-slate-500 line-through" : "text-slate-100"}`}>{task.title}</h3>
                    <p className="mt-1 text-sm leading-5 text-slate-400">{task.instructions}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Der Plan ist ein konkreter Startpunkt und keine Engine-Analyse. Aktualisiere ihn nach einigen Einheiten oder neuen Partien, damit aktuelle Fortschritte und Schwerpunkte einfließen.
          </p>
        </section>
      )}

      {!loading && !plan && !error && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          Deine erste Erstellung liest deine gespeicherten Lernfortschritte und Partien nur zusammengefasst ein. Deine Ziele und Schwächen kannst du unter Einstellungen → ChessCageAI Memory pflegen.
        </p>
      )}
    </div>
  );
}
