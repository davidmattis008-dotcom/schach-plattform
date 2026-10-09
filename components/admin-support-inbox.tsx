"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { SelectMenu } from "@/components/select-menu";

type TicketStatus = "open" | "in_progress" | "resolved";
type TicketFilter = TicketStatus | "all";
type SupportTicket = {
  ticket_id: string;
  user_id: string;
  username: string;
  category: "problem" | "suggestion" | "other";
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  latest_message: string | null;
  latest_message_at: string | null;
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

export function AdminSupportInbox() {
  const [filter, setFilter] = useState<TicketFilter>("open");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
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
    const { data, error: queryError } = await getClient().rpc("admin_list_support_tickets", {
      p_status: filter,
    });
    if (queryError) throw queryError;
    return (data ?? []) as SupportTicket[];
  }, [filter, getClient]);

  const loadMessages = useCallback(async (ticketId: string) => {
    const { data, error: queryError } = await getClient().rpc("support_list_ticket_messages", {
      p_ticket_id: ticketId,
    });
    if (queryError) throw queryError;
    setMessages((data ?? []) as SupportMessage[]);
  }, [getClient]);

  const refreshList = useCallback(async (preferredTicketId?: string) => {
    const nextTickets = await loadTickets();
    setTickets(nextTickets);
    const nextId = preferredTicketId && nextTickets.some((ticket) => ticket.ticket_id === preferredTicketId)
      ? preferredTicketId
      : nextTickets[0]?.ticket_id ?? null;
    setSelectedTicketId(nextId);
    if (nextId) await loadMessages(nextId);
    else setMessages([]);
  }, [loadMessages, loadTickets]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshList().catch((loadError) => {
        console.error("Support-Posteingang konnte nicht geladen werden:", loadError);
        if (active) setError("Supportanfragen konnten nicht geladen werden.");
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refreshList]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      await refreshList(selectedTicketId ?? undefined);
    } catch (loadError) {
      console.error("Support-Posteingang konnte nicht aktualisiert werden:", loadError);
      setError("Supportanfragen konnten nicht aktualisiert werden.");
    } finally {
      setLoading(false);
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
      await refreshList(selectedTicketId);
    } catch (replyError) {
      console.error("Supportantwort konnte nicht gesendet werden:", replyError);
      setError("Antwort konnte nicht gesendet werden.");
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(ticketId: string, status: TicketStatus) {
    setSending(true);
    setError("");
    try {
      const { error: statusError } = await getClient().rpc("support_set_ticket_status", {
        p_ticket_id: ticketId,
        p_status: status,
      });
      if (statusError) throw statusError;
      await refreshList(ticketId);
    } catch (statusError) {
      console.error("Supportstatus konnte nicht geändert werden:", statusError);
      setError("Supportstatus konnte nicht geändert werden.");
    } finally {
      setSending(false);
    }
  }

  const selectedTicket = tickets.find((ticket) => ticket.ticket_id === selectedTicketId);
  return (
    <section className="mt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Private Supportanfragen</h2>
          <p className="mt-1 text-xs text-slate-400">Nur Owner und Admins können diese Nachrichten lesen.</p>
        </div>
        <div className="flex gap-2">
          <SelectMenu compact aria-label="Supportstatus filtern" value={filter} options={[
            { value: "open", label: "Offen" },
            { value: "in_progress", label: "In Bearbeitung" },
            { value: "resolved", label: "Erledigt" },
            { value: "all", label: "Alle" },
          ]} onChange={(value) => setFilter(value as TicketFilter)} />
          <button type="button" onClick={() => void refresh()} disabled={loading || sending} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50">Aktualisieren</button>
        </div>
      </div>
      {loading && <p role="status" className="mb-3 text-sm text-slate-400">Supportanfragen werden geladen …</p>}
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose-400/30 bg-rose-950/20 p-3 text-sm text-rose-200">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.5fr)]">
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {tickets.map((ticket) => (
            <button key={ticket.ticket_id} type="button" onClick={() => void selectTicket(ticket.ticket_id)} aria-pressed={selectedTicketId === ticket.ticket_id} className={`block w-full rounded-xl border p-3 text-left ${selectedTicketId === ticket.ticket_id ? "border-emerald-400/60 bg-slate-900" : "border-slate-800 bg-slate-900/60 hover:bg-slate-900"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{ticket.subject}</span>
                <span className="shrink-0 text-[10px] text-emerald-300">{statusLabel(ticket.status)}</span>
              </span>
              <span className="mt-1 block text-xs text-slate-400">{categoryLabel(ticket.category)} · {ticket.username}</span>
              {ticket.latest_message && <span className="mt-2 block truncate text-xs text-slate-500">{ticket.latest_message}</span>}
              <time className="mt-2 block text-[10px] text-slate-500" dateTime={ticket.updated_at}>{new Date(ticket.updated_at).toLocaleString("de-DE")}</time>
            </button>
          ))}
          {!loading && tickets.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">Keine Anfragen in diesem Status.</p>}
        </div>

        <div className="flex min-h-[28rem] flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4">
          {selectedTicket ? <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">{categoryLabel(selectedTicket.category)} · {selectedTicket.username}</p>
                <h3 className="mt-1 text-xl font-semibold">{selectedTicket.subject}</h3>
              </div>
              <label className="text-xs text-slate-400">Status
                <SelectMenu compact className="mt-1" aria-label="Status der Supportanfrage" value={selectedTicket.status} disabled={sending} options={[
                  { value: "open", label: "Offen" },
                  { value: "in_progress", label: "In Bearbeitung" },
                  { value: "resolved", label: "Erledigt" },
                ]} onChange={(value) => void changeStatus(selectedTicket.ticket_id, value as TicketStatus)} />
              </label>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto py-4">
              {messages.map((item) => (
                <article key={item.message_id} className={`max-w-[90%] rounded-xl p-3 ${item.sender_id === selectedTicket.user_id ? "bg-slate-800 text-slate-100" : "ml-auto bg-emerald-950/70 text-emerald-50"}`}>
                  <p className="mb-1 text-xs font-semibold">{item.sender_id === selectedTicket.user_id ? selectedTicket.username : "Admin · " + item.sender_username}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>
                  <time dateTime={item.created_at} className="mt-2 block text-right text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString("de-DE")}</time>
                </article>
              ))}
            </div>
            <form onSubmit={(event) => void sendReply(event)} className="border-t border-slate-800 pt-4">
              <label htmlFor="admin-support-reply" className="sr-only">Antwort an den Nutzer schreiben</label>
              <textarea id="admin-support-reply" required maxLength={5000} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Private Antwort an den Nutzer …" className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm" />
              <button type="submit" disabled={sending} className="mt-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">Antwort senden</button>
            </form>
          </> : <div className="flex flex-1 items-center justify-center text-center text-sm text-slate-400">Wähle eine Supportanfrage aus.</div>}
        </div>
      </div>
    </section>
  );
}
