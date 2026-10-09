import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LoginRequest = { username: string; password: string };

function isLoginRequest(value: unknown): value is LoginRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.username === "string"
    && /^[a-zA-Z0-9_]{3,20}$/.test(body.username.trim())
    && typeof body.password === "string"
    && body.password.length > 0
    && body.password.length <= 1024;
}

function loginError(status: number) {
  return NextResponse.json(
    { error: "Anmeldung fehlgeschlagen. Prüfe Benutzername und Passwort." },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Ungültige Anfragequelle." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) return loginError(413);

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 4096) return loginError(413);
    body = JSON.parse(rawBody);
  } catch {
    return loginError(400);
  }
  if (!isLoginRequest(body)) return loginError(400);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    console.error("Username-Anmeldung ist serverseitig nicht vollständig konfiguriert.");
    return NextResponse.json(
      { error: "Username-Anmeldung ist derzeit nicht verfügbar." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: email, error: lookupError } = await adminClient.rpc(
    "lookup_auth_email_by_username",
    { p_username: body.username.trim() },
  );
  if (lookupError) {
    console.error("Username konnte für die Anmeldung nicht aufgelöst werden:", lookupError);
    return loginError(503);
  }

  const authEmail = typeof email === "string"
    ? email
    : `${randomUUID()}@invalid-login.local`;
  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: authEmail, password: body.password }),
      cache: "no-store",
    });
  } catch (error) {
    console.error("Supabase Auth ist für Username-Anmeldung nicht erreichbar:", error);
    return loginError(503);
  }

  if (!authResponse.ok) return loginError(401);
  const authResult: unknown = await authResponse.json().catch(() => null);
  if (!authResult || typeof authResult !== "object" ||
    !("access_token" in authResult) || typeof authResult.access_token !== "string" ||
    !("refresh_token" in authResult) || typeof authResult.refresh_token !== "string") {
    console.error("Supabase Auth hat eine ungültige Username-Anmeldesitzung zurückgegeben.");
    return loginError(502);
  }

  return NextResponse.json(
    {
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
