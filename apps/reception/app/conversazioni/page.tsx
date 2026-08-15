"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceptionMe } from "@ugo/shared";
import { ApiError, call } from "../../lib/api";

/**
 * Le conversazioni: lo storico per gosino, con la ricerca sul caricato.
 * Ognuno ricorda le sue — cambiare gosino cambia il filo.
 */

interface HistoryMessage {
  id: string;
  gosinoId: string;
  ts: string;
  role: string;
  text: string;
  cached: boolean;
}

export default function Conversazioni(): React.JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<ReceptionMe | null>(null);
  const [gosino, setGosino] = useState("");
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    call<ReceptionMe>("/me")
      .then((body) => {
        setMe(body);
        setGosino((current) => current !== "" ? current : (body.gosini[0]?.id ?? ""));
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
      });
  }, [router]);

  useEffect(() => {
    if (gosino === "") return;
    call<{ messages: HistoryMessage[] }>(`/messages?gosino=${encodeURIComponent(gosino)}&limit=100`)
      .then((body) => {
        setMessages(body.messages);
      })
      .catch(() => {
        setMessages([]);
      });
  }, [gosino]);

  const visible = messages.filter(
    (message) => filter === "" || message.text.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div>
      <p className="eyebrow">La reception</p>
      <h1>Le conversazioni</h1>
      <div className="chips" style={{ justifyContent: "flex-start", margin: "0.6rem 0" }}>
        {me?.gosini.map((candidate) => (
          <button
            key={candidate.id}
            style={candidate.id === gosino ? { borderColor: "var(--accent)" } : undefined}
            onClick={() => {
              setGosino(candidate.id);
            }}
          >
            {candidate.name}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Cerca in quello che vi siete detti…"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value);
        }}
      />
      <div className="thread" data-testid="history">
        {visible.map((message) => (
          <div key={message.id} className={`bubble ${message.role === "user" ? "me" : "ugo"}`}>
            {message.text}
            <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              {message.ts.slice(0, 16).replace("T", " ")}
              {message.cached && " · risposta ricordata"}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <p className="lede">Ancora niente qui: comincia da Parla.</p>
        )}
      </div>
    </div>
  );
}
