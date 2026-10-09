"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { SelectMenu } from "@/components/select-menu";
import { createClient } from "@/lib/supabase/client";

type TicketStatus = "open" | "in_progress" | "resolved";
type SupportTicket = {
  ticket_id: string;
  category: "problem" | "suggestion" | "other";
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
};
type SupportMessage = {
  message_id: string;
  sender_id: string;
  sender_username: string;
  body: string;
  created_at: string;
};

function statusLabel(status: TicketStatus) {
  if (status === "in_progress") return "In Bearbeitung";
  if (status === "resolved") return "Erledigt";
  return "Offen";
}

function categoryLabel(category: SupportTicket["category"]) {
  if (category === "problem") return "Problem";
  if (category === "suggestion") return "Verbesserung";
  return "Sonstiges";
}

export function SupportCenter() {
  const [userId, setUserId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [category, setCategory] = useState<SupportTicket["category"]>("problem");
  const [subject, setSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getClient = useCallback(() => {
    if (!clientRef.current) clientRef.current = createClient();
    return clientRef.current;
  }, []);

  const loadTickets = useCallback(async () => {
    const { data, error: queryError } = await getClient().rpc("support_list_my_tickets");
    if (queryError) throw queryError;
    const nextTickets = (data ?? []) as SupportTicket[];
    setTickets(nextTickets);
    return nextTickets;
  }, [getClient]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: queryError } = await getClient().rpc("support_list_ticket_messages", {
      p_ticket_id: ticketId,
    });
    if (queryError) throw queryError;
    setMessages((data ?? []) as SupportMessage[]);
  }, [getClient]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data: { user }, error: authError } = await getClient().auth.getUser();
          if (authError) throw authError;
          if (!active) return;
          setUserId(user?.id ?? null);
          if (!user) return;
          const nextTickets = await loadTickets();
          if (!active) return;
          if (nextTickets[0]) {
            setSelectedTicketId(nextTickets[0].ticket_id);
            await loadMessages(nextTickets[0].ticket_id);
          }
        } catch (loadError) {
          console.error("Supportanfragen konnten nicht geladen werden:", loadError);
          if (active) setError("Supportdaten konnten nicht geladen werden. Bitte versuche es erneut.");
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [getClient, loadMessages, loadTickets]);

  async function refreshTickets(preferredTicketId?: string) {
    setError("");
    try {
      const nextTickets = await loadTickets();
      const nextId = preferredTicketId ?? selectedTicketId;
      if (nextId && nextTickets.some((ticket) => ticket.ticket_id === nextId)) {
        setSelectedTicketId(nextId);
        await loadMessages(nextId);
      } else if (nextTickets[0]) {
        setSelectedTicketId(nextTickets[0].ticket_id);
        await loadMessages(nextTickets[0].ticket_id);
      } else {
        setSelectedTicketId(null);
        setMessages([]);
      }
    } catch (loadError) {
      console.error("Supportanfragen konnten nicht aktualisiert werden:", loadError);
      setError("Supportanfragen konnten nicht aktualisiert werden.");
    }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const { data: ticketId, error: createError } = await getClient().rpc("support_create_ticket", {
        p_category: category,
        p_subject: subject,
        p_message: newMessage,
      });
      if (createError) throw createError;
      setSubject("");
      setNewMessage("");
      await refreshTickets(ticketId as string);
    } catch (createError) {
      console.error("Supportanfrage konnte nicht gesendet werden:", createError);
      setError("Supportanfrage konnte nicht gesendet werden. Bitte melde dich an und versuche es erneut.");
    } finally {
      setSending(false);
    }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicketId) return;
    setSending(true);
    setError("");
    try {
      const { error: replyError } = await getClient().rpc("support_reply", {
        p_ticket_id: selectedTicketId,
        p_message: reply,
      });
      if (replyError) throw replyError;
      setReply("");
      await refreshTickets(selectedTicketId);
    } catch (replyError) {
      console.error("Antwort im Supportverlauf konnte nicht gesendet werden:", replyError);
      setError("Antwort konnte nicht gesendet werden. Bitte versuche es erneut.");
    } finally {
      setSending(false);
    }
  }

  async function selectTicket(ticketId: string) {
    setSelectedTicketId(ticketId);
    setError("");
    try {
      await loadMessages(ticketId);
    } catch (loadError) {
      console.error("Supportverlauf konnte nicht geladen werden:", loadError);
      setError("Der Supportverlauf konnte nicht geladen werden.");
    }
  }

  if (loading) {
    return <p role="status" className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Support wird geladen …</p>;
  }
  if (!userId) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
        <p>Bitte melde dich an, um privat mit dem Support zu schreiben.</p>
        <Link href="/login" className="mt-3 inline-block font-semibold text-emerald-300 underline underline-offset-4">Zum Login</Link>
      </section>
    );
  }

  const selectedTicket = tickets.find((ticket) => ticket.ticket_id === selectedTicketId);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.4fr)]">
      <div className="space-y-5">
        <form onSubmit={(event) => void createTicket(event)} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Neue Supportanfrage</h2>
          <p className="text-xs leading-5 text-slate-400">Nur du und das zuständige Admin-Team können diese Anfrage und den Verlauf lesen.</p>
          <label className="block text-sm">Thema
            <SelectMenu className="mt-1" aria-label="Thema" value={category} options={[
              { value: "problem", label: "Problem melden" },
              { value: "suggestion", label: "Verbesserung vorschlagen" },
              { value: "other", label: "Sonstiges" },
            ]} onChange={(value) => setCategory(value as SupportTicket["category"])} />
          </label>
          <label className="block text-sm">Betreff
            <input required minLength={3} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
          </label>
          <label className="block text-sm">Nachricht
            <textarea required minLength={10} maxLength={5000} rows={5} value={newMessage} onChange={(event) => setNewMessage(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />
          </label>
          <button type="submit" disabled={sending} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{sending ? "Wird gesendet …" : "Privat senden"}</button>
        </form>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Deine Anfragen</h2>
            <button type="button" onClick={() => void refreshTickets()} disabled={sending} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">Aktualisieren</button>
          </div>
          <div className="mt-3 space-y-2">
            {tickets.map((ticket) => (
              <button key={ticket.ticket_id} type="button" onClick={() => void selectTicket(ticket.ticket_id)} aria-pressed={selectedTicketId === ticket.ticket_id} className={`block w-full rounded-xl border p-3 text-left ${selectedTicketId === ticket.ticket_id ? "border-emerald-400/60 bg-slate-950" : "border-slate-800 hover:bg-slate-950"}`}>
                <span className="block truncate text-sm font-semibold">{ticket.subject}</span>
                <span className="mt-1 block text-xs text-slate-400">{categoryLabel(ticket.category)} · {statusLabel(ticket.status)}</span>
              </button>
            ))}
            {tickets.length === 0 && <p className="text-sm text-slate-400">Du hast noch keine Supportanfragen.</p>}
          </div>
        </section>
      </div>

      <section className="flex min-h-[28rem] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
        {selectedTicket ? <>
          <div className="border-b border-slate-800 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{categoryLabel(selectedTicket.category)} · {statusLabel(selectedTicket.status)}</p>
            <h2 className="mt-1 text-xl font-semibold">{selectedTicket.subject}</h2>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto py-4">
            {messages.map((item) => (
              <article key={item.message_id} className={`max-w-[90%] rounded-xl p-3 ${item.sender_id === userId ? "ml-auto bg-emerald-950/70 text-emerald-50" : "bg-slate-800 text-slate-100"}`}>
                <p className="mb-1 text-xs font-semibold">{item.sender_id === userId ? "Du" : "Support · " + item.sender_username}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
                <time dateTime={item.created_at} className="mt-2 block text-right text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString("de-DE")}</time>
              </article>
            ))}
          </div>
          <form onSubmit={(event) => void sendReply(event)} className="border-t border-slate-800 pt-4">
            <label htmlFor="support-reply" className="sr-only">Antwort schreiben</label>
            <textarea id="support-reply" required maxLength={5000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Weitere Nachricht …" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm" />
            <button type="submit" disabled={sending} className="mt-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Antwort senden</button>
          </form>
        </> : <div className="flex flex-1 items-center justify-center text-center text-sm text-slate-400">Wähle eine Anfrage aus oder erstelle eine neue.</div>}
      </section>
      {error && <p role="alert" className="lg:col-span-2 rounded-xl border border-rose-400/30 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>}
    </div>
  );
}
