"use client";

import { useState, type FormEvent } from "react";
import {
  createCageAiCourseQuestionRequest,
  createCageAiExplanationRequest,
  createCageAiTacticHintRequest,
  createCageAiTrainingPlanRequest,
  type CageAiExplanationRequest,
} from "@/lib/cage-ai/contracts";
import type { AnalyzedMove } from "@/lib/chess/stockfish-analysis";

type CageAiPanelRequestConfig =
  | { purpose: "training_plan" }
  | { purpose: "tactic_hint"; tactic: NonNullable<CageAiExplanationRequest["tactic"]> }
  | { purpose: "course_question"; course: NonNullable<CageAiExplanationRequest["course"]> }
  | { purpose: "game_review"; moves: AnalyzedMove[]; positions: string[] };
type CageAiPanelProps = {
  contextLabel: string;
  contextReady: boolean;
  placeholder: string;
  contextBadge?: string;
  initialQuestion?: string;
  quickPrompts?: string[];
  requestConfig: CageAiPanelRequestConfig;
};

type CageAiApiResponse = {
  explanation?: string;
  sources?: Array<{ title: string; url: string; heading: string }>;
  error?: string;
};

function buildRequest(config: CageAiPanelRequestConfig, question: string): CageAiExplanationRequest {
  switch (config.purpose) {
    case "training_plan":
      return createCageAiTrainingPlanRequest(question);
    case "tactic_hint":
      return createCageAiTacticHintRequest(question, config.tactic);
    case "course_question":
      return createCageAiCourseQuestionRequest(question, config.course);
    case "game_review":
      return createCageAiExplanationRequest(question, config.moves, config.positions);
  }
}

export function CageAiPanel({
  contextLabel,
  contextReady,
  placeholder,
  contextBadge = "Engine: Stockfish",
  initialQuestion = "",
  quickPrompts = [],
  requestConfig,
}: CageAiPanelProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<CageAiApiResponse["sources"]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!contextReady || !normalizedQuestion || loading) return;

    setLoading(true);
    setAnswer("");
    setSources([]);
    setError("");
    try {
      const response = await fetch("/api/cage-ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest(requestConfig, normalizedQuestion)),
      });
      const result = await response.json() as CageAiApiResponse;
      if (!response.ok) throw new Error(result.error || "CageAI konnte gerade nicht antworten.");
      if (typeof result.explanation !== "string") {
        throw new Error("CageAI hat keine gültige Erklärung zurückgegeben.");
      }
      setAnswer(result.explanation);
      setSources(result.sources ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "CageAI konnte gerade nicht antworten.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="cage-ai-heading" className="rounded-xl border border-amber-300/30 bg-slate-900 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-sm font-bold text-amber-200">C</span>
            <h2 id="cage-ai-heading" className="font-semibold text-white">CageAI · Schachtrainer</h2>
          </div>
          <p className="mt-2 text-sm text-slate-300">{contextLabel}</p>
        </div>
        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-400">{contextBadge}</span>
      </div>

      {!contextReady && (
        <p className="mt-4 rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-slate-400">
          {placeholder}
        </p>
      )}

      {quickPrompts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={!contextReady || loading}
              onClick={() => setQuestion(prompt)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-left text-xs text-slate-200 transition hover:border-amber-300/50 hover:bg-amber-300/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submitQuestion} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="cage-ai-question" className="sr-only">Frage an CageAI</label>
        <input
          id="cage-ai-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder={placeholder}
          disabled={!contextReady || loading}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-amber-300/70 focus:outline-none focus:ring-2 focus:ring-amber-300/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!contextReady || loading || !question.trim()}
          className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "CageAI denkt …" : "Fragen"}
        </button>
      </form>

      {loading && <p role="status" className="mt-3 text-sm text-slate-400">Dein Kontext wird sicher an CageAI übergeben …</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">{error}</p>}
      {answer && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3 sm:p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{answer}</p>
          {sources && sources.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3">
              {sources.map((source, index) => (
                <li key={`${source.url}:${source.heading}:${index}`}>
                  <a href={source.url} className="text-xs text-amber-200 underline decoration-amber-200/40 underline-offset-2 hover:text-amber-100">
                    {source.title}{source.heading !== source.title ? ` · ${source.heading}` : ""}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        CageAI erklärt bereitgestellte Daten; Stockfish bleibt für die Schachberechnung zuständig.
      </p>
    </section>
  );
}
