"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SelectMenu } from "@/components/select-menu";

type GameMode = "bullet" | "blitz" | "rapid" | "classical";
type LeaderboardScope = "global" | "friends";
type Leader = {
  position: number;
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number;
  rated_games: number;
};

function isMissingLeaderboardRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return code === "PGRST202" || /could not find the function/i.test(message);
}

const gameModes: { id: GameMode; label: string }[] = [
  { id: "bullet", label: "Bullet" },
  { id: "blitz", label: "Blitz" },
  { id: "rapid", label: "Rapid" },
  { id: "classical", label: "Klassisch" },
];

function LeaderAvatar({ leader }: { leader: Leader }) {
  return leader.avatar_url
    ? <img src={leader.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full bg-slate-800 object-cover" />
    : <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 font-semibold text-emerald-300">{leader.username.slice(0, 1).toUpperCase()}</span>;
}

export function Leaderboards() {
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [gameMode, setGameMode] = useState<GameMode>("blitz");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const supabase = getSupabase();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (active) setUserId(user?.id ?? null);

        if (scope === "friends" && !user) {
          if (active) setLeaders([]);
          return;
        }

        const { data, error: queryError } = scope === "global"
          ? await supabase.rpc("get_global_leaderboard", { p_game_mode: gameMode })
          : await supabase.rpc("get_friends_leaderboard", { p_game_mode: gameMode });
        if (queryError) throw queryError;
        if (active) setLeaders((data ?? []) as Leader[]);
      } catch (loadError) {
        if (active) setError(isMissingLeaderboardRpc(loadError)
          ? "Die Ranglistenfunktionen sind in der Datenbank noch nicht eingerichtet. Bitte wende die Migration 20261007000002_leaderboards.sql an."
          : "Die Rangliste konnte nicht geladen werden. Bitte versuche es erneut.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [gameMode, getSupabase, scope]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2" aria-label="Ranglistenart">
          <button type="button" onClick={() => setScope("global")} aria-pressed={scope === "global"} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${scope === "global" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Global</button>
          <button type="button" onClick={() => setScope("friends")} aria-pressed={scope === "friends"} className={`rounded-lg px-4 py-2.5 text-sm font-semibold ${scope === "friends" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Freunde</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <span>Bedenkzeit</span>
          <SelectMenu compact aria-label="Bedenkzeit" value={gameMode} options={gameModes.map((mode) => ({ value: mode.id, label: mode.label }))} onChange={(value) => setGameMode(value as GameMode)} />
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-4 text-sm text-rose-200">{error}</p>}
      {scope === "friends" && !userId && !loading && !error ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold">Melde dich an für die Freundesrangliste</h2>
          <p className="mt-2 text-sm text-slate-400">Hier werden deine Wertung und die deiner bestätigten Freunde verglichen.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950">Zum Login</Link>
        </section>
      ) : loading ? (
        <p role="status" className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">Rangliste wird geladen …</p>
      ) : !error && leaders.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
          {scope === "friends"
            ? "In diesem Modus haben du und deine Freunde noch keine gewerteten Online-Partien."
            : "Für diesen Modus gibt es noch keine gewerteten Spieler."}
        </p>
      ) : !error && (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid-cols-[4rem_minmax(0,1fr)_7rem_7rem]">
            <span>Platz</span><span>Spieler</span><span className="text-right">Elo</span><span className="text-right">Partien</span>
          </div>
          <ol>
            {leaders.map((leader) => (
              <li key={leader.user_id} className={`grid grid-cols-[3rem_minmax(0,1fr)_5rem_5rem] items-center gap-3 border-b border-slate-800/70 px-4 py-3 last:border-0 sm:grid-cols-[4rem_minmax(0,1fr)_7rem_7rem] ${leader.user_id === userId ? "bg-emerald-950/30" : ""}`}>
                <span className={`font-bold tabular-nums ${leader.position <= 3 ? "text-emerald-300" : "text-slate-500"}`}>#{leader.position}</span>
                <Link href={`/profile/${encodeURIComponent(leader.username)}`} className="flex min-w-0 items-center gap-3 hover:text-emerald-300">
                  <LeaderAvatar leader={leader} />
                  <span className="truncate font-medium">{leader.username}{leader.user_id === userId && <span className="ml-2 text-xs text-emerald-300">Du</span>}</span>
                </Link>
                <span className="text-right font-bold tabular-nums text-emerald-300">{leader.rating}</span>
                <span className="text-right text-sm tabular-nums text-slate-400">{leader.rated_games}</span>
              </li>
            ))}
          </ol>
          {scope === "global" && leaders.length === 100 && <p className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">Es werden die besten 100 Spieler dieses Modus angezeigt.</p>}
        </div>
      )}
    </div>
  );
}
