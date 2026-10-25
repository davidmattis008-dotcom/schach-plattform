"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getOnlineGamePgn,
  isOnlineGameRecord,
  ONLINE_HISTORY_OWNER_KEY,
  readOnlineHistory,
  type OnlineGameRecord,
} from "@/app/online/history-store";
import { createClient } from "@/lib/supabase/client";

function gameDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Datum unbekannt"
    : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}

export function ProfileGameHistory({ username, profileId, isOwnProfile }: {
  username: string;
  profileId: string;
  isOwnProfile: boolean;
}) {
  const [games, setGames] = useState<OnlineGameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const supabase = createClient();
        const [{ data, error: gamesError }, { data: { user }, error: authError }] = await Promise.all([
          supabase.rpc("list_public_profile_games", { p_username: username }),
          supabase.auth.getUser(),
        ]);
        if (gamesError) throw gamesError;
        if (authError) throw authError;
        const remoteGames = ((data ?? []) as unknown[]).flatMap((value) => {
          if (!value || typeof value !== "object" || !("record" in value)) return [];
          return isOnlineGameRecord(value.record) ? [value.record] : [];
        });
        const owner = localStorage.getItem(ONLINE_HISTORY_OWNER_KEY);
        const localGames = isOwnProfile && user?.id === profileId && (!owner || owner === user.id)
          ? readOnlineHistory()
          : [];
        const merged = new Map(localGames.map((game) => [game.id, game]));
        remoteGames.forEach((game) => merged.set(game.id, game));
        if (active) {
          setGames([...merged.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5));
          setError("");
        }
      } catch (loadError) {
        console.error("Öffentliche Partien konnten nicht geladen werden:", loadError);
        if (active) {
          setError("Partien konnten nicht geladen werden.");
          const owner = localStorage.getItem(ONLINE_HISTORY_OWNER_KEY);
          if (isOwnProfile && (!owner || owner === profileId)) setGames(readOnlineHistory().slice(0, 5));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("online-history-updated", refresh);
    window.addEventListener("account-online-games-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      active = false;
      window.removeEventListener("online-history-updated", refresh);
      window.removeEventListener("account-online-games-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [isOwnProfile, profileId, username]);

  return (
    <section className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5" aria-labelledby="profile-game-history-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="profile-game-history-heading" className="font-semibold">Partieverlauf</h2>
          <p className="mt-1 text-xs text-slate-500">Öffentlich · letzte 5 Partien</p>
        </div>
        {isOwnProfile && <Link href="/partien" className="shrink-0 text-xs font-semibold text-emerald-300 underline underline-offset-4">Alle</Link>}
      </div>
      {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Lädt …</p>
        : error && games.length === 0 ? <p role="status" className="mt-3 text-sm text-slate-400">{error}</p>
          : games.length === 0 ? <p className="mt-3 text-sm text-slate-500">Noch keine Partien.</p>
            : <ul className="mt-3 divide-y divide-slate-800">
              {games.map((game) => {
                const opponent = game.color === "w" ? game.blackName ?? "Gast" : game.whiteName ?? "Gast";
                return <li key={game.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">Gegen {opponent} · {game.timeControl}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{gameDate(game.playedAt)} · {game.resultText}</p>
                  </div>
                  {game.moves.length > 0 && <Link href={`/analyse?pgn=${encodeURIComponent(getOnlineGamePgn(game))}`} className="shrink-0 rounded-md border border-emerald-400/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-200">Analyse</Link>}
                </li>;
              })}
            </ul>}
    </section>
  );
}
