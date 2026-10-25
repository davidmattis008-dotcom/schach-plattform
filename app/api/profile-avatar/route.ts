import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");
  if (!userId || !USER_ID_PATTERN.test(userId)) return errorResponse(400, "Ungültige Profilanfrage.");

  let sessionClient;
  try {
    sessionClient = await createSupabaseServerClient();
  } catch (error) {
    console.error("Profilbildzugriff ist nicht konfiguriert:", error);
    return errorResponse(503, "Profilbilder sind vorübergehend nicht verfügbar.");
  }

  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return errorResponse(401, "Anmeldung erforderlich.");

  const { data: objectPath, error: pathError } = await sessionClient.rpc("get_profile_avatar_path", {
    p_user_id: userId,
  });
  if (pathError) {
    if (pathError.code === "42501") return errorResponse(403, "Zugriff nicht freigeschaltet.");
    console.error("Profilbildpfad konnte nicht geladen werden:", pathError);
    return errorResponse(503, "Profilbilder sind vorübergehend nicht verfügbar.");
  }
  if (typeof objectPath !== "string" || !objectPath) return errorResponse(404, "Profilbild nicht gefunden.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Profilbildzugriff benötigt die serverseitige Supabase-Servicekonfiguration.");
    return errorResponse(503, "Profilbilder sind vorübergehend nicht verfügbar.");
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: image, error: imageError } = await serviceClient.storage
    .from("profile-avatars")
    .download(objectPath);
  if (imageError || !image) {
    console.error("Profilbild konnte nicht aus dem privaten Storage geladen werden:", imageError);
    return errorResponse(404, "Profilbild nicht gefunden.");
  }

  return new Response(image.stream(), {
    headers: {
      "Content-Type": image.type || "application/octet-stream",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    },
  });
}
