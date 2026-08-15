"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReceptionMe } from "@ugo/shared";
import { Avatar } from "../../components/avatar";
import { ApiError, call } from "../../lib/api";
import { chooseGosino, chosenGosino } from "../../lib/session";

/**
 * Il branco (ADR-052): il cliente sceglie a chi rivolgersi, fra gli
 * assegnati. La scelta persiste, e col tempo dice allo studio quale gosino
 * gli sta simpatico — perciò è una scelta vera, non un default nascosto.
 */

export default function Branco(): React.JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<ReceptionMe | null>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setChosen(chosenGosino());
    call<ReceptionMe>("/me")
      .then(setMe)
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
        else setError("La reception non risponde: riprova fra un momento.");
      });
  }, [router]);

  const pick = (id: string): void => {
    chooseGosino(id);
    setChosen(id);
    router.push("/parla");
  };

  return (
    <div>
      <p className="eyebrow">{me?.customer.name ?? "…"}</p>
      <h1>Con chi vuoi parlare?</h1>
      <p className="lede">
        Ognuno ha il suo carattere e si ricorda le vostre conversazioni. Puoi cambiare quando
        vuoi: la porta è la stessa.
      </p>
      {error !== "" && <div className="msg err">{error}</div>}
      <div className="pack" data-testid="pack">
        {me?.gosini.map((gosino) => (
          <button
            key={gosino.id}
            className="gosino"
            aria-pressed={gosino.id === chosen}
            data-testid="pick-gosino"
            onClick={() => {
              pick(gosino.id);
            }}
          >
            <Avatar state="idle" seed={gosino.id} />
            <span>
              <strong>{gosino.name}</strong>
              <br />
              <span className="meta">
                {gosino.locationLabel !== null ? `vive in ${gosino.locationLabel}` : "gira per casa"}
              </span>
            </span>
          </button>
        ))}
        {me !== null && me.gosini.length === 0 && (
          <p className="lede">
            Nessun gosino ti è ancora stato assegnato: chiedi allo studio di presentartene uno.
          </p>
        )}
      </div>
    </div>
  );
}
