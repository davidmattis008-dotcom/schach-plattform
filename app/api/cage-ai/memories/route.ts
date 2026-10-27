import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MAX_CAGE_AI_MEMORIES,
  normalizeCageAiMemoryDraft,
} from "@/lib/cage-ai/memories";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function authenticate() {
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch (error) {
    console.error("ChessCageAI-Speicher ist nicht verfügbar:", error);
    return { error: response(503, { error: "Der ChessCageAI-Speicher ist vorübergehend nicht verfügbar." }) };
  }
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    return { error: response(401, { error: "Bitte melde dich an, um deine Erinnerungen zu verwalten." }) };
  }
  return { client, user };
}

async function readJson(request: Request): Promise<unknown | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return null;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) return null;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) return null;
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await authenticate();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.client
    .from("cage_ai_memories")
    .select("id, memory_type, content, created_at")
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(MAX_CAGE_AI_MEMORIES);

  if (error) {
    console.error("ChessCageAI-Erinnerungen konnten nicht geladen werden:", error);
    return response(503, { error: "Deine Erinnerungen konnten nicht geladen werden." });
  }
  return response(200, { memories: data ?? [] });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return response(403, { error: "Ungültige Anfragequelle." });
  const body = await readJson(request);
  if (!isRecord(body) || !hasOnlyKeys(body, ["memoryType", "content"])) {
    return response(400, { error: "Die Erinnerung enthält ungültige Daten." });
  }
  const draft = normalizeCageAiMemoryDraft(body);
  if (!draft) {
    return response(400, { error: "Wähle eine Kategorie und gib 3 bis 600 Zeichen ein." });
  }

  const auth = await authenticate();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.client
    .from("cage_ai_memories")
    .insert({
      user_id: auth.user.id,
      memory_type: draft.memoryType,
      content: draft.content,
    })
    .select("id, memory_type, content, created_at")
    .single();

  if (error?.code === "23505") {
    return response(409, { error: "Diese Erinnerung ist bereits gespeichert." });
  }
  if (error?.code === "P0001") {
    return response(409, { error: "Dein ChessCageAI-Speicher ist voll. Lösche zuerst eine Erinnerung." });
  }
  if (error) {
    console.error("ChessCageAI-Erinnerung konnte nicht gespeichert werden:", error);
    return response(503, { error: "Die Erinnerung konnte nicht gespeichert werden." });
  }
  return response(201, { memory: data });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return response(403, { error: "Ungültige Anfragequelle." });
  const body = await readJson(request);
  if (!isRecord(body)) return response(400, { error: "Die Löschanfrage ist ungültig." });
  const deleteAll = body.deleteAll === true && hasOnlyKeys(body, ["deleteAll"]);
  const memoryId = typeof body.id === "string" && UUID_PATTERN.test(body.id)
    && hasOnlyKeys(body, ["id"])
    ? body.id
    : null;
  if (!deleteAll && !memoryId) {
    return response(400, { error: "Wähle eine gültige Erinnerung zum Löschen aus." });
  }

  const auth = await authenticate();
  if ("error" in auth) return auth.error;
  let query = auth.client
    .from("cage_ai_memories")
    .delete()
    .eq("user_id", auth.user.id);
  if (!deleteAll && memoryId) query = query.eq("id", memoryId);
  const { data, error } = await query.select("id");
  if (error) {
    console.error("ChessCageAI-Erinnerungen konnten nicht gelöscht werden:", error);
    return response(503, { error: "Die Erinnerungen konnten nicht gelöscht werden." });
  }
  if (!deleteAll && (!data || data.length === 0)) {
    return response(404, { error: "Diese Erinnerung wurde nicht gefunden." });
  }
  return response(200, { deleted: data?.length ?? 0 });
}
