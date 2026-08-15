"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceptionTicket } from "@ugo/shared";
import { ApiError, call } from "../../lib/api";
import { STATUS_LABEL } from "../../lib/labels";

/**
 * I ticket (ADR-052): le richieste raccolte, con lo stato che lo studio
 * aggiorna. Si aprono parlando («apri un ticket: …») o da qui, con la
 * conferma esplicita — mai di nascosto.
 */

export default function Tickets(): React.JSX.Element {
  const router = useRouter();
  const [tickets, setTickets] = useState<ReceptionTicket[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call<{ tickets: ReceptionTicket[] }>("/tickets")
      .then((body) => {
        setTickets(body.tickets.reverse());
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
        else setError("Non riesco a leggere i ticket, riprova fra poco.");
      });
  }, [router]);

  return (
    <div>
      <p className="eyebrow">La reception</p>
      <h1>I ticket</h1>
      <p className="lede">
        Le tue richieste, nero su bianco. Per aprirne uno di' al gosino «apri un ticket: …»,
        oppure scriviglielo in Parla: te lo riassume e lo apre con la tua conferma.
      </p>
      {error !== "" && <div className="msg err">{error}</div>}
      {tickets !== null && tickets.length === 0 && (
        <div className="card">
          <p className="lede" style={{ margin: 0 }}>
            Nessuna richiesta per ora. Quando vorrai aggiungere o cambiare qualcosa, il gosino la
            scrive qui.
          </p>
        </div>
      )}
      {tickets?.map((ticket) => (
        <Link
          key={ticket.id}
          href={`/ticket/${ticket.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="card" style={{ marginBottom: "0.8rem" }} data-testid="ticket-card">
            <strong>{ticket.title}</strong>
            <p className="lede" style={{ margin: "0.3rem 0 0" }}>
              {STATUS_LABEL[ticket.status]} · aperto il {ticket.createdAt.slice(0, 10)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
