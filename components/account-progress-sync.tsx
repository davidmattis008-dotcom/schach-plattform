"use client";

import { useEffect, useRef } from "react";
import {
  ACCOUNT_PROGRESS_LOCAL_CHANGE_EVENT,
  ACCOUNT_PROGRESS_OWNER_KEY,
  ACCOUNT_PROGRESS_STORAGE_KEYS,
  ACCOUNT_PROGRESS_UPDATED_EVENT,
  applyAccountProgress,
  mergeAccountProgress,
  readAccountProgress,
} from "@/lib/account-progress";
import { ONLINE_HISTORY_OWNER_KEY, readOnlineHistory } from "@/app/online/history-store";
import { createClient } from "@/lib/supabase/client";

export function AccountProgressSync() {
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

    const syncGames = async (forUserId: string) => {
      let firstError = "";
      const owner = localStorage.getItem(ONLINE_HISTORY_OWNER_KEY);
      if (owner && owner !== forUserId) {
        window.dispatchEvent(new Event("account-online-games-updated"));
        return false;
      }
      for (const game of readOnlineHistory()) {
        if (!active || userId !== forUserId) return false;
        if (activeUserGameIds.has(game.id)) continue;
        try {
          const { error } = await supabase.rpc("save_my_online_game", { p_record: game });
          if (error) throw error;
          activeUserGameIds.add(game.id);
        } catch (error) {
          console.error("Eine lokale Online-Partie konnte nicht mit dem Konto synchronisiert werden:", error);
          firstError ||= error instanceof Error ? error.message : String(error);
        }
      }
      if (!firstError) {
        localStorage.setItem(ONLINE_HISTORY_OWNER_KEY, forUserId);
        window.dispatchEvent(new Event("account-online-games-updated"));
      }
      return firstError;
    };

    const synchronize = async (forUserId: string) => {
      if (syncing) {
        dirty = true;
        pendingUserId = forUserId;
        return;
      }
      syncing = true;
      try {
        await syncGames(forUserId);
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
          const progressToApply = mergeAccountProgress(remoteProgress, readAccountProgress());
          applyAccountProgress(progressToApply);
          localStorage.setItem(ACCOUNT_PROGRESS_OWNER_KEY, forUserId);

          if (localRevision !== revisionAtStart) dirty = true;
        } while (dirty && active && userId === forUserId);
      } catch (error) {
        console.error("Der Lernfortschritt konnte nicht mit dem Konto synchronisiert werden:", error);
      } finally {
        syncing = false;
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
    };
  }, []);

  return null;
}
