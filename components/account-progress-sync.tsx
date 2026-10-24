"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT,
  ACCOUNT_PROGRESS_OWNER_KEY,
  ACCOUNT_PROGRESS_STORAGE_KEYS,
  ACCOUNT_PROGRESS_UPDATED_EVENT,
  applyAccountProgress,
  mergeAccountProgress,
  readAccountProgress,
} from "@/lib/account-progress";
import { readOnlineHistory } from "@/app/online/history-store";
import { createClient } from "@/lib/supabase/client";

type SyncState = "idle" | "syncing" | "saved" | "error";

export function AccountProgressSync() {
  const [state, setState] = useState<SyncState>("idle");
  const [signedIn, setSignedIn] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let userId: string | null = null;
    let syncing = false;
    let dirty = false;
    let pendingUserId: string | null = null;
    let localRevision = 0;
    let activeUserGameIds = new Set<string>();
    let showSavedTimeout: ReturnType<typeof setTimeout> | null = null;

    const syncGames = async (forUserId: string) => {
      let failed = false;
      for (const game of readOnlineHistory()) {
        if (!active || userId !== forUserId) return false;
        if (activeUserGameIds.has(game.id)) continue;
        try {
          const { error } = await supabase.rpc("save_my_online_game", { p_record: game });
          if (error) throw error;
          activeUserGameIds.add(game.id);
        } catch (error) {
          console.error("Eine lokale Online-Partie konnte nicht mit dem Konto synchronisiert werden:", error);
          failed = true;
        }
      }
      if (!failed) window.dispatchEvent(new Event("account-online-games-updated"));
      return failed;
    };

    const synchronize = async (forUserId: string) => {
      if (syncing) {
        dirty = true;
        pendingUserId = forUserId;
        return;
      }
      syncing = true;
      setState("syncing");
      let failed = false;
      try {
        failed = await syncGames(forUserId);
        if (!active || userId !== forUserId) return;
        do {
          dirty = false;
          const owner = localStorage.getItem(ACCOUNT_PROGRESS_OWNER_KEY);
          if (owner && owner !== forUserId) {
            for (const key of ACCOUNT_PROGRESS_STORAGE_KEYS) localStorage.removeItem(key);
            localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, forUserId);
            window.dispatchEvent(new Event(ACCOUNT_PROGRESS_UPDATED_EVENT));
          }
          const revisionAtStart = localRevision;
          const localProgress = owner && owner !== forUserId ? {} : readAccountProgress();
          const { data, error } = await supabase.rpc("sync_my_learning_progress", {
            p_progress: localProgress,
          });
          if (error) throw error;
          if (!active || userId !== forUserId) return;

          const remoteProgress = data && typeof data === "object" && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {};
          const progressToApply = localRevision === revisionAtStart
            ? remoteProgress
            : mergeAccountProgress(remoteProgress, readAccountProgress());
          applyAccountProgress(progressToApply);
          localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, forUserId);

          if (localRevision !== revisionAtStart) dirty = true;
        } while (dirty && active && userId === forUserId);

        if (active && userId === forUserId) {
          setState(failed ? "error" : "saved");
          if (showSavedTimeout) clearTimeout(showSavedTimeout);
          if (!failed) showSavedTimeout = setTimeout(() => setState("idle"), 4000);
        }
      } catch (error) {
        console.error("Der Lernfortschritt konnte nicht mit dem Konto synchronisiert werden:", error);
        failed = true;
      } finally {
        syncing = false;
        if (active && userId === forUserId && failed) setState("error");
        const nextUserId = pendingUserId;
        pendingUserId = null;
        if (nextUserId && active && userId === nextUserId) void synchronize(nextUserId);
        else if (dirty && active && userId === forUserId) void synchronize(forUserId);
      }
    };

    const handleLocalChange = () => {
      localRevision++;
      if (!userId) return;
      if (syncing) {
        dirty = true;
        return;
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (userId) void synchronize(userId);
      }, 500);
    };

    const authSubscription = supabase.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(() => {
        if (!active) return;
        const nextUserId = session?.user.id ?? null;
        if (nextUserId === userId) return;
        userId = nextUserId;
        activeUserGameIds = new Set();
        if (showSavedTimeout) clearTimeout(showSavedTimeout);
        showSavedTimeout = null;
        setSignedIn(Boolean(nextUserId));
        setState("idle");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (nextUserId) void synchronize(nextUserId);
      });
    });

    window.addEventListener(ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT, handleLocalChange);
    window.addEventListener("online-history-updated", handleLocalChange);
    return () => {
      active = false;
      authSubscription.data.subscription.unsubscribe();
      window.removeEventListener(ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT, handleLocalChange);
      window.removeEventListener("online-history-updated", handleLocalChange);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (showSavedTimeout) clearTimeout(showSavedTimeout);
    };
  }, []);

  if (!signedIn || state === "idle") return null;

  const message = state === "syncing"
    ? "Synchronisiere deinen Lernfortschritt mit dem Konto …"
    : state === "saved"
      ? "Lernfortschritt und Online-Partien sind im Konto gespeichert."
    : "Ein Teil konnte nicht synchronisiert werden. Prüfe die Verbindung und ob die Supabase-Migration eingerichtet ist; lokal bleiben die Daten erhalten.";

  return (
    <p role="status" className="fixed bottom-3 left-3 z-50 max-w-sm rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-300 shadow-lg md:left-[19rem]">
      {message}
    </p>
  );
}
