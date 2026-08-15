import { z } from "zod";

/**
 * Gli arredi della stanza (ADR-051).
 *
 * **Il catalogo è codice, non una tabella.** Una riga di database che nomina un
 * arredo che il corpo non sa disegnare è un modo di rompere le cose che non
 * serve a niente: il muso lo ignorerebbe in silenzio e il pannello mostrerebbe
 * un oggetto che non esiste. Quel che sta nel database è ciò che è
 * **piazzato** — dove, quanti, in che stanza — e quello sì che è dato.
 *
 * È lo stesso ragionamento di `FACE_STATES`: un insieme chiuso condiviso dai
 * due lati, così il muso e l'anima non possono divergere su cosa esiste.
 */

export const PROP_KINDS = ["cushion", "grass", "bush", "ball", "trough"] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** Come si chiamano per chi guarda il pannello. */
export const PROP_IT: Readonly<Record<PropKind, string>> = {
  cushion: "cuscino",
  grass: "erba",
  bush: "cespuglio",
  ball: "palla",
  trough: "truogolo",
};

/**
 * Che cosa ci fa quando ci arriva.
 *
 * Guida due cose insieme, e apposta: il **tag** del gesto che il corpo sceglie
 * lì vicino, e la **postura** che gli viene naturale. Sono i due canali che
 * esistono già (`autonomy.ts` pesa i tag, `posture.ts` sceglie la posa), quindi
 * un arredo nuovo non aggiunge un motore: dice solo su quali leve tira.
 */
export interface PropNature {
  /** il tag di `gestures.ts` che si fa più probabile stando lì */
  tag: "calm" | "sleepy" | "nose" | "happy" | "curious";
  /** la posa che ci prende, se ce n'è una */
  posture: "lying" | "sitting" | "crouching" | undefined;
  /**
   * Quanto è ingombrante, in unità di scena.
   *
   * Serve a due cose diverse che è comodo tenere insieme: è il raggio entro cui
   * si considera «arrivato», ed è il raggio che il corpo **non attraversa**.
   * Un cuscino si può calpestare, un truogolo no — e la differenza sta nel
   * campo `solid`, non in questo numero.
   */
  radius: number;
  /** falso = ci si può camminare sopra (l'erba non è un ostacolo) */
  solid: boolean;
}

export const PROP_NATURE: Readonly<Record<PropKind, PropNature>> = {
  cushion: { tag: "sleepy", posture: "lying", radius: 0.62, solid: false },
  grass: { tag: "nose", posture: "crouching", radius: 0.55, solid: false },
  bush: { tag: "curious", posture: undefined, radius: 0.5, solid: true },
  ball: { tag: "happy", posture: undefined, radius: 0.3, solid: true },
  trough: { tag: "nose", posture: "crouching", radius: 0.55, solid: true },
};

/**
 * Quanti se ne possono piazzare in una stanza.
 *
 * Un tetto e non «quanti ne vuoi»: la stanza è larga poche unità, e venti
 * oggetti la trasformano in un magazzino in cui il maiale non ha più dove
 * andare — cioè tolgono esattamente la cosa per cui gli arredi esistono.
 */
export const MAX_PROPS_PER_ROOM = 8;

/**
 * Le coordinate sono **normalizzate**, in [-1,1], e non unità di scena.
 *
 * Il recinto lo dimensiona il muso a partire dal fotogramma (`layout()` in
 * `renderer3d.ts`): un telefono e un desktop hanno stanze di larghezza diversa,
 * quindi una x in unità di scena vorrebbe dire un cuscino che sul telefono è
 * fuori dal mondo. Normalizzata, «a metà strada verso il bordo destro» resta
 * a metà strada ovunque.
 */
export const placedPropSchema = z.object({
  kind: z.enum(PROP_KINDS),
  x: z.number().min(-1).max(1),
  z: z.number().min(-1).max(1),
  /** rotazione attorno all'asse verticale, in radianti */
  rot: z.number().min(-Math.PI).max(Math.PI).default(0),
});
export type PlacedProp = z.infer<typeof placedPropSchema>;

/** Un arredo com'è arrivato al muso: il piazzamento, più il suo id. */
export interface SceneProp extends PlacedProp {
  id: string;
}
