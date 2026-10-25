import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Abmeldung fehlgeschlagen:", error);
      return new Response("Abmeldung fehlgeschlagen. Bitte versuche es erneut.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.redirect(new URL("/login", request.url), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Abmeldesitzung konnte nicht initialisiert werden:", error);
    return new Response("Abmeldung fehlgeschlagen. Bitte versuche es erneut.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
