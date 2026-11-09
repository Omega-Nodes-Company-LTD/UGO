/**
 * La voce che parla (ADR-126). Come il timbro del grugnito (ADR-116) non è un
 * gene nuovo: viene dal corpo. **Un maiale grosso parla più basso, un grugno
 * lungo più scuro.** Zero migrazioni, zero manopole, e si eredita da sola
 * perché `chonk` e `snout` si ereditano (regola 13: si adotta, non si
 * configura).
 *
 * Le voci sono quelle ElevenLabs che OpenRouter accetta per nome, **ordinate
 * dalla più acuta alla più profonda per altezza MISURATA**, non descritta: la
 * stessa frase italiana sintetizzata con ognuna, frequenza fondamentale
 * mediana per autocorrelazione (2026-11-09). `aria` e `charlotte` le rifiuta.
 *
 * Deterministica: stesso corpo, stessa voce. Due fratelli con corpi diversi
 * parlano con voci diverse; due genitori, uno grosso e uno minuto, fanno
 * figli che parlano a metà strada, perché `chonk` è un gene `blend`.
 */

export interface SpeakingVoice {
  /** il nome che OpenRouter accetta come `voice` */
  name: string;
  /** l'altezza misurata, per chi vuole sapere perché sta in quel posto */
  medianHz: number;
}

export const SPEAKING_VOICES: readonly SpeakingVoice[] = [
  { name: "river", medianHz: 215 },
  { name: "lily", medianHz: 204 },
  { name: "alice", medianHz: 203 },
  { name: "sarah", medianHz: 203 },
  { name: "jessica", medianHz: 200 },
  { name: "laura", medianHz: 200 },
  { name: "matilda", medianHz: 190 },
  { name: "eric", medianHz: 165 },
  { name: "bill", medianHz: 157 },
  { name: "charlie", medianHz: 154 },
  { name: "liam", medianHz: 153 },
  { name: "callum", medianHz: 147 },
  { name: "george", medianHz: 132 },
  { name: "chris", medianHz: 132 },
  { name: "daniel", medianHz: 129 },
  { name: "roger", medianHz: 128 },
  { name: "brian", medianHz: 126 },
  { name: "will", medianHz: 119 },
];

/** Quanto pesa la stazza sull'altezza; il resto lo fa il grugno (ADR-116). */
const CHONK_WEIGHT = 0.75;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function speakingVoice(body: { chonk: number; snout: number }): SpeakingVoice {
  const depth = clamp01(CHONK_WEIGHT * body.chonk + (1 - CHONK_WEIGHT) * body.snout);
  const index = Math.min(SPEAKING_VOICES.length - 1, Math.floor(depth * SPEAKING_VOICES.length));
  const voice = SPEAKING_VOICES.at(index);
  if (voice === undefined) throw new Error("the voice pool is empty");
  return voice;
}
