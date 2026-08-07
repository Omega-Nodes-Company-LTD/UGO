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
  /** applied once per day by the night job when ignored >24h */
  ignored_day: [{ variable: "umore", amount: -0.1 }],
  /** RH > 70% sustained */
  high_humidity: [{ variable: "umore", amount: -0.05 }],
  /** T > 29 °C for 30 min */
  heat_stress: [{ variable: "stress", amount: 0.15 }],
  /** spike: decays with its own 15-minute τ */
  loud_noise: [{ variable: "stress", amount: 0.2, tauHours: 0.25 }],
  shake: [{ variable: "stress", amount: 0.1 }],
  meeting_completed: [{ variable: "curiosita", amount: 0.1 }],
  new_topic: [{ variable: "curiosita", amount: 0.05 }],
  /** one hour alone */
  solitude_hour: [{ variable: "noia", amount: 0.05 }],
};

export function perturbationsForEvent(eventType: string): readonly Perturbation[] {
  return EVENT_PERTURBATIONS[eventType] ?? [];
}
