import type { Perturbation } from "./engine.js";

/**
 * Event → perturbation map (PROGETTO §5.3 table).
 * Nota di specie: i maiali non sudano — la sensibilità al caldo è filologia
 * suina, non un difetto caratteriale.
 */
export const EVENT_PERTURBATIONS: Readonly<Record<string, readonly Perturbation[]>> = {
  /** one conversation turn: tires a little, bonds a little, bores less */
  conversation_turn: [
    { variable: "energia", amount: -0.02 },
    { variable: "affetto", amount: 0.05 },
    { variable: "noia", amount: -0.15 },
  ],
  presence_detected: [
    { variable: "affetto", amount: 0.1 },
    { variable: "noia", amount: -0.2 },
  ],
  compliment: [{ variable: "umore", amount: 0.05 }],
  /** emitted by soul's SolitudeMonitor after 24h without being addressed */
  ignored_day: [{ variable: "umore", amount: -0.1 }],
  /** RH > 70% sustained */
  high_humidity: [{ variable: "umore", amount: -0.05 }],
  /** T > 29 °C for 30 min */
  heat_stress: [{ variable: "stress", amount: 0.15 }],
  /**
   * Spike: decays with its own 15-minute τ, and habituates (ADR-033).
   *
   * ADR-040 lowered the ceiling from 0.45. With a stress baseline of 0.30 it
   * put the habituated plateau at 0.75 — **above** the 0.60 the labels call
   * anxiety — so a creature perfectly used to a noisy kitchen was permanently
   * described, and prompted, as a tense one. Getting used to something has to
   * be able to end in "fine", or it is not getting used to it.
   *
   * 0.25 puts the plateau at 0.55: still visibly above rest, because a noisy
   * room IS more stressful, and below the line where he starts saying so.
   * The first bang still lands its full 0.20 — that one is a real fright.
   */
  loud_noise: [{ variable: "stress", amount: 0.2, tauHours: 0.25, ceiling: 0.25 }],
  /** same family, same reason: a phone in a pocket must not terrorise him */
  shake: [{ variable: "stress", amount: 0.1, ceiling: 0.18 }],
  meeting_completed: [{ variable: "curiosita", amount: 0.1 }],
  new_topic: [{ variable: "curiosita", amount: 0.05 }],
  /** ADR-020: meeting one of your own kind, for the first time */
  peer_met: [
    { variable: "curiosita", amount: 0.15 },
    { variable: "noia", amount: -0.2 },
  ],
  /** an acquaintance seen again: milder, and it warms rather than excites */
  peer_greeted: [
    { variable: "umore", amount: 0.04 },
    { variable: "noia", amount: -0.1 },
  ],
  /** one hour alone, emitted by soul's SolitudeMonitor */
  solitude_hour: [{ variable: "noia", amount: 0.05 }],
  /**
   * ADR-051: è andato a grufolare nell'erba, o si è coricato sul cuscino.
   *
   * Piccolo, e con un `ceiling`. Entrambe le cose sono la decisione, non la
   * taratura: il corpo sceglie da solo quando avvicinarsi a un arredo — è una
   * decisione locale a zero token (ADR-026 §6) — quindi **è lui a generare
   * l'evento che lo ricompensa**. Senza un tetto, un corpo acceso e solo che
   * macina noia farebbe avanti e indietro fra due cuscini e si terrebbe la noia
   * a zero per sempre: un anello chiuso che si auto-alimenta, cioè un modo per
   * cui la noia smetterebbe di significare qualcosa.
   *
   * Col tetto, un cuscino toglie il primo strato di noia e poi smette di
   * bastare — che è esattamente ciò che fa un giocattolo vero.
   */
  used_prop: [
    { variable: "noia", amount: -0.12, ceiling: 0.2 },
    { variable: "umore", amount: 0.03, ceiling: 0.06 },
  ],
  /**
   * ADR-030: he asked to go out, and he was taken out. The strongest good
   * thing that can happen to him, and it lasts — a walk is not a compliment.
   */
  went_out: [
    { variable: "umore", amount: 0.18 },
    { variable: "noia", amount: -0.45 },
    { variable: "curiosita", amount: 0.2 },
    { variable: "affetto", amount: 0.08 },
  ],
  /** back home: the world stops being new, but he is not sad about it */
  came_home: [
    { variable: "energia", amount: -0.08 },
    { variable: "affetto", amount: 0.05 },
  ],
};

export function perturbationsForEvent(eventType: string): readonly Perturbation[] {
  return EVENT_PERTURBATIONS[eventType] ?? [];
}
