import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function privateNotice(status: number, message: string) {
  return new NextResponse(
    `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ChessCage · privater Testbetrieb</title><body style="margin:0;background:#050505;color:#f8fafc;font:16px system-ui,sans-serif"><main style="max-width:36rem;margin:12vh auto;padding:2rem"><h1>ChessCage im privaten Testbetrieb</h1><p>${message}</p><p><a style="color:#fcd34d" href="/login">Anmelden</a> · <a style="color:#fcd34d" href="/api/auth/signout">Abmelden</a></p></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function apiDenied(status: number, error: string) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

function isPublicRoute(pathname: string) {
  return pathname === "/login"
    || pathname === "/forgot-password"
    || pathname === "/update-password"
    || pathname === "/auth/callback"
    || pathname === "/sw.js"
    || pathname === "/api/auth/username-login"
    || pathname === "/api/auth/signout";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/auth/register") {
    return privateNotice(403, "Die Registrierung ist geschlossen. Bitte wende dich an den Betreiber.");
  }
  if (isPublicRoute(pathname)) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    console.error("Privater Zugriff kann ohne Supabase-Konfiguration nicht geprüft werden.");
    return request.nextUrl.pathname.startsWith("/api/")
      ? apiDenied(503, "Zugriffsschutz ist vorübergehend nicht verfügbar.")
      : privateNotice(503, "Der Zugriffsschutz ist vorübergehend nicht verfügbar.");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  let user;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error && error.status !== 401 && error.status !== 403) throw error;
    user = data.user;
  } catch (error) {
    console.error("Supabase-Anmeldestatus konnte für die Zugriffskontrolle nicht geprüft werden:", error);
    return request.nextUrl.pathname.startsWith("/api/")
      ? apiDenied(503, "Zugriffsschutz ist vorübergehend nicht verfügbar.")
      : privateNotice(503, "Der Zugriffsschutz ist vorübergehend nicht verfügbar.");
  }

  if (!user) {
    if (pathname.startsWith("/api/")) return apiDenied(401, "Anmeldung erforderlich.");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const { data: hasAccess, error } = await supabase.rpc("get_my_site_access");
    if (error) {
      if (error.code === "42501") {
        return pathname.startsWith("/api/")
          ? apiDenied(403, "Dieses Konto ist nicht für den Testbetrieb freigeschaltet.")
          : privateNotice(403, "Dieses Konto ist nicht für den Testbetrieb freigeschaltet.");
      }
      throw error;
    }
    if (hasAccess !== true) {
      return pathname.startsWith("/api/")
        ? apiDenied(403, "Dieses Konto ist nicht für den Testbetrieb freigeschaltet.")
        : privateNotice(403, "Dieses Konto ist nicht für den Testbetrieb freigeschaltet.");
    }
  } catch (error) {
    console.error("Allowlist konnte für die Zugriffskontrolle nicht geprüft werden:", error);
    return pathname.startsWith("/api/")
      ? apiDenied(503, "Zugriffsschutz ist vorübergehend nicht verfügbar.")
      : privateNotice(503, "Der Zugriffsschutz ist vorübergehend nicht verfügbar.");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
