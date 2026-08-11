/**
 * Terzo strato: i GESTI.
 *
 * Lo strato continuo (pose.ts) sa fare gli *stati d'animo*, ma non sa fare gli
 * *eventi*: uno sbadiglio, una scrollata, uno starnuto non sono configurazioni
 * in cui stare, sono cose che succedono e finiscono. Sono curve nel tempo,
 * additive sopra la posa, e costano una manciata di righe ciascuna.
 *
 * Puro come pose.ts: dato il tipo e il progresso in [0,1], restituisce lo
 * scostamento. Nessun timer qui dentro — quello è del driver.
 */

export type GestureKind = "sbadiglio" | "scrollata" | "starnuto";

/** Scostamenti additivi sopra la posa continua. */
export interface GestureImpulse {
  headPitch: number;
  headRoll: number;
  earLift: number;
  earTwitch: number;
  eyeOpen: number;
  mouthOpen: number;
  bounce: number;
  /** tremolio del corpo: il canale che serve solo ai gesti */
  shake: number;
}

export const NO_GESTURE: GestureImpulse = {
  headPitch: 0,
  headRoll: 0,
  earLift: 0,
  earTwitch: 0,
  eyeOpen: 0,
  mouthOpen: 0,
  bounce: 0,
  shake: 0,
};

export const GESTURE_MS: Record<GestureKind, number> = {
  sbadiglio: 1900,
  scrollata: 900,
  starnuto: 850,
};

/** campana 0→1→0, per far entrare e uscire un gesto senza scatti */
const bell = (u: number): number => Math.sin(Math.PI * Math.min(Math.max(u, 0), 1));

export function sampleGesture(kind: GestureKind, u: number): GestureImpulse {
  switch (kind) {
    case "sbadiglio": {
      // la bocca si spalanca piano, gli occhi si stringono, la testa va su
      const b = bell(u);
      return {
        ...NO_GESTURE,
        mouthOpen: b,
        eyeOpen: -0.75 * b,
        headPitch: 0.28 * b,
        earLift: -0.35 * b,
      };
    }
    case "scrollata": {
      // scrollarsi di dosso qualcosa: oscillazione veloce dentro una campana
      const env = bell(u);
      const wobble = Math.sin(u * Math.PI * 13);
      return {
        ...NO_GESTURE,
        shake: wobble * env,
        headRoll: wobble * env * 0.3,
        earTwitch: env * 0.5,
        eyeOpen: -0.3 * env,
      };
    }
    case "starnuto": {
      // due tempi: si carica guardando in su, poi scatta in giù
      if (u < 0.55) {
        const b = u / 0.55;
        return {
          ...NO_GESTURE,
          headPitch: 0.34 * b,
          eyeOpen: -0.55 * b,
          earLift: 0.25 * b,
        };
      }
      const b = 1 - (u - 0.55) / 0.45;
      return {
        ...NO_GESTURE,
        headPitch: -0.5 * b,
        eyeOpen: -0.9 * b,
        mouthOpen: 0.8 * b,
        bounce: 0.35 * b,
        shake: Math.sin(u * Math.PI * 9) * b * 0.5,
      };
    }
  }
}

/** Il driver: tiene il gesto in corso e il suo orologio. Questo sì ha stato. */
export class GesturePlayer {
  private kind: GestureKind | undefined;
  private startedAt = 0;

  public play(kind: GestureKind, now: number): void {
    this.kind = kind;
    this.startedAt = now;
  }

  public get current(): GestureKind | undefined {
    return this.kind;
  }

  public sample(now: number): GestureImpulse {
    if (this.kind === undefined) return NO_GESTURE;
    const u = (now - this.startedAt) / GESTURE_MS[this.kind];
    if (u >= 1) {
      this.kind = undefined;
      return NO_GESTURE;
    }
    return sampleGesture(this.kind, u);
  }
}
