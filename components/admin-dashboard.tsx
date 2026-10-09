"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminSupportInbox } from "@/components/admin-support-inbox";
import { ChessClubTraining } from "@/components/chess-club-training";

type AdminRole = "owner" | "admin" | "moderator";
type AdminUser = { user_id: string; username: string; avatar_url: string | null; is_suspended: boolean; reason: string | null; expires_at: string | null };
type ChatReport = {
  report_id: string;
  chat_type: "global" | "direct";
  message_id: string;
  message_body: string;
  reason: string;
  status: string;
  created_at: string;
  reporter_username: string;
  reported_username: string;
};
type AuditItem = { action: string; actor_username: string | null; target_username: string | null; details: Record<string, unknown>; created_at: string };
type View = "reports" | "users" | "audit" | "support" | "clubs";

function profileAvatarObjectPath(url: string, userId: string) {
  try {
    const marker = "/storage/v1/object/public/profile-avatars/";
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const objectPath = decodeURIComponent(pathname.slice(markerIndex + marker.length));
    return objectPath.startsWith(`${userId}/`) ? objectPath : null;
  } catch {
    return null;
  }
}

export function AdminDashboard() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [canManageClubs, setCanManageClubs] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [view, setView] = useState<View>("reports");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeBody, setNoticeBody] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [action, setAction] = useState<"suspend" | "notice" | "profile" | null>(null);
  const [removeBio, setRemoveBio] = useState(false);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  async function syncAuthBan(action: "ban" | "unban", userId: string, expiresAt: string | null = null) {
    const response = await fetch("/api/admin/account-ban", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId, expiresAt }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Supabase Auth konnte die Kontosperre nicht aktualisieren.");
  }

  const loadReports = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("admin_list_chat_reports", { p_status: "open" });
    if (error) throw error;
    setReports((data ?? []) as ChatReport[]);
  }, [getSupabase]);

  const loadAudit = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("admin_list_audit_log");
    if (error) throw error;
    setAudit((data ?? []) as AuditItem[]);
  }, [getSupabase]);

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const [accessResult, clubAccessResult] = await Promise.all([
        getSupabase().rpc("get_my_admin_access"),
        getSupabase().rpc("admin_can_manage_chess_clubs"),
      ]);
      if (!active) return;
      if (accessResult.error) setMessage("Adminzugriff konnte nicht geprüft werden. Wurde die Admin-Migration bereits ausgeführt?");
      else {
        const currentRole = (accessResult.data ?? [])[0]?.role as AdminRole | undefined;
        setRole(currentRole ?? null);
      }
      if (clubAccessResult.error) {
        console.error("Zugriff auf die Vereinsverwaltung konnte nicht geprüft werden:", clubAccessResult.error);
        setCanManageClubs(false);
        setMessage("Die Vereinsverwaltung ist noch nicht eingerichtet. Wende die Migration 20261009000002_chess_club_administration.sql in Supabase an.");
      } else {
        setCanManageClubs(clubAccessResult.data === true);
      }
      setAccessChecked(true);
    }
    void checkAccess();
    return () => { active = false; };
  }, [getSupabase]);

  useEffect(() => {
    if (!role) return;
    const initial = window.setTimeout(() => {
      void loadReports().catch((error) => {
        console.error("Chatmeldungen konnten nicht geladen werden:", error);
        setMessage("Chatmeldungen konnten nicht geladen werden.");
      }).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(initial);
  }, [loadReports, role]);

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const { data, error } = await getSupabase().rpc("admin_search_users", { p_query: query.trim() });
      if (error) throw error;
      setUsers((data ?? []) as AdminUser[]);
    } catch (error) {
      console.error("Nutzersuche fehlgeschlagen:", error);
      setMessage("Nutzer konnten nicht gesucht werden.");
    } finally {
      setLoading(false);
    }
  }

  async function submitUserAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !action) return;
    setLoading(true);
    setMessage("");
    let communitySuspensionSaved = false;
    try {
      if (action === "suspend") {
        const { error } = await getSupabase().rpc("admin_set_community_suspension", {
          p_user_id: selectedUser.user_id,
          p_reason: reason,
          p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        });
        if (error) throw error;
        communitySuspensionSaved = true;
        await syncAuthBan("ban", selectedUser.user_id, expiresAt ? new Date(expiresAt).toISOString() : null);
        setMessage(`Konto von ${selectedUser.username} gesperrt.`);
      } else if (action === "notice") {
        const { error } = await getSupabase().rpc("admin_send_user_notice", {
          p_user_id: selectedUser.user_id,
          p_title: noticeTitle,
          p_body: noticeBody,
        });
        if (error) throw error;
        setMessage(`Mitteilung an ${selectedUser.username} gesendet.`);
      } else {
        const { data, error } = await getSupabase().rpc("admin_moderate_profile", {
          p_user_id: selectedUser.user_id,
          p_remove_bio: removeBio,
          p_remove_avatar: removeAvatar,
          p_reason: reason,
        });
        if (error) throw error;
        const moderated = data as { avatar_url: string | null } | null;
        const objectPath = removeAvatar && moderated?.avatar_url
          ? profileAvatarObjectPath(moderated.avatar_url, selectedUser.user_id)
          : null;
        if (objectPath) {
          const { error: storageError } = await getSupabase().storage.from("profile-avatars").remove([objectPath]);
          if (storageError) {
            throw new Error(`Das Profilbild ist aus dem Profil entfernt, die Bilddatei konnte aber nicht aus dem Storage gelöscht werden: ${storageError.message}`);
          }
        }
        setMessage(`Profilinhalte von ${selectedUser.username} entfernt.`);
      }
      setAction(null);
      setSelectedUser(null);
      setReason("");
      setExpiresAt("");
      setNoticeTitle("");
      setNoticeBody("");
      setRemoveBio(false);
      setRemoveAvatar(false);
      if (view === "users") await searchUsersByQuery();
    } catch (error) {
      console.error("Adminmaßnahme fehlgeschlagen:", error);
      const errorMessage = error instanceof Error ? error.message : "Die Adminmaßnahme konnte nicht gespeichert werden.";
      setMessage(communitySuspensionSaved
        ? `Community-Aktionen sind gesperrt, aber die Kontosperre in Supabase Auth konnte nicht bestätigt werden: ${errorMessage}`
        : errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function searchUsersByQuery() {
    const { data, error } = await getSupabase().rpc("admin_search_users", { p_query: query.trim() });
    if (error) throw error;
    setUsers((data ?? []) as AdminUser[]);
  }

  async function clearSuspension(user: AdminUser) {
    setLoading(true);
    setMessage("");
    let authUnbanned = false;
    try {
      await syncAuthBan("unban", user.user_id);
      authUnbanned = true;
      const { error } = await getSupabase().rpc("admin_clear_community_suspension", { p_user_id: user.user_id });
      if (error) throw error;
      setMessage(`Community-Sperre von ${user.username} aufgehoben.`);
      await searchUsersByQuery();
    } catch (error) {
      console.error("Community-Sperre konnte nicht aufgehoben werden:", error);
      const errorMessage = error instanceof Error ? error.message : "Die Sperre konnte nicht aufgehoben werden.";
      setMessage(authUnbanned
        ? `Supabase Auth hat das Konto entsperrt, aber die Community-Sperre blieb bestehen: ${errorMessage}`
        : errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function resolveReport(report: ChatReport, resolution: "dismiss" | "remove_message") {
    setLoading(true);
    setMessage("");
    try {
      const { error } = await getSupabase().rpc("admin_resolve_chat_report", {
        p_report_id: report.report_id,
        p_resolution: resolution,
      });
      if (error) throw error;
      setReports((current) => current.filter((item) => item.report_id !== report.report_id));
      setMessage(resolution === "dismiss" ? "Meldung geschlossen." : "Gemeldete Nachricht entfernt und Meldung geschlossen.");
      if (role === "owner" || role === "admin") await loadAudit();
    } catch (error) {
      console.error("Meldung konnte nicht bearbeitet werden:", error);
      setMessage(error instanceof Error ? error.message : "Meldung konnte nicht bearbeitet werden.");
    } finally {
      setLoading(false);
    }
  }

  async function changeView(next: View) {
    setView(next);
    setMessage("");
    setLoading(true);
    try {
      if (next === "reports") await loadReports();
      if (next === "audit" && (role === "owner" || role === "admin")) await loadAudit();
    } catch (error) {
      console.error("Adminansicht konnte nicht geladen werden:", error);
      setMessage("Daten für diese Ansicht konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  if (!accessChecked) {
    return <main className="min-h-screen bg-slate-950 p-6 text-slate-300" role="status">Adminzugriff wird geprüft …</main>;
  }
  if (!role) {
    return <main className="min-h-screen bg-slate-950 p-6 text-white"><section className="mx-auto mt-12 max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6"><h1 className="text-2xl font-semibold">Kein Adminzugriff</h1><p className="mt-3 text-sm leading-6 text-slate-300">Dieses Konto hat keine Adminrolle. Die Rolle wird ausschließlich serverseitig in Supabase vergeben. Falls du die Migration eben ausgeführt hast, melde dich ab und wieder an.</p>{message && <p role="alert" className="mt-3 text-sm text-amber-300">{message}</p>}</section></main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">Sicherheitszentrale · {role}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Administration</h1>
        <p className="mt-2 text-sm text-slate-400">Bearbeite gemeldete Nachrichten und Profile, verwalte Kontosperren und sende Nutzerhinweise. Alle Maßnahmen werden protokolliert.</p>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Admin-Bereiche">
          {(["reports", "users", ...(role === "owner" || role === "admin" ? ["support", "audit"] : []), ...(canManageClubs ? ["clubs"] : [])] as View[]).map((item) => (
            <button key={item} type="button" onClick={() => void changeView(item)} aria-pressed={view === item} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === item ? "bg-emerald-400 text-slate-950" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>
              {item === "reports" ? `Meldungen${reports.length ? ` · ${reports.length}` : ""}` : item === "users" ? "Nutzer" : item === "support" ? "Support" : item === "clubs" ? "Vereine" : "Protokoll"}
            </button>
          ))}
        </div>

        {message && <p role="status" className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p>}
        {loading && <p className="mt-4 text-sm text-slate-400" role="status">Wird geladen …</p>}

        {view === "reports" && <section className="mt-5 space-y-3">
          <h2 className="text-lg font-semibold">Offene Chatmeldungen</h2>
          {reports.length === 0 && !loading && <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Keine offenen Meldungen.</p>}
          {reports.map((report) => <article key={report.report_id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>{report.chat_type === "global" ? "Globaler Chat" : "Gemeldete private Nachricht"} · von {report.reporter_username}</span><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString("de-DE")}</time></div>
            <p className="mt-3 text-sm text-slate-300">Gemeldet wurde <strong>{report.reported_username}</strong>: {report.reason}</p>
            <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border-l-2 border-amber-400 bg-slate-950 p-3 text-sm text-slate-100">{report.message_body}</blockquote>
            <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={loading} onClick={() => void resolveReport(report, "remove_message")} className="rounded-lg bg-rose-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Nachricht entfernen</button><button type="button" disabled={loading} onClick={() => void resolveReport(report, "dismiss")} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Meldung schließen</button></div>
          </article>)}
        </section>}

        {view === "users" && <section className="mt-5 space-y-4">
          <form onSubmit={searchUsers} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <label htmlFor="admin-user-search" className="block text-sm font-semibold">Nutzer suchen</label>
            <p className="mt-1 text-xs text-slate-400">Suche nach mindestens zwei Zeichen im Benutzernamen.</p>
            <div className="mt-3 flex gap-2"><input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={40} minLength={2} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" placeholder="Benutzername" /><button type="submit" disabled={loading || query.trim().length < 2} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Suchen</button></div>
          </form>

          {users.map((user) => <article key={user.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div><p className="font-semibold">{user.username}</p>            {user.is_suspended ? <p className="mt-1 text-xs text-rose-300">Konto/Community gesperrt: {user.reason} {user.expires_at ? `(bis ${new Date(user.expires_at).toLocaleString("de-DE")})` : "(ohne Ablaufdatum)"}</p> : <p className="mt-1 text-xs text-slate-500">Nicht gesperrt</p>}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setSelectedUser(user); setAction("notice"); setMessage(""); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs hover:bg-slate-800">Mitteilung senden</button>
              <button type="button" onClick={() => { setSelectedUser(user); setAction("profile"); setMessage(""); setRemoveBio(false); setRemoveAvatar(false); }} className="rounded-lg border border-amber-400/50 px-3 py-2 text-xs text-amber-200 hover:bg-slate-800">Profil bereinigen</button>
              {user.is_suspended
                ? <button type="button" disabled={loading} onClick={() => void clearSuspension(user)} className="rounded-lg border border-emerald-400/50 px-3 py-2 text-xs text-emerald-300 disabled:opacity-50">Sperre aufheben</button>
                : <button type="button" onClick={() => { setSelectedUser(user); setAction("suspend"); setMessage(""); }} className="rounded-lg border border-rose-400/50 px-3 py-2 text-xs text-rose-300">Konto sperren</button>}
            </div>
          </article>)}

          {selectedUser && action && <form onSubmit={submitUserAction} className="space-y-3 rounded-2xl border border-emerald-400/30 bg-slate-900 p-4 sm:p-5">
            <h2 className="font-semibold">{action === "suspend" ? `Community sperren: ${selectedUser.username}` : action === "notice" ? `Mitteilung an ${selectedUser.username}` : `Profil bereinigen: ${selectedUser.username}`}</h2>
            {action === "suspend" ? <>
              <label className="block text-sm">Begründung<textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="block text-sm">Ende (leer = unbefristet)<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 block rounded-lg border border-slate-700 bg-slate-950 p-2" /></label>
              <p className="text-xs text-slate-400">Die Sperre greift in Supabase Auth und blockiert zusätzlich Schreibzugriffe auf Chat und Freundschaften.</p>
            </> : action === "notice" ? <>
              <label className="block text-sm">Titel<input required minLength={3} maxLength={100} value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
              <label className="block text-sm">Mitteilung<textarea required minLength={3} maxLength={2000} value={noticeBody} onChange={(event) => setNoticeBody(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
            </> : <>
              <p className="text-sm text-slate-300">Entferne nur Inhalte, die gegen deine veröffentlichten Community-Regeln verstoßen. Private Nachrichten sind davon nicht betroffen.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeBio} onChange={(event) => setRemoveBio(event.target.checked)} /> Biografie entfernen</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={removeAvatar} onChange={(event) => setRemoveAvatar(event.target.checked)} /> Profilbild entfernen</label>
              <label className="block text-sm">Begründung<textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" /></label>
            </>}
            <div className="flex gap-2"><button type="submit" disabled={loading || (action === "profile" && !removeBio && !removeAvatar)} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Bestätigen</button><button type="button" onClick={() => { setAction(null); setSelectedUser(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Abbrechen</button></div>
          </form>}
        </section>}

        {view === "audit" && (role === "owner" || role === "admin") && <section className="mt-5">
          <h2 className="text-lg font-semibold">Letzte Adminmaßnahmen</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr><th className="p-3">Zeit</th><th className="p-3">Admin</th><th className="p-3">Aktion</th><th className="p-3">Nutzer</th><th className="p-3">Details</th></tr></thead><tbody>{audit.map((item, index) => <tr key={`${item.created_at}-${index}`} className="border-t border-slate-800"><td className="p-3 text-slate-400">{new Date(item.created_at).toLocaleString("de-DE")}</td><td className="p-3">{item.actor_username ?? "—"}</td><td className="p-3">{item.action}</td><td className="p-3">{item.target_username ?? "—"}</td><td className="max-w-sm truncate p-3 text-slate-400">{JSON.stringify(item.details)}</td></tr>)}</tbody></table>{audit.length === 0 && <p className="p-4 text-sm text-slate-400">Noch keine protokollierten Maßnahmen.</p>}</div>
        </section>}
        {view === "support" && (role === "owner" || role === "admin") && <AdminSupportInbox />}
        {view === "clubs" && canManageClubs && <section className="mt-5">
          <h2 className="mb-3 text-lg font-semibold">Vereinsverwaltung</h2>
          <p className="mb-4 text-sm text-slate-400">Verwalte Vereine, Gruppen, Mitglieder, Trainingspläne, Aufgaben und interne Turniere.</p>
          <ChessClubTraining adminMode />
        </section>}
      </div>
    </main>
  );
}
