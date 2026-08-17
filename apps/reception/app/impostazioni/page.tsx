"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dropToken } from "../../lib/session";
import { speechAvailable } from "../../lib/speech";

/**
 * Impostazioni: poche e oneste. La voce si spegne qui; il tema segue il
 * sistema; «Esci» butta il token da questo dispositivo — l'unico posto in
 * cui esiste (ADR-052).
 */

export default function Impostazioni(): React.JSX.Element {
  const router = useRouter();
  const [voiceOn, setVoiceOn] = useState(true);

  useEffect(() => {
    setVoiceOn(localStorage.getItem("reception_voice") !== "off");
  }, []);

  const toggleVoice = (next: boolean): void => {
    setVoiceOn(next);
    localStorage.setItem("reception_voice", next ? "on" : "off");
  };

  return (
    <div>
      <p className="eyebrow">La reception</p>
      <h1>Impostazioni</h1>
      <div className="card" style={{ marginBottom: "0.8rem" }}>
        <label>
          <input
            type="checkbox"
            checked={voiceOn}
            onChange={(event) => {
              toggleVoice(event.target.checked);
            }}
          />{" "}
          Il gosino risponde anche a voce
        </label>
        <p className="lede" style={{ margin: "0.5rem 0 0" }}>
          {speechAvailable()
            ? "L'ascolto e la voce restano nel tuo browser: nessun audio viene inviato al server, mai."
            : "Questo browser non sa ascoltare: la tastiera funziona comunque, e la privacy è la stessa."}
        </p>
      </div>
      <div className="card" style={{ marginBottom: "0.8rem" }}>
        <p className="lede" style={{ marginTop: 0 }}>
          La guida del primo ingresso — chi ti ascolta, dove va la voce, come nascono i ticket —
          resta a portata di mano.
        </p>
        <button
          className="ghost"
          data-testid="welcome-again"
          onClick={() => {
            router.push("/benvenuto");
          }}
        >
          Rileggi il benvenuto
        </button>
      </div>
      <div className="card">
        <p className="lede" style={{ marginTop: 0 }}>
          Il tuo token vive solo su questo dispositivo. Uscendo, lo dimentichiamo: per rientrare
          servirà di nuovo.
        </p>
        <button
          className="ghost"
          data-testid="logout"
          onClick={() => {
            dropToken();
            router.push("/");
          }}
        >
          Esci
        </button>
      </div>
    </div>
  );
}
