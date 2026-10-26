import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CAGE_AI_EXPLANATION_INSTRUCTIONS,
  isCageAiExplanationResponse,
  validateCageAiExplanationRequest,
} from "@/lib/cage-ai/contracts";
import { getCageAiExplanationProvider } from "@/lib/cage-ai/provider";
import { loadCageAiPersonalContext } from "@/lib/cage-ai/personal-context";
import type { CageAiPersonalContext } from "@/lib/cage-ai/context-selection";
import { retrieveCageAiKnowledge, type CageAiKnowledgeChunk } from "@/lib/cage-ai/knowledge-retrieval";

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
    console.error("CageAI-Authentifizierung ist nicht verfügbar:", error);
    return response(503, { error: "CageAI ist vorübergehend nicht verfügbar." });
  }
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return response(401, { error: "Bitte melde dich an, um CageAI zu verwenden." });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return response(400, { error: "Die Anfrage enthält kein gültiges JSON." });
  }
  const explanationRequest = validateCageAiExplanationRequest(body);
  if (!explanationRequest) return response(400, { error: "Die Analyseanfrage ist ungültig." });

  const provider = getCageAiExplanationProvider();
  if (!provider) return response(503, { error: "CageAI ist noch nicht mit einem Sprachmodell verbunden." });

  let personalContext: CageAiPersonalContext;
  let knowledgeContext: CageAiKnowledgeChunk[];
  try {
    personalContext = await loadCageAiPersonalContext(
      sessionClient, user.id, explanationRequest.purpose,
    );
    knowledgeContext = await retrieveCageAiKnowledge(sessionClient, explanationRequest);
  } catch (error) {
    console.error("CageAI-Kontext konnte nicht sicher geladen werden:", error);
    return response(503, { error: "Dein Lern- und Wissenskontext ist vorübergehend nicht verfügbar." });
  }

  try {
    const result: unknown = await provider.explain(
      explanationRequest,
      CAGE_AI_EXPLANATION_INSTRUCTIONS,
      personalContext,
      knowledgeContext,
    );
    if (!isCageAiExplanationResponse(result)) {
      console.error("Der CageAI-Provider hat eine ungültige Antwort geliefert.");
      return response(502, { error: "CageAI konnte keine gültige Erklärung erstellen." });
    }
    const citedKeys = new Set(result.sourceKeys ?? []);
    const availableChunks = new Map(knowledgeContext.map((chunk) => [chunk.chunkId, chunk]));
    if ([...citedKeys].some((chunkId) => !availableChunks.has(chunkId))) {
      console.error("Der CageAI-Provider hat eine nicht abgerufene Wissensquelle zitiert.");
      return response(502, { error: "CageAI hat eine ungültige Quellenangabe geliefert." });
    }
    const sources = [...citedKeys].flatMap((chunkId) => {
      const chunk = availableChunks.get(chunkId);
      return chunk ? [{ title: chunk.title, url: chunk.sourceUrl, heading: chunk.heading }] : [];
    });
    return NextResponse.json(
      { explanation: result.explanation.trim(), sources },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("CageAI konnte die Stellung nicht erklären:", error);
    return response(502, { error: "CageAI konnte die Erklärung derzeit nicht erstellen." });
  }
}
