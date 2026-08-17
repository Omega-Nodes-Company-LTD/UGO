"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceptionMe } from "@ugo/shared";
import { ApiError, call } from "../../lib/api";
import { markWelcomed } from "../../lib/session";
import { speechAvailable } from "../../lib/speech";

/**
 * L'onboarding del cliente: quattro cose dette PRIMA che parli, una volta
 * per dispositivo. Non è un tour di funzioni — è il patto: chi ti ascolta,
 * dove va (e non va) la tua voce (ADR-053), cosa succede alle richieste
 * (ADR-052), e perché il gosino a volte chiede di riprovare più tardi
 * (ADR-055/058). Chi lo vuole rileggere lo ritrova in Impostazioni.
 *
 * Qui NON c'è nessun consenso biometrico, ed è una scelta detta ad alta
 * voce: sul canale della reception il riconoscimento non esiste (ADR-053),
 * quindi non c'è niente a cui acconsentire. Il giorno in cui esisterà
 * (backlog gruppo 16, ADR da scrivere), il flusso a tre esiti si innesterà
 * in questa pagina — non al posto suo.
 */

export default function Benvenuto(): React.JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<ReceptionMe | null>(null);

  useEffect(() => {
    call<ReceptionMe>("/me")
      .then(setMe)
      .catch((caught: unknown) => {
        // senza token valido il benvenuto non ha nessuno da salutare
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
      });
  }, [router]);

  const listeners =
    me === null || me.gosini.length === 0
      ? "Lo studio ti presenterà il tuo gosino"
      : me.gosini.map((gosino) => gosino.name).join(" e ");

  return (
    <div>
      <p className="eyebrow">{me?.customer.name ?? "La reception di UGO"}</p>
      <h1>Prima che tu entri</h1>
      <p className="lede">
        Quattro cose, trenta secondi. Poi la porta è tua, e questa guida resta in Impostazioni.
      </p>

      <div className="card" style={{ marginBottom: "0.8rem" }} data-testid="welcome-pack">
        <strong>Chi ti ascolta.</strong>
        <p className="lede" style={{ margin: "0.4rem 0 0" }}>
          {listeners}
          {me !== null && me.gosini.length > 1
            ? ": ognuno ha il suo carattere e si ricorda le vostre conversazioni. Scegli tu, e puoi cambiare quando vuoi."
            : me !== null && me.gosini.length === 1
              ? ": ha il suo carattere e si ricorda le vostre conversazioni."
              : "."}{" "}
          Conosce il tuo progetto — repository, documenti, lo stato dei lavori — e risponde con
          le carte in mano.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "0.8rem" }} data-testid="welcome-voice">
        <strong>La tua voce resta qui.</strong>
        <p className="lede" style={{ margin: "0.4rem 0 0" }}>
          {speechAvailable()
            ? "Tieni premuto l'orbe e parla: è il tuo browser a trascrivere, e al server arriva solo il testo. Nessun audio lascia mai questo dispositivo, e su questo canale non esiste alcun riconoscimento vocale."
            : "Questo browser non sa ascoltare, quindi qui si scrive — e la promessa vale lo stesso: al server arriva solo testo, mai audio, e su questo canale non esiste alcun riconoscimento vocale."}
        </p>
      </div>

      <div className="card" style={{ marginBottom: "0.8rem" }} data-testid="welcome-tickets">
        <strong>Le richieste diventano ticket.</strong>
        <p className="lede" style={{ margin: "0.4rem 0 0" }}>
          Il gosino non esegue lavori: raccoglie. Quando vuoi qualcosa, dillo — «apri un ticket:
          vorrei l&apos;export in CSV» — e lui lo apre con la tua conferma. Lo ritrovi ne «I
          ticket», e vedi lo stato che lo studio gli dà.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "0.9rem" }} data-testid="welcome-pace">
        <strong>Ha un suo ritmo.</strong>
        <p className="lede" style={{ margin: "0.4rem 0 0" }}>
          Se un giorno ti chiede di riprovare più tardi, non è rotto: ha un limite di domande,
          per tenere il servizio sostenibile. E quando una risposta ti serve davvero, sotto c&apos;è
          una mela{me !== null && me.rewards.weeklyLimit > 0
            ? ` — ne hai ${String(me.rewards.weeklyLimit)} a settimana, quindi vale`
            : ""}
          : dagliela, se la ricorda.
        </p>
      </div>

      <button
        data-testid="welcome-go"
        onClick={() => {
          markWelcomed();
          router.push("/branco");
        }}
      >
        Ho capito, entriamo
      </button>
    </div>
  );
}
