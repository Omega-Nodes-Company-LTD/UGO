"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReceptionTicket } from "@ugo/shared";
import { ApiError, call } from "../../../lib/api";
import { STATUS_LABEL } from "../../../lib/labels";

/**
 * Il dettaglio del ticket: la richiesta, la sua storia, e la possibilità di
 * rispondere. Rispondere a un ticket chiuso lo riapre «in attesa» (ADR-052):
 * l'ultima parola è del cliente.
 */

interface TicketDetail {
  id: string;
  status: ReceptionTicket["status"];
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  messages: { role: string; text: string; ts: string }[];
}

export default function Ticket(): React.JSX.Element {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback((): void => {
    call<TicketDetail>(`/tickets/${params.id}`)
      .then(setTicket)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
        else router.push("/ticket");
      });
  }, [params.id, router]);

  useEffect(load, [load]);

  const send = async (): Promise<void> => {
    if (reply.trim() === "") return;
    try {
      await call(`/tickets/${params.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: reply.trim() }),
      });
      setReply("");
      setNote(ticket?.status === "closed" ? "Riaperto: lo studio lo rivedrà." : "Aggiunto.");
      load();
    } catch {
      setNote("Non sono riuscito ad aggiungere la risposta, riprova.");
    }
  };

  if (ticket === null) return <p className="lede">…</p>;
  return (
    <div>
      <p className="eyebrow">Ticket · {STATUS_LABEL[ticket.status]}</p>
      <h1>{ticket.title}</h1>
      <p className="lede">
        aperto il {ticket.createdAt.slice(0, 10)} · ultimo movimento {ticket.updatedAt.slice(0, 10)}
      </p>
      <div className="card" data-testid="ticket-body">
        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{ticket.body}</p>
      </div>
      <div className="thread" data-testid="thread">
        {ticket.messages.map((message, index) => (
          <div key={index} className={`bubble ${message.role === "user" ? "me" : "ugo"}`}>
            {message.text}
          </div>
        ))}
      </div>
      <div className="composer">
        <input
          type="text"
          data-testid="ticket-reply"
          placeholder="Aggiungi qualcosa alla richiesta…"
          value={reply}
          onChange={(event) => {
            setReply(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send();
          }}
        />
        <button data-testid="ticket-reply-go" onClick={() => void send()}>
          Manda
        </button>
      </div>
      {note !== "" && <div className="msg ok">{note}</div>}
    </div>
  );
}
