/**
 * Pressures — PURE.
 *
 * The psyche already existed, but it was purely expressive: `noia` went up and
 * only changed how UGO *looked*. Nothing in the system treated a rising need as
 * a problem to be solved, so nothing he ever did originated with him.
 *
 * A pressure is that missing half: an internal state that is asking to be
 * discharged. It carries its own reason in Italian, because an initiative you
 * cannot explain afterwards is indistinguishable from a bug (ADR-027).
 */

export const PRESSURE_IDS = [
  "boredom", // nothing is happening and he wants something to
  "loneliness", // he has been on his own too long
  "curiosity", // there is something he does not understand
  "unspoken", // he is holding a desire from last night's dream
  "worry", // stressed, and looking for contact
] as const;

export type PressureId = (typeof PRESSURE_IDS)[number];

export interface Pressure {
  id: PressureId;
  /** 0..1, how hard it is pushing */
  magnitude: number;
  /** why — logged with the initiative, never invented after the fact */
  because: string;
}

/** The six psyche variables of PROGETTO §5.3. */
export interface Vars {
  umore: number;
  energia: number;
  affetto: number;
  noia: number;
  stress: number;
  curiosita: number;
}

/** What the world looks like right now, gathered from the database. */
export interface WorldFacts {
  /** minutes since the last sign that someone was here */
  minutesAlone: number;
  /** minutes since UGO last did something on his own initiative */
  minutesSinceInitiative: number;
  /** desires written by the dream and still unsaid */
  pendingDesires: number;
  /** one of them names an hour, and that hour is now */
  desireIsDue: boolean;
  /** at least one body is connected: someone could plausibly hear him */
  bodyPresent: boolean;
  /** hour of day in the project timezone */
  hour: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Rises fast at first and then flattens: an hour alone is not twice ten minutes. */
const saturating = (value: number, halfAt: number): number => value / (value + halfAt);

export function pressures(vars: Vars, facts: WorldFacts): Pressure[] {
  const out: Pressure[] = [];

  // Boredom only counts as a *reason to act on someone* when there is someone
  // to act on. Alone, boredom already has its outlet: he wanders and roots.
  if (facts.bodyPresent) {
    const magnitude = clamp((vars.noia - 0.45) * 1.9, 0, 1) * clamp(vars.energia * 1.4, 0, 1);
    if (magnitude > 0.05) {
      out.push({
        id: "boredom",
        magnitude,
        because: `noia a ${vars.noia.toFixed(2)} e ancora energia per farci qualcosa`,
      });
    }
  }

  // Loneliness is the one that makes him call you. It grows with the clock,
  // and faster in a UGO who is attached: indifference does not miss anyone.
  const lonely = saturating(facts.minutesAlone, 90) * clamp(0.35 + vars.affetto, 0, 1.2);
  if (lonely > 0.15) {
    out.push({
      id: "loneliness",
      magnitude: clamp(lonely, 0, 1),
      because: `solo da ${String(Math.round(facts.minutesAlone))} minuti`,
    });
  }

  // Something he does not understand. High curiosity with nothing queued to ask
  // is the state that makes him *form* a question rather than repeat one.
  const wonder = clamp((vars.curiosita - 0.5) * 2, 0, 1);
  if (wonder > 0.1) {
    out.push({
      id: "curiosity",
      magnitude: wonder,
      because: `curiosità a ${vars.curiosita.toFixed(2)}, e niente in coda da chiedere`,
    });
  }

  // A desire the dream wrote and nobody has heard yet. Until today this could
  // only ever come out at wake-up, so most of them died pending.
  if (facts.pendingDesires > 0) {
    const magnitude = clamp(0.32 + facts.pendingDesires * 0.16 + (facts.desireIsDue ? 0.4 : 0), 0, 1);
    out.push({
      id: "unspoken",
      magnitude,
      because: facts.desireIsDue
        ? "è l'ora che si era segnato"
        : `${String(facts.pendingDesires)} cose da chiedere, ancora in canna`,
    });
  }

  // Stress does not want conversation; it wants someone nearby.
  const strain = clamp((vars.stress - 0.55) * 2.2, 0, 1);
  if (strain > 0.1) {
    out.push({
      id: "worry",
      magnitude: strain,
      because: `stress a ${vars.stress.toFixed(2)}`,
    });
  }

  return out.sort((a, b) => b.magnitude - a.magnitude);
}
