"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createCageAiCourseQuestionRequest,
  createCageAiExplanationRequest,
  createCageAiTacticHintRequest,
  createCageAiTrainingPlanRequest,
  type CageAiExplanationRequest,
  type CageAiGameDetails,
} from "@/lib/cage-ai/contracts";
import {
  createLocalCageAiSpeechToTextProvider,
  createLocalCageAiTextToSpeechProvider,
} from "@/lib/cage-ai/local-speech";
import {
  CAGE_AI_MAX_RECORDING_BYTES,
  CAGE_AI_MAX_RECORDING_SECONDS,
  isCageAiSpeechInputSupported,
  type CageAiSpeechToTextProvider,
  type CageAiTextToSpeechProvider,
} from "@/lib/cage-ai/speech-contracts";
import type { AnalyzedMove } from "@/lib/chess/stockfish-analysis";

type CageAiPanelRequestConfig =
  | { purpose: "training_plan" }
  | { purpose: "tactic_hint"; tactic: NonNullable<CageAiExplanationRequest["tactic"]> }
  | { purpose: "course_question"; course: NonNullable<CageAiExplanationRequest["course"]> }
  | { purpose: "game_review"; moves: AnalyzedMove[]; positions: string[]; game?: CageAiGameDetails };
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
  mode?: "model" | "stockfish_local" | "knowledge_unavailable";
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
      return createCageAiExplanationRequest(
        question,
        config.moves,
        config.positions,
        undefined,
        "game_review",
        config.game,
      );
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
  const [explanationMode, setExplanationMode] = useState<CageAiApiResponse["mode"]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [speechStatus, setSpeechStatus] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const speechProviderRef = useRef<CageAiSpeechToTextProvider | null>(null);
  const speechOutputProviderRef = useRef<CageAiTextToSpeechProvider | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.abort();
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      speechStreamRef.current?.getTracks().forEach((track) => track.stop());
      speechOutputProviderRef.current?.stop();
    };
  }, []);

  async function startSpeechInput() {
    const speechSupported = isCageAiSpeechInputSupported(
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
      typeof MediaRecorder !== "undefined",
    );
    if (!speechSupported || recorderRef.current || loading) {
      if (!speechSupported) {
        setError("Dieser Browser unterstützt keine lokale ChessCageAI-Spracheingabe. Du kannst weiterhin den Text-Chat verwenden.");
      }
      return;
    }
    setError("");
    setSpeechStatus("Mikrofonberechtigung wird angefragt …");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (requestError) {
      if (!mountedRef.current) return;
      setSpeechStatus("");
      setError(requestError instanceof Error && requestError.name === "NotFoundError"
        ? "Es wurde kein Mikrofon gefunden. Der Text-Chat funktioniert weiterhin."
        : "Mikrofonzugriff wurde nicht erteilt. Erlaube den Zugriff im Browser, um Spracheingabe zu nutzen.");
      return;
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch (recordingError) {
      stream.getTracks().forEach((track) => track.stop());
      if (!mountedRef.current) return;
      setSpeechStatus("");
      setError(recordingError instanceof Error
        ? `ChessCageAI konnte die Aufnahme nicht starten: ${recordingError.message}`
        : "ChessCageAI konnte die Aufnahme nicht starten.");
      return;
    }

    speechStreamRef.current = stream;
    recorderRef.current = recorder;
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      const currentSize = recordingChunksRef.current.reduce((total, chunk) => total + chunk.size, 0);
      if (currentSize > CAGE_AI_MAX_RECORDING_BYTES && recorder.state === "recording") recorder.stop();
    };
    recorder.onerror = () => {
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      speechStreamRef.current = null;
      if (!mountedRef.current) return;
      setError("ChessCageAI konnte das Mikrofon-Audio nicht aufnehmen. Der Text-Chat funktioniert weiterhin.");
      setSpeechStatus("");
      setIsRecording(false);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      speechStreamRef.current = null;
      recorderRef.current = null;
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
      const audio = new Blob(recordingChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      recordingChunksRef.current = [];
      if (!mountedRef.current) return;
      setIsRecording(false);
      if (audio.size > CAGE_AI_MAX_RECORDING_BYTES) {
        setSpeechStatus("");
        setError("Die Aufnahme war größer als 10 MB. Bitte sprich eine kürzere Frage.");
        return;
      }
      setSpeechStatus("ChessCageAI erkennt deine Sprache lokal …");
      try {
        speechProviderRef.current ??= createLocalCageAiSpeechToTextProvider();
        const transcript = await speechProviderRef.current.transcribe(audio);
        if (mountedRef.current) {
          setQuestion((current) => `${current.trim()}${current.trim() ? " " : ""}${transcript}`.slice(0, 500));
          setSpeechStatus("Erkannter Text ist im Eingabefeld. Prüfe ihn und sende ihn wie eine normale Chatfrage.");
        }
      } catch (recognitionError) {
        if (mountedRef.current) {
          setSpeechStatus("");
          setError(recognitionError instanceof Error
            ? recognitionError.message
            : "ChessCageAI konnte die Sprache nicht erkennen. Du kannst deine Frage eintippen.");
        }
      } finally {
        audioChunksClear();
      }
    };

    try {
      recorder.start(250);
      setIsRecording(true);
      setSpeechStatus("ChessCageAI hört zu … Sprich jetzt deine Frage.");
      recordingTimeoutRef.current = window.setTimeout(
        () => {
          if (recorder.state === "recording") recorder.stop();
        },
        CAGE_AI_MAX_RECORDING_SECONDS * 1_000,
      );
    } catch (recordingError) {
      stream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
      speechStreamRef.current = null;
      if (!mountedRef.current) return;
      setIsRecording(false);
      setSpeechStatus("");
      setError(recordingError instanceof Error
        ? `ChessCageAI konnte die Aufnahme nicht starten: ${recordingError.message}`
        : "ChessCageAI konnte die Aufnahme nicht starten.");
    }
  }

  function audioChunksClear() {
    recordingChunksRef.current = [];
  }

  function stopSpeechInput() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      setSpeechStatus("Aufnahme wird beendet …");
      recorder.stop();
    }
  }

  async function speakAnswer() {
    if (!answer || loading) return;
    setError("");
    setSpeechStatus("ChessCageAI erzeugt die Sprachausgabe lokal …");
    try {
      speechOutputProviderRef.current ??= createLocalCageAiTextToSpeechProvider();
      await speechOutputProviderRef.current.speak(
        answer,
        () => mountedRef.current && setSpeechStatus("ChessCageAI spricht …"),
      );
      if (mountedRef.current) setSpeechStatus("");
    } catch (speechError) {
      if (mountedRef.current) {
        setSpeechStatus("");
        setError(speechError instanceof Error
          ? speechError.message
          : "ChessCageAI konnte die Antwort nicht vorlesen.");
      }
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!contextReady || !normalizedQuestion || activeRequestRef.current) return;

    const controller = new AbortController();
    speechOutputProviderRef.current?.stop();
    setSpeechStatus("");
    activeRequestRef.current = controller;
    const timeoutId = window.setTimeout(
      () => controller.abort(new DOMException("Zeitlimit überschritten.", "TimeoutError")),
      65_000,
    );
    setLoading(true);
    setAnswer("");
    setSources([]);
    setExplanationMode(undefined);
    setError("");
    try {
      const response = await fetch("/api/cage-ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequest(requestConfig, normalizedQuestion)),
        signal: controller.signal,
      });
      const result = await response.json() as CageAiApiResponse;
      if (!response.ok) throw new Error(result.error || "ChessCageAI konnte gerade nicht antworten.");
      if (typeof result.explanation !== "string") {
        throw new Error("ChessCageAI hat keine gültige Erklärung zurückgegeben.");
      }
      setAnswer(result.explanation);
      setSources(result.sources ?? []);
      setExplanationMode(result.mode);
      speechOutputProviderRef.current?.stop();
      setSpeechStatus("");
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError instanceof Error
          ? requestError.message
          : "ChessCageAI konnte gerade nicht antworten.");
      } else if (controller.signal.reason instanceof DOMException
        && controller.signal.reason.name === "TimeoutError") {
        setError("ChessCageAI hat das Zeitlimit erreicht. Bitte versuche es erneut.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequestRef.current === controller) activeRequestRef.current = null;
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="cage-ai-heading" className="rounded-xl border border-amber-300/30 bg-slate-900 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-300/30 bg-amber-300/10 text-sm font-bold text-amber-200">C</span>
            <h2 id="cage-ai-heading" className="font-semibold text-white">ChessCageAI · Schachtrainer</h2>
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
        <label htmlFor="cage-ai-question" className="sr-only">Frage an ChessCageAI</label>
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
          {loading ? "ChessCageAI denkt …" : "Fragen"}
        </button>
        {isRecording ? (
          <button
            type="button"
            onClick={stopSpeechInput}
            className="min-h-11 rounded-lg border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/10"
          >
            Aufnahme beenden
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startSpeechInput()}
            disabled={!contextReady || loading}
            title="Frage lokal aufnehmen"
            className="min-h-11 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🎙️ Frage sprechen
          </button>
        )}
      </form>

      {speechStatus && <p role="status" aria-live="polite" className="mt-3 text-sm text-amber-100">{speechStatus}</p>}
      {loading && <p role="status" className="mt-3 text-sm text-slate-400">Dein Kontext wird sicher an ChessCageAI übergeben …</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-sm text-amber-100">{error}</p>}
      {answer && (
        <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3 sm:p-4">
          {explanationMode === "stockfish_local" && (
            <p className="mb-3 text-xs text-slate-400">
              ChessCageAI ist momentan nicht mit einem KI-Modell verbunden. Diese regelbasierte Stockfish-Zusammenfassung verwendet nur die übermittelten Bewertungen und Varianten.
            </p>
          )}
          {explanationMode === "knowledge_unavailable" && (
            <p className="mb-3 text-xs text-slate-400">
              Keine passende, geprüfte Wissensquelle gefunden; ChessCageAI gibt deshalb keine unbestätigte Sachauskunft.
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{answer}</p>
          <button
            type="button"
            onClick={() => {
              if (speechStatus === "ChessCageAI spricht …") {
                speechOutputProviderRef.current?.stop();
                setSpeechStatus("");
              } else {
                void speakAnswer();
              }
            }}
            disabled={loading || speechStatus.includes("erzeugt die Sprachausgabe")}
            className="mt-3 min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-amber-300/50 disabled:opacity-50"
          >
            {speechStatus === "ChessCageAI spricht …" ? "Vorlesen stoppen" : "ChessCageAI-Antwort vorlesen"}
          </button>
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
        ChessCageAI erklärt bereitgestellte Daten; Stockfish bleibt für die Schachberechnung zuständig.
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Sprache wird lokal auf diesem Gerät verarbeitet. Audio wird nicht übertragen oder gespeichert; beim ersten Einsatz wird ein offenes Sprachmodell geladen. Nur der von dir bestätigte Text wird über den normalen, angemeldeten ChessCageAI-Chat gesendet.
      </p>
    </section>
  );
}
