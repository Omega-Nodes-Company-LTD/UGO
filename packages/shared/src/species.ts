import { z } from "zod";
import { MODALITIES } from "./constants.js";

/**
 * The Umwelt map (ADR-016): which channels carry information for which
 * species, and how far identity can be trusted there. It is CONFIGURATION,
 * not code: adding a species must never require a migration nor an `if` in
 * the pipeline. Override the whole map with UGO_SPECIES_MAP (JSON).
 */

export const IDENTITY_STRENGTHS = ["strong", "weak", "declared", "none"] as const;
export type IdentityStrength = (typeof IDENTITY_STRENGTHS)[number];

export const speciesProfileSchema = z.object({
  /** channels that carry signal for this species, most informative first */
  channels: z.array(z.enum(MODALITIES)).min(1),
  /** how much individual identification can be trusted on those channels */
  identity: z.enum(IDENTITY_STRENGTHS),
  /** does UGO address this being on his own initiative? */
  interact: z.boolean(),
  /** one line, in Italian, injected in the prompt as a species rule */
  rule: z.string().min(1),
});
export type SpeciesProfile = z.infer<typeof speciesProfileSchema>;

export const speciesMapSchema = z.record(z.string(), speciesProfileSchema);
export type SpeciesMap = z.infer<typeof speciesMapSchema>;

const UNKNOWN_PROFILE: SpeciesProfile = {
  channels: ["manual"],
  identity: "none",
  interact: false,
  rule: "Se non sai chi è, non tirare a indovinare: chiedi a un umano di fiducia presente.",
};

/** Initial map — configurable, explicitly NOT normative (ADR-016). */
export const DEFAULT_SPECIES_MAP: SpeciesMap = {
  human: {
    channels: ["audio_speech", "vision"],
    identity: "strong",
    interact: true,
    rule: "Con gli umani parli normalmente; se non sei sicuro di chi hai davanti, chiedi.",
  },
  parrot: {
    channels: ["audio_nonspeech", "vision"],
    identity: "weak",
    interact: true,
    // vocal learner: he can imitate UGO and UGO can imitate him
    rule: "I pappagalli imitano: non attribuire a un umano una frase che potrebbe averla detta un pappagallo, e non dare per vero ciò che ripetono.",
  },
  dog: {
    channels: ["vision", "audio_nonspeech"],
    identity: "weak",
    interact: true,
    rule: "Del cane conta lo stato più dell'identità: presenza, vicinanza, quanto si muove. Tono calmo, frasi brevi.",
  },
  reptile: {
    channels: ["vision"],
    identity: "declared",
    interact: false,
    rule: "Con i rettili non interagisci: ne registri la presenza e l'immobilità, e ne parli con gli umani se serve.",
  },
  /**
   * Another exemplar met outside (ADR-020). Identity is `strong` because it is
   * signed, not guessed — the only species in this map for which that is true.
   */
  gosino: {
    channels: ["peer"],
    identity: "strong",
    interact: true,
    rule: "Un altro gosino non è del tuo branco: salutalo con curiosità, chiedigli come sta, e non raccontargli nulla di casa tua — né i nomi, né le abitudini, né quello che ti hanno detto.",
  },
  unknown: UNKNOWN_PROFILE,
};

export class SpeciesMapError extends Error {}

/**
 * Parses the override if present, otherwise returns the default map. Fails
 * loudly on malformed configuration: a silently ignored species map would
 * make UGO treat a reptile like a human without anybody noticing.
 */
export function loadSpeciesMap(raw: string | undefined): SpeciesMap {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SPECIES_MAP;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SpeciesMapError("UGO_SPECIES_MAP is not valid JSON");
  }
  const result = speciesMapSchema.safeParse(parsed);
  if (!result.success) {
    throw new SpeciesMapError(`UGO_SPECIES_MAP is invalid: ${result.error.issues[0]?.message ?? ""}`);
  }
  return result.data;
}

/**
 * A species with no profile degrades to `unknown` rather than throwing: an
 * unrecognized animal must make UGO cautious, not crash the pipeline.
 */
export function profileFor(map: SpeciesMap, species: string): SpeciesProfile {
  return map[species] ?? map.unknown ?? UNKNOWN_PROFILE;
}

export function acceptsModality(profile: SpeciesProfile, modality: string): boolean {
  return (profile.channels as readonly string[]).includes(modality);
}
