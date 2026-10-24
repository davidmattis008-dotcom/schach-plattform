"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ClubMessage = { id: string; sender_id: string; username: string; body: string; created_at: string };
type ClubNewsItem = { id: string; title: string; body: string; username: string; created_at: string };
type CommunicationTab = "chat" | "news";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function ClubCommunication({ clubId, canPublishNews }: { clubId: string; canPublishNews: boolean }) {
  const [tab, setTab] = useState<CommunicationTab>("chat");
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [news, setNews] = useState<ClubNewsItem[]>([]);
  const [draft, setDraft] = useState("");
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const refresh = async () => {
      try {
        if (tab === "chat") {
          const { data, error: queryError } = await supabase.rpc("list_my_chess_club_messages", { p_club_id: clubId });
          if (queryError) throw queryError;
          if (active) setMessages((data ?? []) as ClubMessage[]);
        } else {
          const { data, error: queryError } = await supabase.rpc("list_my_chess_club_news", { p_club_id: clubId });
          if (queryError) throw queryError;
          if (active) setNews((data ?? []) as ClubNewsItem[]);
        }
        if (active) setError("");
      } catch (loadError) {
        console.error("Vereinskommunikation konnte nicht geladen werden:", loadError);
        if (active) setError("Vereinskommunikation konnte nicht geladen werden. Prüfe die Supabase-Migrationen.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [clubId, tab]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const { error: sendError } = await createClient().rpc("send_chess_club_message", { p_club_id: clubId, p_body: body });
      if (sendError) throw sendError;
      setDraft("");
      const { data, error: queryError } = await createClient().rpc("list_my_chess_club_messages", { p_club_id: clubId });
      if (queryError) throw queryError;
      setMessages((data ?? []) as ClubMessage[]);
    } catch (sendError) {
      console.error("Nachricht im Vereinschat konnte nicht gesendet werden:", sendError);
      setError(sendError instanceof Error ? sendError.message : "Nachricht konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  async function publishNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublishNews || sending) return;
    setSending(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: publishError } = await supabase.rpc("publish_chess_club_news", {
        p_club_id: clubId,
        p_title: newsTitle,
        p_body: newsBody,
      });
      if (publishError) throw publishError;
      setNewsTitle("");
      setNewsBody("");
      const { data, error: queryError } = await supabase.rpc("list_my_chess_club_news", { p_club_id: clubId });
      if (queryError) throw queryError;
      setNews((data ?? []) as ClubNewsItem[]);
    } catch (publishError) {
      console.error("Vereinsneuigkeit konnte nicht veröffentlicht werden:", publishError);
      setError(publishError instanceof Error ? publishError.message : "Neuigkeit konnte nicht veröffentlicht werden.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-5" aria-label="Vereinskommunikation">
      <div className="flex gap-2">
        <button type="button" onClick={() => setTab("chat")} aria-pressed={tab === "chat"} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "chat" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Vereinschat</button>
        <button type="button" onClick={() => setTab("news")} aria-pressed={tab === "news"} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "news" ? "bg-emerald-400 text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>Neuigkeiten</button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}

      {tab === "chat" ? (
        <>
          <div className="max-h-96 min-h-32 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3" aria-live="polite">
            {messages.length ? messages.map((message) => (
              <article key={message.id} className="rounded-lg bg-slate-900 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span className="font-semibold text-emerald-200">{message.username}</span><time>{dateLabel(message.created_at)}</time></div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{message.body}</p>
              </article>
            )) : <p className="py-8 text-center text-sm text-slate-500">Noch keine Nachrichten</p>}
          </div>
          <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2">
            <label htmlFor="club-chat-message" className="sr-only">Nachricht</label>
            <input id="club-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={500} required placeholder="Nachricht" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
            <button type="submit" disabled={sending || !draft.trim()} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{sending ? "…" : "Senden"}</button>
          </form>
        </>
      ) : (
        <>
          {canPublishNews && <form onSubmit={(event) => void publishNews(event)} className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
            <label htmlFor="club-news-title" className="sr-only">Titel</label>
            <input id="club-news-title" value={newsTitle} onChange={(event) => setNewsTitle(event.target.value)} minLength={1} maxLength={120} required placeholder="Titel" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm" />
            <label htmlFor="club-news-body" className="sr-only">Neuigkeit</label>
            <textarea id="club-news-body" value={newsBody} onChange={(event) => setNewsBody(event.target.value)} minLength={1} maxLength={2000} required rows={3} placeholder="Neuigkeit" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm" />
            <button type="submit" disabled={sending || !newsTitle.trim() || !newsBody.trim()} className="rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{sending ? "…" : "Veröffentlichen"}</button>
          </form>}
          <div className="space-y-3">
            {news.length ? news.map((item) => (
              <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-white">{item.title}</h3><time className="text-xs text-slate-500">{dateLabel(item.created_at)}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{item.body}</p>
                <p className="mt-3 text-xs text-slate-500">{item.username}</p>
              </article>
            )) : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">Keine Neuigkeiten</p>}
          </div>
        </>
      )}
    </section>
  );
}
