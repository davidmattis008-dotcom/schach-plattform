"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type TestUser = {
  user_id: string;
  username: string | null;
  email: string | null;
  has_access: boolean;
  is_admin: boolean;
};

export function AdminSiteAccess() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<TestUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const { data, error } = await createClient().rpc("admin_list_site_access_users", {
        p_query: query.trim(),
      });
      if (error) throw error;
      setUsers((data ?? []) as TestUser[]);
    } catch (error) {
      console.error("Testkonten konnten nicht gesucht werden:", error);
      setMessage("Testkonten konnten nicht geladen werden. Prüfe, ob die private Zugriffs-Migration angewendet wurde.");
    } finally {
      setLoading(false);
    }
  }

  async function setAccess(user: TestUser, enabled: boolean) {
    setLoading(true);
    setMessage("");
    try {
      const { error } = await createClient().rpc("admin_set_site_access", {
        p_user_id: user.user_id,
        p_enabled: enabled,
      });
      if (error) throw error;
      setUsers((current) => current.map((item) =>
        item.user_id === user.user_id ? { ...item, has_access: enabled } : item,
      ));
      setMessage(`Testzugriff für ${user.username ?? user.email ?? "das Konto"} ${enabled ? "freigeschaltet" : "gesperrt"}.`);
    } catch (error) {
      console.error("Testzugriff konnte nicht geändert werden:", error);
      setMessage("Testzugriff konnte nicht geändert werden. Prüfe deine Adminrolle und die Datenbankmigration.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Testzugriffe</h2>
        <p className="mt-1 text-sm text-slate-400">
          Suche Konten nach Benutzername oder E-Mail und schalte den App-Zugriff frei oder sperre ihn. Cloudflare-Access-Freigaben müssen zusätzlich im Cloudflare-Dashboard gepflegt werden.
        </p>
      </div>
      <form onSubmit={searchUsers} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        <label htmlFor="site-access-search" className="block text-sm font-semibold">Benutzername oder E-Mail</label>
        <div className="mt-3 flex gap-2">
          <input
            id="site-access-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={254}
            minLength={2}
            required
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Mindestens zwei Zeichen"
          />
          <button type="submit" disabled={loading || query.trim().length < 2} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
            Suchen
          </button>
        </div>
      </form>
      {message && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p>}
      {users.map((user) => (
        <article key={user.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div>
            <p className="font-semibold">{user.username ?? user.email ?? "Unbenanntes Konto"}</p>
            <p className={`mt-1 text-xs ${user.has_access ? "text-emerald-300" : "text-slate-400"}`}>
              {user.is_admin ? "Administrationskonto · immer freigeschaltet" : user.has_access ? "Freigeschaltet" : "Nicht freigeschaltet"}
            </p>
          </div>
          {!user.is_admin && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void setAccess(user, !user.has_access)}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${user.has_access ? "border-rose-400/50 text-rose-300 hover:bg-slate-800" : "border-emerald-400/50 text-emerald-300 hover:bg-slate-800"}`}
            >
              {user.has_access ? "Zugriff sperren" : "Zugriff freigeben"}
            </button>
          )}
        </article>
      ))}
      {!loading && query.trim().length >= 2 && users.length === 0 && !message && (
        <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Keine passenden Konten gefunden.</p>
      )}
    </section>
  );
}
