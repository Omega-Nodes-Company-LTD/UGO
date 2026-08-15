"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, call } from "../lib/api";
import { keepToken } from "../lib/session";

/**
 * La porta (ADR-052): il token personale, consegnato dallo studio una volta
 * sola. «Resta collegato» è una scelta del cliente, detta in quelle parole.
 */

export default function Accesso(): React.JSX.Element {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [persist, setPersist] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = async (): Promise<void> => {
    if (secret.trim() === "") {
      setError("Serve il token che ti ha consegnato lo studio.");
      return;
    }
    setBusy(true);
    setError("");
    keepToken(secret.trim(), persist);
    try {
      await call("/me");
      router.push("/branco");
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? "Questo token non apre la reception. Controlla di averlo copiato intero."
          : "La reception non risponde: riprova fra un momento.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: "18vh" }}>
      <p className="eyebrow">La reception di UGO</p>
      <h1>Vieni, entra</h1>
      <p className="lede">
        Qui parli col gosino che segue i tuoi progetti: domande sul codice, richieste di
        modifica, lo stato dei lavori. Lui raccoglie e riferisce — il lavoro lo fa lo studio.
      </p>
      <label htmlFor="token">Il tuo token personale</label>
      <input
        id="token"
        type="password"
        data-testid="gate-token"
        value={secret}
        onChange={(event) => {
          setSecret(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void enter();
        }}
        autoComplete="off"
      />
      <label style={{ marginTop: "0.7rem" }}>
        <input
          type="checkbox"
          checked={persist}
          onChange={(event) => {
            setPersist(event.target.checked);
          }}
        />{" "}
        Resta collegato su questo dispositivo
      </label>
      <div style={{ marginTop: "0.9rem" }}>
        <button data-testid="gate-go" onClick={() => void enter()} disabled={busy}>
          {busy ? "Un attimo…" : "Entra"}
        </button>
      </div>
      {error !== "" && (
        <div className="msg err" data-testid="gate-msg">
          {error}
        </div>
      )}
    </div>
  );
}
