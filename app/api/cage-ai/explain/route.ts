import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CAGE_AI_EXPLANATION_INSTRUCTIONS,
  isCageAiExplanationResponse,
  validateCageAiExplanationRequest,
} from "@/lib/cage-ai/contracts";
import { getCageAiTextModelProvider } from "@/lib/cage-ai/provider";
import type { CageAiTextModelProvider } from "@/lib/cage-ai/contracts";
import { loadCageAiPersonalContext } from "@/lib/cage-ai/personal-context";
import type { CageAiPersonalContext } from "@/lib/cage-ai/context-selection";
import { retrieveCageAiKnowledge, type CageAiKnowledgeChunk } from "@/lib/cage-ai/knowledge-retrieval";
import { createLocalGameReviewExplanation } from "@/lib/cage-ai/local-game-review";
import { CageAiModelResponseTooLargeError, CageAiModelUnavailableError } from "@/lib/cage-ai/ollama-provider";
import { CageAiModelBusyError, runCageAiModelRequest } from "@/lib/cage-ai/model-capacity";
import { resolveCageAiKnowledgeCitations } from "@/lib/cage-ai/knowledge-search";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 64 * 1024;

function response(status: number, body: { error: string }) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) {
    return response(403, { error: "Ungültige Anfragequelle." });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return response(415, { error: "Es werden nur JSON-Anfragen unterstützt." });
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) return response(413, { error: "Die Anfrage ist zu groß." });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return response(400, { error: "Die Anfrage konnte nicht gelesen werden." });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return response(413, { error: "Die Anfrage ist zu groß." });
  }

  let sessionClient;
  try {
    sessionClient = await createSupabaseServerClient();
  } catch (error) {
    console.error("ChessCageAI-Authentifizierung ist nicht verfügbar:", error);
    return response(503, { error: "ChessCageAI ist vorübergehend nicht verfügbar." });
  }
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return response(401, { error: "Bitte melde dich an, um ChessCageAI zu verwenden." });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Die Anfrage enthält kein gültiges JSON." });
  }
  const explanationRequest = validateCageAiExplanationRequest(body);
  if (!explanationRequest) return response(400, { error: "Die Analyseanfrage ist ungültig." });

  let provider: CageAiTextModelProvider | null;
  try {
    provider = getCageAiTextModelProvider();
  } catch (error) {
    console.error("Die ChessCageAI-Modellkonfiguration ist ungültig:", error);
    return response(503, { error: "ChessCageAI ist momentan nicht mit einem KI-Modell verbunden." });
  }
  if (!provider && explanationRequest.purpose !== "game_review") {
    return response(503, { error: "ChessCageAI ist momentan nicht mit einem KI-Modell verbunden." });
  }

  let personalContext: CageAiPersonalContext;
  let knowledgeContext: CageAiKnowledgeChunk[] = [];
  try {
    personalContext = await loadCageAiPersonalContext(
      sessionClient, user.id, explanationRequest.purpose,
    );
    if (provider) {
      knowledgeContext = await retrieveCageAiKnowledge(sessionClient, explanationRequest);
    }
  } catch (error) {
    console.error("ChessCageAI-Kontext konnte nicht sicher geladen werden:", error);
    return response(503, { error: "Dein Lern- und Wissenskontext für ChessCageAI ist vorübergehend nicht verfügbar." });
  }

  if (explanationRequest.purpose === "course_question" && knowledgeContext.length === 0) {
    return NextResponse.json(
      {
        explanation: "Ich habe in der geprüften ChessCage-Wissensbasis keine passende Quelle für diese Frage gefunden. Deshalb gebe ich dazu keine unbestätigte Sachauskunft.",
        sources: [],
        mode: "knowledge_unavailable",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  try {
    const result: unknown = provider
      ? await runCageAiModelRequest(() => provider.explain(
          explanationRequest,
          CAGE_AI_EXPLANATION_INSTRUCTIONS,
          personalContext,
          knowledgeContext,
          request.signal,
        ))
      : createLocalGameReviewExplanation(explanationRequest, personalContext);
    if (!isCageAiExplanationResponse(result)) {
      console.error("Der ChessCageAI-Provider hat eine ungültige Antwort geliefert.");
      return response(502, { error: "ChessCageAI konnte keine gültige Erklärung erstellen." });
    }
    if (explanationRequest.purpose === "course_question"
      && knowledgeContext.length > 0
      && !result.sourceKeys?.length) {
      console.error("ChessCageAI hat eine Kursantwort ohne Wissensquellen geliefert.");
      return response(502, { error: "ChessCageAI konnte keine quellengebundene Kursantwort erstellen." });
    }
    const sources = resolveCageAiKnowledgeCitations(result.sourceKeys ?? [], knowledgeContext);
    if (!sources) {
      console.error("Der ChessCageAI-Provider hat eine nicht abgerufene Wissensquelle zitiert.");
      return response(502, { error: "ChessCageAI hat eine ungültige Quellenangabe geliefert." });
    }
    return NextResponse.json(
      {
        explanation: result.explanation.trim(),
        sources,
        mode: provider ? "model" : "stockfish_local",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof CageAiModelBusyError) {
      return response(503, { error: error.message });
    }
    if (error instanceof CageAiModelUnavailableError) {
      if (explanationRequest.purpose === "game_review") {
        const fallback = createLocalGameReviewExplanation(explanationRequest, personalContext);
        return NextResponse.json(
          {
            explanation: fallback.explanation,
            sources: [],
            mode: "stockfish_local",
          },
          { headers: { "Cache-Control": "private, no-store, max-age=0" } },
        );
      }
      return response(503, { error: error.message });
    }
    if (error instanceof CageAiModelResponseTooLargeError) {
      return response(502, { error: error.message });
    }
    console.error("ChessCageAI konnte die Stellung nicht erklären:", error);
    return response(502, { error: "ChessCageAI konnte die Erklärung derzeit nicht erstellen." });
  }
}
