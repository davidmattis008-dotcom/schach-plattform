import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCageAiPersonalContext } from "@/lib/cage-ai/personal-context";
import {
  DEFAULT_TRAINING_PREFERENCES,
  createCageAiTrainingPlan,
  isCageAiTrainingPlan,
  validateTrainingPreferences,
} from "@/lib/cage-ai/training-plan";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 4_096;

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

async function authenticate() {
  let client;
  try {
    client = await createSupabaseServerClient();
  } catch (error) {
    console.error("CageAI-Trainingsplan ist nicht verfügbar:", error);
    return { error: response(503, { error: "Der CageAI-Trainingsplan ist vorübergehend nicht verfügbar." }) };
  }
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    return { error: response(401, { error: "Bitte melde dich an, um deinen Trainingsplan zu verwenden." }) };
  }
  return { client, user };
}

function isSameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}

async function readJson(request: Request): Promise<unknown | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return null;
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
    .from("cage_ai_training_plans")
    .select("preferences, plan, updated_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.error("CageAI-Trainingsplan konnte nicht geladen werden:", error);
    return response(503, { error: "Dein Trainingsplan konnte nicht geladen werden." });
  }
  if (!data) {
    return response(200, { plan: null, preferences: DEFAULT_TRAINING_PREFERENCES });
  }
  if (!isCageAiTrainingPlan(data.plan)) {
    console.error("Der gespeicherte CageAI-Trainingsplan ist ungültig.");
    return response(503, { error: "Der gespeicherte Trainingsplan ist ungültig und konnte nicht geladen werden." });
  }
  return response(200, {
    plan: data.plan,
    preferences: data.plan.preferences,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return response(403, { error: "Ungültige Anfragequelle." });
  const body = await readJson(request);
  if (!isRecord(body) || Object.keys(body).some((key) => key !== "preferences")) {
    return response(400, { error: "Die Trainingsplan-Anfrage ist ungültig." });
  }
  const preferences = validateTrainingPreferences(body.preferences);
  if (!preferences) {
    return response(400, { error: "Trainingszeit oder Trainingsbereiche sind ungültig." });
  }

  const auth = await authenticate();
  if ("error" in auth) return auth.error;
  try {
    const context = await loadCageAiPersonalContext(
      auth.client,
      auth.user.id,
      "training_plan",
    );
    const nextPlan = createCageAiTrainingPlan(context, preferences);
    const { data: previous, error: previousError } = await auth.client
      .from("cage_ai_training_plans")
      .select("plan")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (previousError) throw previousError;

    if (isCageAiTrainingPlan(previous?.plan)) {
      const completedTaskIds = new Set(
        previous.plan.tasks.filter((task) => task.completed).map((task) => task.id),
      );
      nextPlan.tasks = nextPlan.tasks.map((task) => ({
        ...task,
        completed: completedTaskIds.has(task.id),
      }));
    }

    const { error } = await auth.client
      .from("cage_ai_training_plans")
      .upsert({
        user_id: auth.user.id,
        preferences,
        plan: nextPlan,
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
    return response(200, { plan: nextPlan });
  } catch (error) {
    console.error("CageAI-Trainingsplan konnte nicht erstellt werden:", error);
    return response(503, { error: "Dein Plan konnte nicht aktualisiert werden. Bitte versuche es erneut." });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return response(403, { error: "Ungültige Anfragequelle." });
  const body = await readJson(request);
  if (!isRecord(body)
    || Object.keys(body).some((key) => key !== "taskId" && key !== "completed")
    || typeof body.taskId !== "string"
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[1-7]-(?:tactics|endgames|openings|strategy|game_analysis)$/.test(body.taskId)
    || typeof body.completed !== "boolean") {
    return response(400, { error: "Die Trainingsaufgabe ist ungültig." });
  }

  const auth = await authenticate();
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.client.rpc("set_my_cage_ai_training_task", {
    p_task_id: body.taskId,
    p_completed: body.completed,
  });
  if (error) {
    if (error.code === "P0001") return response(404, { error: "Diese Trainingsaufgabe ist nicht mehr verfügbar." });
    console.error("Trainingsfortschritt konnte nicht gespeichert werden:", error);
    return response(503, { error: "Der Aufgabenfortschritt konnte nicht gespeichert werden." });
  }
  if (!isCageAiTrainingPlan(data)) {
    console.error("Die Datenbank lieferte nach einer Aufgabenänderung einen ungültigen Plan.");
    return response(503, { error: "Der aktualisierte Trainingsplan ist ungültig." });
  }
  return response(200, { plan: data });
}
