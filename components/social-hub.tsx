"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDirectMessageNotifications } from "@/components/direct-message-notifications";
import { ONLINE_TIME_CONTROLS } from "@/app/online/protocol";
import { SelectMenu } from "@/components/select-menu";
import { getProfileAvatarSrc } from "@/lib/profile-avatar";

type SocialTab = "friends" | "challenges";
type Person = { id: string; username: string; bio?: string; avatar_url?: string | null };
type FriendRequest = { request_id: string; user_id: string; username: string; avatar_url: string | null; status: string; direction: "incoming" | "outgoing"; created_at: string };
type ChatMessage = { id: string; sender_id: string; username: string; avatar_url: string | null; body: string; created_at: string };
type BlockedUser = { user_id: string; username: string; created_at: string };
type ChessChallenge = {
  challenge_id: string;
  challenger_id: string;
  challenged_id: string;
  challenger_username: string;
  challenged_username: string;
  initial_seconds: number;
  increment_seconds: number;
  status: "pending" | "accepted";
  created_at: string;
};

function needsSocialMigrations(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return /PGRST202|PGRST204|42501/i.test(`${code} ${message}`);
}

function Avatar({ person, userId, size = "h-10 w-10" }: { person: Pick<Person, "username" | "avatar_url">; userId: string; size?: string }) {
  const avatarSrc = getProfileAvatarSrc(userId, person.avatar_url);
  return avatarSrc
    ? <img src={avatarSrc} alt="" className={`${size} rounded-full bg-slate-800 object-cover`} />
    : <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-full bg-slate-800 font-semibold text-emerald-300`}>{person.username.slice(0, 1).toUpperCase()}</span>;
}

function messageText(error: { message: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.message.includes("Private Nachrichten")) return "Private Nachrichten sind nur zwischen bestätigten Freunden möglich.";
  if (error.message.includes("Blockierung") || error.message.includes("blockiert")) return "Für diesen Spieler besteht eine Blockierung.";
  if (error.message.includes("viele Nachrichten")) return "Du hast gerade viele Nachrichten gesendet. Bitte warte kurz.";
  return fallback;
}

export function SocialHub() {
  const { unreadByFriend, refreshUnread } = useDirectMessageNotifications();
  const [tab, setTab] = useState<SocialTab>("friends");
  const [userId, setUserId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Person[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [challenges, setChallenges] = useState<ChessChallenge[]>([]);
  const [challengeControlId, setChallengeControlId] = useState("5+3");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeFriend, setActiveFriend] = useState<Person | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageScope, setMessageScope] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }, []);

  const loadFriends = useCallback(async () => {
    const supabase = getSupabase();
    const [{ data: friendData, error: friendError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.rpc("get_my_friends"),
      supabase.rpc("get_my_friend_requests"),
    ]);
    if (friendError) throw friendError;
    if (requestError) throw requestError;
    setFriends((friendData ?? []) as Person[]);
    setRequests((requestData ?? []) as FriendRequest[]);
  }, [getSupabase]);

  const loadBlockedUsers = useCallback(async () => {
    const { data, error: blockedError } = await getSupabase().rpc("list_my_blocked_users");
    if (blockedError) throw blockedError;
    setBlockedUsers((data ?? []) as BlockedUser[]);
  }, [getSupabase]);

  const loadChallenges = useCallback(async () => {
    const { data, error: challengeError } = await getSupabase().rpc("list_my_chess_challenges");
    if (challengeError) throw challengeError;
    setChallenges((data ?? []) as ChessChallenge[]);
  }, [getSupabase]);

  const loadMessages = useCallback(async () => {
    if (activeFriend) {
      const { data, error: queryError } = await getSupabase().rpc("get_direct_messages", { p_other_user_id: activeFriend.id });
      if (queryError) throw queryError;
      setMessages((data ?? []) as ChatMessage[]);
      setMessageScope(activeFriend.id);
      const { error: readError } = await getSupabase().rpc("mark_direct_messages_read", { p_other_user_id: activeFriend.id });
      if (readError) {
        console.error("Private Nachrichten konnten nicht als gelesen markiert werden:", readError);
      } else {
        await refreshUnread();
      }
    }
  }, [activeFriend, getSupabase, refreshUnread]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const { data: { user } } = await getSupabase().auth.getUser();
        if (!active) return;
        setUserId(user?.id ?? null);
        if (user) await Promise.all([loadFriends(), loadBlockedUsers(), loadChallenges()]);
      } catch (loadError) {
        if (active) setError(needsSocialMigrations(loadError)
          ? "Die Community-Funktionen sind in der Datenbank noch nicht eingerichtet. Bitte wende die Supabase-Migrationen an."
          : "Freundesdaten konnten nicht geladen werden. Bitte lade die Seite neu.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [getSupabase, loadBlockedUsers, loadChallenges, loadFriends]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void loadChallenges().catch((challengeError) => {
        console.error("Freundschaftsherausforderungen konnten nicht aktualisiert werden:", challengeError);
      });
    };
    const interval = window.setInterval(refresh, 10000);
    return () => window.clearInterval(interval);
  }, [loadChallenges, userId]);

  async function challengeFriend(friend: Person) {
    const control = ONLINE_TIME_CONTROLS.find((item) => item.id === challengeControlId);
    if (!control) return;
    setError("");
    try {
      const { error: challengeError } = await getSupabase().rpc("create_chess_challenge", {
        p_target_user_id: friend.id,
        p_initial_seconds: control.initialSeconds,
        p_increment_seconds: control.incrementSeconds,
      });
      if (challengeError) throw challengeError;
      setError(`Herausforderung an ${friend.username} gesendet (${control.label}).`);
      await loadChallenges();
    } catch (challengeError) {
      console.error("Schachherausforderung konnte nicht gesendet werden:", challengeError);
      setError(challengeError instanceof Error ? challengeError.message : "Herausforderung konnte nicht gesendet werden.");
    }
  }

  async function respondToChallenge(challenge: ChessChallenge, accept: boolean) {
    try {
      const { data, error: responseError } = await getSupabase().rpc("respond_chess_challenge", {
        p_challenge_id: challenge.challenge_id,
        p_accept: accept,
      });
      if (responseError) throw responseError;
      if (!accept) {
        setError("Herausforderung abgelehnt.");
        await loadChallenges();
        return;
      }
      const accepted = (data ?? [])[0] as {
        challenge_id: string;
        challenger_id: string;
        challenged_id: string;
        challenger_username: string;
        challenged_username: string;
        initial_seconds: number;
        increment_seconds: number;
      } | undefined;
      if (!accepted) throw new Error("Herausforderung angenommen, aber Partiedaten fehlen.");
      setChallenges((current) => current.filter((item) => item.challenge_id !== challenge.challenge_id));
      openChallenge(accepted);
    } catch (responseError) {
      console.error("Herausforderung konnte nicht beantwortet werden:", responseError);
      setError(responseError instanceof Error ? responseError.message : "Herausforderung konnte nicht beantwortet werden.");
    }
  }

  function openChallenge(challenge: {
    challenge_id: string;
    challenger_id: string;
    challenged_id: string;
    challenger_username: string;
    challenged_username: string;
    initial_seconds: number;
    increment_seconds: number;
  }) {
    if (!userId) return;
    const whiteId = `${challenge.challenge_id}_white`;
    const blackId = `${challenge.challenge_id}_black`;
    const white = userId === challenge.challenger_id;
    const params = new URLSearchParams({
      room: [whiteId, blackId].sort().join("_"),
      player: white ? whiteId : blackId,
      opponent: white ? blackId : whiteId,
      white: String(white),
      initial: String(challenge.initial_seconds),
      increment: String(challenge.increment_seconds),
      whiteName: challenge.challenger_username,
      blackName: challenge.challenged_username,
    });
    router.push("/online/partie?" + params.toString());
  }

  async function blockUser(person: Pick<Person, "id" | "username">) {
    if (!window.confirm(`${person.username} blockieren? Die Freundschaft wird entfernt und private Nachrichten werden für beide Konten gesperrt.`)) return;
    try {
      const { error: blockError } = await getSupabase().rpc("block_user", { p_user_id: person.id });
      if (blockError) throw blockError;
      if (activeFriend?.id === person.id) setActiveFriend(null);
      setError(`${person.username} wurde blockiert.`);
      await Promise.all([loadFriends(), loadBlockedUsers()]);
    } catch (blockError) {
      console.error("Nutzer konnte nicht blockiert werden:", blockError);
      setError("Nutzer konnte nicht blockiert werden. Wurde die Sicherheitsmigration angewendet?");
    }
  }

  async function unblockUser(user: BlockedUser) {
    try {
      const { error: unblockError } = await getSupabase().rpc("unblock_user", { p_user_id: user.user_id });
      if (unblockError) throw unblockError;
      setError(`${user.username} wurde entblockt. Eine entfernte Freundschaft muss neu angefragt werden.`);
      await loadBlockedUsers();
    } catch (unblockError) {
      console.error("Nutzer konnte nicht entblockt werden:", unblockError);
      setError("Blockierung konnte nicht aufgehoben werden.");
    }
  }

  useEffect(() => {
    if (!userId || !activeFriend || tab !== "friends") {
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        await loadMessages();
        if (active) setError("");
      } catch (loadError) {
        if (active) setError(needsSocialMigrations(loadError)
          ? "Die Chatfunktion ist in der Datenbank noch nicht eingerichtet. Bitte wende die Supabase-Migrationen an."
          : "Nachrichten konnten nicht geladen werden. Bitte versuche es erneut.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [activeFriend, loadMessages, tab, userId]);

  async function searchProfiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResults([]);
    const query = search.trim();
    if (query.length < 3) {
      setError("Gib mindestens drei Zeichen eines Spielernamens ein.");
      return;
    }
    setSearching(true);
    try {
      const { data, error: searchError } = await getSupabase().rpc("search_public_profiles", { p_query: query });
      if (searchError) throw searchError;
      setResults((data ?? []) as Person[]);
    } catch (searchError) {
      setError(needsSocialMigrations(searchError)
        ? "Die Spielersuche ist in der Datenbank noch nicht eingerichtet. Bitte wende die Supabase-Migrationen an."
        : "Spieler konnten nicht gesucht werden. Bitte prüfe den Benutzernamen und versuche es erneut.");
    } finally {
      setSearching(false);
    }
  }

  async function requestFriend(username: string) {
    try {
      const { error: requestError } = await getSupabase().rpc("request_friend", { p_username: username });
      if (requestError) {
        setError(requestError.message.includes("bereits eine Anfrage") ? "Für diesen Spieler besteht bereits eine Anfrage oder Freundschaft." : "Freundschaftsanfrage konnte nicht gesendet werden.");
        return;
      }
      setError(`Freundschaftsanfrage an ${username} gesendet.`);
      setResults((current) => current.filter((person) => person.username !== username));
      await loadFriends();
    } catch {
      setError("Freundschaftsanfrage konnte nicht gesendet werden. Bitte prüfe die Supabase-Migrationen und versuche es erneut.");
    }
  }

  async function respondToRequest(request: FriendRequest, accept: boolean) {
    const { error: responseError } = await getSupabase().rpc("respond_friend_request", { p_request_id: request.request_id, p_accept: accept });
    if (responseError) {
      setError("Die Freundschaftsanfrage konnte nicht aktualisiert werden.");
      return;
    }
    await loadFriends();
  }

  async function removeFriend(friend: Person) {
    const { error: removeError } = await getSupabase().rpc("remove_friend", { p_other_user_id: friend.id });
    if (removeError) {
      setError("Freund konnte nicht entfernt werden.");
      return;
    }
    if (activeFriend?.id === friend.id) setActiveFriend(null);
    await loadFriends();
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending || !userId) return;
    setSending(true);
    setError("");
    try {
      const supabase = getSupabase();
      const { error: sendError } = activeFriend
        ? await supabase.rpc("send_direct_message", { p_recipient_id: activeFriend.id, p_body: body })
        : { error: { message: "Wähle zuerst einen Freund aus." } };
      if (sendError) {
        setError(messageText(sendError, needsSocialMigrations(sendError)
          ? "Die Chatfunktion ist in der Datenbank noch nicht eingerichtet. Bitte wende die Supabase-Migrationen an."
          : "Nachricht konnte nicht gesendet werden."));
        return;
      }
      setDraft("");
      await loadMessages();
    } catch (sendError) {
      setError(needsSocialMigrations(sendError)
        ? "Die Chatfunktion ist in der Datenbank noch nicht eingerichtet. Bitte wende die Supabase-Migrationen an."
        : "Nachricht konnte nicht gesendet oder der Chat nicht aktualisiert werden. Bitte versuche es erneut.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300" role="status">Freunde werden geladen …</p>;
  if (!userId) return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-xl font-semibold">Melde dich an, um Freunde zu nutzen</h2><p className="mt-2 text-sm text-slate-400">Freundesliste und private Nachrichten sind an dein Konto gebunden.</p><Link href="/login" className="mt-4 inline-flex rounded-lg bg-emerald-400 px-4 py-2 font-semibold text-slate-950">Zum Login</Link></section>;

  const incomingRequests = requests.filter((request) => request.direction === "incoming");
  const incomingChallenges = challenges.filter((challenge) => challenge.challenged_id === userId && challenge.status === "pending").length;
  const currentMessageScope = activeFriend?.id ?? "";
  const visibleMessages = messageScope === currentMessageScope ? messages : [];

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2">
        <button type="button" onClick={() => setTab("friends")} className={`min-w-0 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === "friends" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Freunde {incomingRequests.length > 0 && `· ${incomingRequests.length} neu`}</button>
        <button type="button" onClick={() => setTab("challenges")} className={`min-w-0 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === "challenges" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Herausforderungen {incomingChallenges > 0 && `· ${incomingChallenges} neu`}</button>
      </div>

      {error && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{error}</p>}

      {tab === "friends" && (
        <div className={`grid min-w-0 gap-4 ${activeFriend ? "lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : ""}`}>
          <section className={`min-w-0 space-y-4 ${activeFriend ? "order-2 lg:order-1" : "order-1"}`}>
            <form onSubmit={searchProfiles} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <h2 className="font-semibold">Spieler finden</h2>
              <label htmlFor="player-search" className="sr-only">Nach Spielernamen suchen</label>
              <div className="mt-3 flex gap-2">
                <input id="player-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={20} placeholder="Benutzername" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-400" />
                <button type="submit" disabled={searching} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">{searching ? "Sucht …" : "Suchen"}</button>
              </div>
              {results.length > 0 && <ul className="mt-3 space-y-2">{results.map((person) => <li key={person.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-slate-800/70 p-2"><Link href={`/profile/${encodeURIComponent(person.username)}`} className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto"><Avatar person={person} userId={person.id} size="h-8 w-8" /><span className="truncate text-sm">{person.username}</span></Link><button type="button" onClick={() => void requestFriend(person.username)} className="rounded-md bg-emerald-400 px-2 py-1 text-xs font-semibold text-slate-950">Hinzufügen</button><button type="button" onClick={() => void blockUser(person)} className="rounded-md border border-rose-900 px-2 py-1 text-xs text-rose-300">Blockieren</button></li>)}</ul>}
              {!searching && !error && search.trim().length >= 3 && results.length === 0 && <p className="mt-3 text-sm text-slate-500">Keine Spieler gefunden.</p>}
            </form>

            <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <h2 className="font-semibold">Freundschaftsanfragen</h2>
              {requests.length === 0 ? <p className="mt-3 text-sm text-slate-500">Keine offenen Anfragen.</p> : <ul className="mt-3 space-y-3">{requests.map((request) => <li key={request.request_id} className="flex min-w-0 flex-wrap items-center gap-2"><Link href={`/profile/${encodeURIComponent(request.username)}`} className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto"><Avatar person={request} userId={request.user_id} size="h-8 w-8" /><span className="truncate text-sm">{request.username}</span></Link>{request.direction === "incoming" ? <><button type="button" onClick={() => void respondToRequest(request, true)} className="rounded-md bg-emerald-400 px-2 py-1 text-xs font-semibold text-slate-950">Annehmen</button><button type="button" onClick={() => void respondToRequest(request, false)} className="rounded-md border border-slate-700 px-2 py-1 text-xs">Ablehnen</button></> : <span className="text-xs text-slate-500">Ausstehend</span>}</li>)}</ul>}
            </section>

            <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <h2 className="font-semibold">Deine Freunde</h2>
              {friends.length === 0 ? <p className="mt-3 text-sm text-slate-500">Noch keine Freunde – suche nach einem Spielernamen.</p> : <ul className="mt-3 space-y-2">{friends.map((friend) => <li key={friend.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg p-2 hover:bg-slate-800/60">
                <Link href={`/profile/${encodeURIComponent(friend.username)}`} className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto" aria-label={`Profil von ${friend.username} öffnen`}>
                  <Avatar person={friend} userId={friend.id} size="h-8 w-8" />
                  <span className="truncate text-sm">{friend.username}</span>
                </Link>
                {unreadByFriend[friend.id] && <span aria-label={`${unreadByFriend[friend.id].unread_count} ungelesene Nachrichten`} className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{unreadByFriend[friend.id].unread_count}</span>}
                <button type="button" onClick={() => { setActiveFriend(friend); setTab("friends"); }} className={`rounded-md px-2 py-1 text-xs font-medium ${activeFriend?.id === friend.id ? "bg-emerald-400 text-slate-950" : "border border-slate-700 text-slate-300 hover:bg-slate-800"}`}>Chat</button>
                <button type="button" onClick={() => void removeFriend(friend)} aria-label={`${friend.username} als Freund entfernen`} className="px-2 text-xs text-slate-500 hover:text-rose-300">Entfernen</button>
                <button type="button" onClick={() => void blockUser(friend)} aria-label={`${friend.username} blockieren`} className="px-2 text-xs text-rose-300 hover:text-rose-200">Blockieren</button>
              </li>)}</ul>}
            </section>
            <section className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
              <h2 className="font-semibold">Blockierte Nutzer</h2>
              {blockedUsers.length === 0 ? <p className="mt-3 text-sm text-slate-500">Keine Nutzer blockiert.</p> : <ul className="mt-3 space-y-2">{blockedUsers.map((person) => <li key={person.user_id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 p-2"><span className="truncate text-sm">{person.username}</span><button type="button" onClick={() => void unblockUser(person)} className="shrink-0 text-xs text-emerald-300 underline">Entblocken</button></li>)}</ul>}
            </section>
          </section>

          {activeFriend && <div className="order-1 min-w-0 lg:order-2">
            <ChatPanel
              title={`Chat mit ${activeFriend.username}`}
              messages={visibleMessages}
              userId={userId}
              draft={draft}
              onDraft={setDraft}
              onSubmit={sendMessage}
              sending={sending}
              maxLength={2000}
              emptyText="Schreib deinem Freund eine Nachricht."
              onBack={() => setActiveFriend(null)}
            />
          </div>}
        </div>
      )}

      {tab === "challenges" && (
        <section className="grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Herausforderungen</h2>
                <p className="mt-1 text-xs text-slate-400">Ungewertet · Zeitkontrolle wählen</p>
              </div>
              <SelectMenu compact aria-label="Bedenkzeit für Herausforderungen" value={challengeControlId} options={ONLINE_TIME_CONTROLS.map((control) => ({ value: control.id, label: control.label }))} onChange={setChallengeControlId} />
            </div>
            {friends.length === 0 ? <p className="mt-4 text-sm text-slate-500">Füge zuerst Freunde hinzu.</p> : <ul className="mt-3 space-y-2">{friends.map((friend) => <li key={friend.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-slate-800/60 p-2">
              <Link href={`/profile/${encodeURIComponent(friend.username)}`} className="flex min-w-0 flex-1 items-center gap-2"><Avatar person={friend} userId={friend.id} size="h-8 w-8" /><span className="truncate text-sm">{friend.username}</span></Link>
              <button type="button" onClick={() => void challengeFriend(friend)} className="shrink-0 rounded-md border border-emerald-400/40 px-2.5 py-1.5 text-xs font-medium text-emerald-200">Herausfordern</button>
            </li>)}</ul>}
          </div>
          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Offene Partien</h2>
              <button type="button" onClick={() => void loadChallenges()} className="shrink-0 text-xs text-slate-400 underline">Aktualisieren</button>
            </div>
            {challenges.length === 0 ? <p className="mt-3 text-sm text-slate-500">Keine offenen Herausforderungen.</p> : <ul className="mt-3 space-y-2">{challenges.map((challenge) => {
              const incoming = challenge.challenged_id === userId;
              const otherName = incoming ? challenge.challenger_username : challenge.challenged_username;
              return <li key={challenge.challenge_id} className="min-w-0 rounded-lg bg-slate-800/70 p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><span className="min-w-0 break-words text-sm font-medium">{incoming ? "Von " : "An "}{otherName} · {Math.floor(challenge.initial_seconds / 60)}+{challenge.increment_seconds}</span><span className="shrink-0 text-[10px] text-slate-400">{challenge.status === "accepted" ? "Angenommen" : "Ausstehend"}</span></div>
                {challenge.status === "pending" && incoming && <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void respondToChallenge(challenge, true)} className="rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950">Annehmen & spielen</button><button type="button" onClick={() => void respondToChallenge(challenge, false)} className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Ablehnen</button></div>}
                {challenge.status === "accepted" && <button type="button" onClick={() => openChallenge(challenge)} className="mt-2 rounded-md bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950">Partie öffnen</button>}
              </li>;
            })}</ul>}
          </div>
        </section>
      )}
    </div>
  );
}

function ChatPanel({
  title, messages, userId, draft, onDraft, onSubmit, sending, maxLength, emptyText, onBack,
}: {
  title: string;
  messages: ChatMessage[];
  userId: string;
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  sending: boolean;
  maxLength: number;
  emptyText: string;
  onBack: () => void;
}) {
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [reportFeedback, setReportFeedback] = useState("");
  const [reportedIds, setReportedIds] = useState<string[]>([]);
  async function reportMessage(messageId: string) {
    const reason = reportReason.trim();
    if (reason.length < 5) {
      setReportFeedback("Bitte beschreibe den Grund mit mindestens fünf Zeichen.");
      return;
    }
    const { error } = await createClient().rpc("report_chat_message", {
      p_chat_type: "direct",
      p_message_id: messageId,
      p_reason: reason,
    });
    if (error) {
      setReportFeedback(error.message.includes("bereits gemeldet") ? "Diese Nachricht wurde bereits gemeldet." : "Die Meldung konnte nicht gesendet werden.");
      return;
    }
    setReportedIds((current) => [...current, messageId]);
    setReportingMessageId(null);
    setReportReason("");
    setReportFeedback("Danke. Deine Meldung wurde an die Moderation weitergeleitet.");
  }

  return (
    <section className="flex min-h-[32rem] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onBack} className="text-xs text-slate-400 underline underline-offset-4">Alle Freunde</button>
        <span className="text-xs text-slate-500">Private Nachrichten</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
        {messages.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p> : messages.map((message) => (
          <article key={message.id} className={`flex gap-2 ${message.sender_id === userId ? "flex-row-reverse" : ""}`}>
            <Link href={`/profile/${encodeURIComponent(message.username)}`} aria-label={`Profil von ${message.username}`}>
              <Avatar person={{ username: message.username, avatar_url: message.avatar_url }} userId={message.sender_id} size="h-8 w-8" />
            </Link>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 ${message.sender_id === userId ? "bg-emerald-950/60 text-emerald-50" : "bg-slate-800 text-slate-200"}`}>
              <div className="mb-1 flex items-baseline gap-2"><Link href={`/profile/${encodeURIComponent(message.username)}`} className="text-xs font-semibold hover:underline">{message.username}</Link><time dateTime={message.created_at} className="text-[10px] text-slate-500">{new Date(message.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time></div>
              <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
              {message.sender_id !== userId && !reportedIds.includes(message.id) && <button type="button" onClick={() => { setReportingMessageId(reportingMessageId === message.id ? null : message.id); setReportFeedback(""); }} className="mt-2 text-[10px] text-slate-400 underline underline-offset-2 hover:text-amber-300">Melden</button>}
              {reportingMessageId === message.id && <form onSubmit={(event) => { event.preventDefault(); void reportMessage(message.id); }} className="mt-2 space-y-2">
                <label className="sr-only" htmlFor={`report-${message.id}`}>Grund der Meldung</label>
                <textarea id={`report-${message.id}`} value={reportReason} onChange={(event) => setReportReason(event.target.value)} minLength={5} maxLength={500} rows={2} placeholder="Warum meldest du diese Nachricht?" className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-xs" />
                <div className="flex gap-2"><button type="submit" className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-slate-950">Meldung senden</button><button type="button" onClick={() => setReportingMessageId(null)} className="text-xs text-slate-400 underline">Abbrechen</button></div>
              </form>}
            </div>
          </article>
        ))}
      </div>
      {reportFeedback && <p role="status" className="border-t border-slate-800 py-2 text-xs text-slate-300">{reportFeedback}</p>}
      <form onSubmit={onSubmit} className="border-t border-slate-800 pt-3">
        <label htmlFor={`message-${title}`} className="sr-only">Nachricht schreiben</label>
        <textarea id={`message-${title}`} value={draft} onChange={(event) => onDraft(event.target.value)} maxLength={maxLength} rows={2} placeholder="Nachricht schreiben …" className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm outline-none focus:border-emerald-400" />
        <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Max. {maxLength} Zeichen</span><button type="submit" disabled={sending || !draft.trim()} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50">{sending ? "Wird gesendet …" : "Senden"}</button></div>
      </form>
    </section>
  );
}
