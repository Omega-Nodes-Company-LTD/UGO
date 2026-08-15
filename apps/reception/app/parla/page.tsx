"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  ReceptionChatResponse,
  ReceptionMe,
  ReceptionRewardAllowance,
  ReceptionRewardResponse,
} from "@ugo/shared";
import { Avatar, type AvatarState } from "../../components/avatar";
import { ApiError, call } from "../../lib/api";
import { chosenGosino } from "../../lib/session";
import { hush, listen, speak, speechAvailable, type ListenHandle } from "../../lib/speech";

/**
 * Il cuore voice-first (ADR-051/053): parli, lui trascrive nel browser,
 * risponde per iscritto e a voce. L'audio non lascia mai il dispositivo —
 * al server arriva solo testo. La tastiera è sempre lì sotto: la voce è il
 * canale primario, non un requisito.
 */

interface Turn {
  who: "me" | "ugo" | "hint";
  text: string;
}

const CHIPS = [
  { label: "Stato dei lavori", text: "A che punto sono i lavori?" },
  { label: "Le novità", text: "Ci sono novità sui repository?" },
  { label: "Apri un ticket", compose: "Apri un ticket: " },
] as const;

export default function Parla(): React.JSX.Element {
  const router = useRouter();
  const [me, setMe] = useState<ReceptionMe | null>(null);
  const [gosino, setGosino] = useState("");
  const [thread, setThread] = useState<Turn[]>([]);
  const [liveText, setLiveText] = useState("");
  const [draft, setDraft] = useState("");
  const [avatar, setAvatar] = useState<AvatarState>("idle");
  const [voiceOn, setVoiceOn] = useState(true);
  const [busy, setBusy] = useState(false);
  /**
   * Le mele (ADR-058): poche a settimana, e il conto è del server — qui si
   * mostra e basta. `null` finché `/me` non risponde: senza il dato il bottone
   * non esiste, che è meglio di un bottone che poi si rimangia il clic.
   */
  const [rewards, setRewards] = useState<ReceptionRewardAllowance | null>(null);
  const hearing = useRef<ListenHandle | undefined>(undefined);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chosen = chosenGosino();
    if (chosen === "") {
      router.push("/branco");
      return;
    }
    setGosino(chosen);
    setVoiceOn(localStorage.getItem("reception_voice") !== "off");
    call<ReceptionMe>("/me")
      .then((view) => {
        setMe(view);
        setRewards(view.rewards);
      })
      .catch((caught: unknown) => {
        if (caught instanceof ApiError && caught.status === 401) router.push("/");
      });
    if (!speechAvailable()) {
      setThread([
        {
          who: "hint",
          text: "Questo browser non sa ascoltare: scrivimi pure qui sotto, funziona uguale.",
        },
      ]);
    }
    return () => {
      hearing.current?.stop();
      hush();
    };
  }, [router]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, liveText]);

  const who = me?.gosini.find((candidate) => candidate.id === gosino);

  const send = async (text: string): Promise<void> => {
    const clean = text.trim();
    if (clean === "" || busy || gosino === "") return;
    hearing.current?.stop();
    setLiveText("");
    setDraft("");
    setBusy(true);
    setAvatar("thinking");
    setThread((turns) => [...turns, { who: "me", text: clean }]);
    try {
      const reply = await call<ReceptionChatResponse & { ticketId?: string }>("/chat", {
        method: "POST",
        body: JSON.stringify({ gosinoId: gosino, text: clean }),
      });
      setThread((turns) => [...turns, { who: "ugo", text: reply.reply }]);
      if (reply.ticketId !== undefined) {
        setThread((turns) => [
          ...turns,
          { who: "hint", text: "Il ticket è nel tab «I ticket»: lì vedrai come procede." },
        ]);
      }
      if (voiceOn) {
        setAvatar("talking");
        speak(gosino, reply.reply, () => {
          setAvatar("idle");
        });
      } else {
        setAvatar("idle");
      }
    } catch (caught) {
      setAvatar("idle");
      if (caught instanceof ApiError && caught.status === 429) {
        setThread((turns) => [
          ...turns,
          { who: "hint", text: "Ho bisogno di riprendere fiato: riprova fra qualche minuto." },
        ]);
      } else if (caught instanceof ApiError && caught.status === 401) {
        router.push("/");
      } else {
        setThread((turns) => [
          ...turns,
          { who: "hint", text: "Non ti ho sentito bene, la linea ha singhiozzato. Riprova." },
        ]);
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * La mela (ADR-058): si premia **l'ultima risposta**, non «il servizio».
   * Il bottone vive sotto l'ultima nuvoletta del gosino e sparisce appena la
   * conversazione va avanti: un premio dato a distanza di dieci battute non
   * insegna niente a nessuno. A mele finite risponde il server, con la data.
   */
  const reward = async (): Promise<void> => {
    if (gosino === "" || rewards === null || rewards.remaining === 0) return;
    try {
      const given = await call<ReceptionRewardResponse>("/reward", {
        method: "POST",
        body: JSON.stringify({ gosinoId: gosino }),
      });
      setRewards(given.rewards);
      setThread((turns) => [
        ...turns,
        {
          who: "hint",
          text:
            given.rewards.remaining === 0
              ? "🍎 Gliel'hai data — e se la ricorda. Era l'ultima della settimana."
              : `🍎 Gliel'hai data — e se la ricorda. Te ne ${
                  given.rewards.remaining === 1 ? "resta una" : `restano ${String(given.rewards.remaining)}`
                } questa settimana.`,
        },
      ]);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 429) {
        setRewards((state) => (state === null ? state : { ...state, remaining: 0 }));
        setThread((turns) => [
          ...turns,
          { who: "hint", text: "Le mele della settimana sono finite: tienile per le risposte davvero ottime." },
        ]);
      } else if (caught instanceof ApiError && caught.status === 401) {
        router.push("/");
      }
    }
  };

  const toggleEar = (): void => {
    if (hearing.current !== undefined) {
      hearing.current.stop();
      hearing.current = undefined;
      setAvatar("idle");
      return;
    }
    hush();
    const handle = listen({
      onPartial: setLiveText,
      onFinal: (text) => {
        void send(text);
      },
      onEnd: () => {
        hearing.current = undefined;
        setAvatar((state) => (state === "listening" ? "idle" : state));
      },
    });
    if (handle !== undefined) {
      hearing.current = handle;
      setAvatar("listening");
    }
  };

  return (
    <div>
      <div className="stage">
        <Avatar state={avatar} seed={gosino} />
        <div className="who" data-testid="who">
          {who !== undefined ? `Stai parlando con ${who.name}` : "…"}
        </div>
        {speechAvailable() && (
          <button
            className="orb"
            data-live={avatar === "listening"}
            data-testid="orb"
            aria-label={avatar === "listening" ? "Smetti di ascoltare" : "Parla"}
            onClick={toggleEar}
          >
            {avatar === "listening" ? "…" : "🎙"}
          </button>
        )}
        <div className="live-line" data-testid="live-line">
          {liveText}
        </div>
        <div className="chips">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              data-testid="chip"
              onClick={() => {
                if ("compose" in chip) setDraft(chip.compose);
                else void send(chip.text);
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      <div className="thread" data-testid="thread">
        {thread.map((turn, index) => (
          <div key={index} className={`bubble ${turn.who}`}>
            {turn.text}
          </div>
        ))}
        {rewards !== null &&
          rewards.remaining > 0 &&
          !busy &&
          thread.at(-1)?.who === "ugo" && (
            <button
              className="reward"
              data-testid="reward"
              title="La mela gli insegna quali risposte rifare: dagliela solo quando una risposta è davvero ottima."
              onClick={() => void reward()}
            >
              🍎 Premia questa risposta
            </button>
          )}
        <div ref={bottom} />
      </div>
      {rewards !== null && (
        <p className="reward-note" data-testid="reward-note">
          {rewards.remaining > 0
            ? `🍎 Hai ${rewards.remaining === 1 ? "una mela" : `${String(rewards.remaining)} mele`} per questa settimana: dagliene una solo quando una risposta è davvero ottima. Se la ricorda, e lo studio vede quali risposte ti sono servite.`
            : "🍎 Le mele della settimana sono finite: tornano da sole, una alla volta, sette giorni dopo che le hai date."}
        </p>
      )}

      <div className="composer">
        <input
          type="text"
          data-testid="composer"
          placeholder="…oppure scrivimi qui"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send(draft);
          }}
        />
        <button data-testid="send" onClick={() => void send(draft)} disabled={busy}>
          {busy ? "…" : "Manda"}
        </button>
      </div>
    </div>
  );
}
