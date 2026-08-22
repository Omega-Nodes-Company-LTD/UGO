"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceRenderer } from "@ugo/face-body";
import type { ReceptionLook } from "@ugo/shared";

/**
 * Il corpo vero del gosino, nella reception (ADR-115).
 *
 * Fino a qui il cliente vedeva un muso 2D disegnato a mano: onesto, leggero, e
 * **di un altro animale** rispetto a quello che vive in casa. La reception però
 * è *una nostra stanza*, non un sito qualunque: chi ci entra deve incontrare la
 * creatura che c'è, con le sue orecchie e le sue chiazze.
 *
 * Tre scelte, e sono tutte e tre sulla stessa linea — **non rompere la pagina
 * per una decorazione**:
 *
 * 1. il package del corpo si carica **dinamicamente** e solo nel browser: è
 *    three.js, e Next lo renderizzerebbe sul server dove non esiste un canvas;
 * 2. se il caricamento non riesce — WebGL spento, dispositivo vecchio, rete
 *    che cade a metà — si **ripiega sul muso 2D** invece di mostrare un buco.
 *    Un cliente che non vede niente pensa che sia rotto il servizio, non la
 *    scheda video;
 * 3. `look` è **facoltativo**: senza, si disegna il corpo medio. Un gosino
 *    senza trait set non deve diventare una pagina vuota.
 */

export type BodyState = "idle" | "listening" | "thinking" | "talking";

/** Il vocabolario della reception nel vocabolario del corpo (ADR-026). */
const STATE_MAP = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  talking: "talking",
} as const;

export interface Body3dProps {
  look?: ReceptionLook | undefined;
  state: BodyState;
  /** l'umore che è arrivato con l'ultima risposta (ADR-115): niente canale vivo */
  mood?: Record<string, number> | undefined;
  /** cosa mostrare se il 3D non parte */
  fallback: React.ReactNode;
}

export function Body3d({ look, state, mood, fallback }: Readonly<Body3dProps>): React.JSX.Element {
  const holder = useRef<HTMLDivElement | null>(null);
  const [broken, setBroken] = useState(false);
  const face = useRef<FaceRenderer | null>(null);

  useEffect(() => {
    /**
     * Un oggetto e non un `let`: chi legge il codice vede la stessa cosa, ma
     * l'analisi di flusso no — con una variabile locale decide che è sempre
     * `true`, perché non vede che a spegnerla è la funzione di pulizia, che
     * gira dopo. Con una proprietà mutabile la domanda resta una domanda.
     */
    const alive = { yes: true };
    let dispose: (() => void) | undefined;

    void (async () => {
      try {
        const body = await import("@ugo/face-body");
        const canvas = holder.current;
        if (!alive.yes || canvas === null) return;
        const surface = document.createElement("canvas");
        surface.className = "body3d-canvas";
        canvas.replaceChildren(surface);
        const mounted = body.createFace(surface, { wander: false });
        // un abitante solo, quello scelto: la reception non è una stanza di
        // casa e non deve mostrare chi ci vive
        // `setResidents` è facoltativo nell'interfaccia: il corpo 2D non ha una
        // stanza in cui mettere qualcuno, e ripiegare su di lui è previsto
        mounted.setResidents?.([{ id: "reception", name: "gosino", traits: look ?? {} }]);
        face.current = mounted;
        dispose = () => {
          mounted.stop();
          surface.remove();
        };
      } catch {
        // WebGL spento, dispositivo vecchio, chunk che non arriva: si ripiega,
        // e il cliente vede una creatura invece di un rettangolo vuoto
        if (alive.yes) setBroken(true);
      }
    })();

    return () => {
      alive.yes = false;
      dispose?.();
    };
  }, [look]);

  /**
   * Lo stato e l'umore arrivano **con la risposta**, non da un canale aperto:
   * la reception non ha un WebSocket e non ne avrà uno per far muovere un
   * disegno. Fra una risposta e l'altra il corpo respira e basta, che è quello
   * che fa un animale quando non gli parli.
   */
  useEffect(() => {
    const mounted = face.current;
    if (mounted === null) return;
    mounted.setState(STATE_MAP[state]);
    if (mood !== undefined) mounted.setMood("", mood);
  }, [mood, state]);

  if (broken) return <>{fallback}</>;
  return <div ref={holder} data-testid="body3d" data-state={state} className="body3d" />;
}
