import { gosini, psycheSnapshots, traitSets, type DbClient } from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Character, characterFrom } from "./character.js";

/**
 * The council (ADR-031): ask one question, and let every exemplar in the house
 * answer it as itself.
 *
 * Two rounds, and the first one is BLIND on purpose. Small local models are
 * herd animals: shown someone else's answer first, they agree with it and the
 * council becomes an echo with extra steps. So round one is each on his own,
 * and only in round two do they hear each other — and may change their mind,
 * or dig in.
 *
 * Everything runs on the LOCAL model. A room full of pigs arguing is exactly
 * the kind of thing that would quietly empty an API budget, and it is also the
 * kind of thing you want to be able to run for fun.
 */

const MAX_PARTICIPANTS = 6;

export interface Voice {
  gosinoId: string;
  name: string;
  /** where he lives: "cucina", "studio" */
  where: string | undefined;
  mood: string;
  /** what he said on his own */
  first: string;
  /** what he said after hearing the others; absent if he had nothing to add */
  second?: string;
}

export interface CouncilResult {
  question: string;
  voices: Voice[];
  /** true when at least one of them moved after hearing the others */
  changedMind: boolean;
}

interface Participant {
  id: string;
  name: string;
  where: string | undefined;
  character: Character;
  moodLabel: string;
  vars: Record<string, number>;
}

export interface CouncilDeps {
  db: DbClient;
  local: LocalTextClient;
}

function moodLine(vars: Record<string, number>): string {
  const say = (key: string, low: string, high: string): string | undefined => {
    const value = vars[key];
    if (value === undefined) return undefined;
    if (value < 0.3) return low;
    if (value > 0.7) return high;
    return undefined;
  };
  const notes = [
    say("umore", "sei giù", "sei di ottimo umore"),
    say("energia", "sei stanco morto", "sei pieno di energia"),
    say("noia", "", "sei annoiatissimo"),
    say("stress", "", "sei teso"),
    say("curiosita", "", "sei incuriosito"),
  ].filter((note): note is string => note !== undefined && note !== "");
  return notes.length === 0 ? "Stai normale." : `Adesso ${notes.join(", ")}.`;
}

function firstRoundPrompt(who: Participant, question: string): string {
  return [
    `Sei ${who.name}, un maialino che vive in casa${who.where === undefined ? "" : ` in ${who.where}`}.`,
    who.character.persona,
    moodLine(who.vars),
    "",
    `Ti è stata fatta questa domanda: «${question}»`,
    "",
    `Rispondi in italiano, come risponderesti tu, in massimo ${String(who.character.maxWords)} parole.`,
    "Di' la tua, anche se è una sciocchezza da maiale. Non fare l'assistente.",
    "Rispondi soltanto con quello che diresti, senza preamboli.",
  ].join("\n");
}

function secondRoundPrompt(who: Participant, question: string, others: Voice[]): string {
  return [
    `Sei ${who.name}, un maialino.`,
    who.character.persona,
    moodLine(who.vars),
    "",
    `La domanda era: «${question}»`,
    `Tu avevi risposto: «${others.find((v) => v.gosinoId === who.id)?.first ?? ""}»`,
    "",
    "Gli altri hanno detto:",
    ...others.filter((v) => v.gosinoId !== who.id).map((v) => `- ${v.name}: «${v.first}»`),
    "",
    `Adesso che li hai sentiti, ribatti in massimo ${String(who.character.maxWords)} parole.`,
    "Puoi cambiare idea, insistere, o prendere in giro qualcuno. Sii te stesso.",
    "Se non hai proprio niente da aggiungere, rispondi solo: NIENTE",
    "Rispondi soltanto con quello che diresti, senza preamboli.",
  ].join("\n");
}

/** Strips the preamble a small model puts in front of everything. */
export function tidyAnswer(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/giu, "")
    .split("\n")
    .map((line) => line.trim().replace(/^["'«»\-*\d.)\s]+/u, "").replace(/["'«»]+$/u, ""))
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();
  if (cleaned.length < 2) return undefined;
  return cleaned.toUpperCase().startsWith("NIENTE") ? undefined : cleaned;
}

export class CouncilService {
  public constructor(private readonly deps: CouncilDeps) {}

  /**
   * Everyone still alive in the house, with their character and their mood.
   *
   * ADR-062: accetta la transazione che ha dichiarato la casa, perché la
   * lettura del roster deve stare DENTRO il muro mentre il dibattito (le
   * chiamate al modello) resta fuori — una transazione aperta attraverso sei
   * generazioni locali sarebbe `idle in transaction` per minuti.
   */
  public async participants(accountId: string, db: DbClient = this.deps.db): Promise<Participant[]> {
    const rows = await db
      .select({
        id: gosini.id,
        name: gosini.name,
        where: gosini.locationLabel,
      })
      .from(gosini)
      // ADR-019 phase 2: a council is a house's council. Unscoped, it seated
      // the neighbours' creatures at the table and paid for their tokens.
      .where(and(isNull(gosini.retiredAt), eq(gosini.accountId, accountId)))
      .limit(MAX_PARTICIPANTS);

    const out: Participant[] = [];
    for (const row of rows) {
      const traits = await db
        .select({ traits: traitSets.traits })
        .from(traitSets)
        .where(eq(traitSets.gosinoId, row.id))
        .orderBy(desc(traitSets.version))
        .limit(1);
      const snapshot = await db
        .select({ vars: psycheSnapshots.vars, label: psycheSnapshots.label })
        .from(psycheSnapshots)
        .where(eq(psycheSnapshots.gosinoId, row.id))
        .orderBy(desc(psycheSnapshots.ts))
        .limit(1);
      out.push({
        id: row.id,
        name: row.name,
        where: row.where ?? undefined,
        character: characterFrom(traits[0]?.traits),
        moodLabel: snapshot[0]?.label ?? "sereno",
        vars: (snapshot[0]?.vars ?? {}) as Record<string, number>,
      });
    }
    return out;
  }

  /**
   * Asks everyone, then lets them hear each other.
   * Returns whatever came back — a participant whose model said nothing usable
   * is simply left out rather than filled in with an invention.
   */
  public async deliberate(
    question: string,
    accountId: string,
    roster?: Participant[],
  ): Promise<CouncilResult> {
    const who = roster ?? (await this.participants(accountId));
    const voices: Voice[] = [];

    // round one: blind, and in parallel — they must not see each other yet
    const firsts = await Promise.all(
      who.map(async (participant) => ({
        participant,
        text: tidyAnswer(
          await this.deps.local.generate(firstRoundPrompt(participant, question), 200),
        ),
      })),
    );
    for (const { participant, text } of firsts) {
      if (text === undefined) continue;
      voices.push({
        gosinoId: participant.id,
        name: participant.name,
        where: participant.where,
        mood: participant.moodLabel,
        first: text,
      });
    }

    // round two: now they hear each other. Pointless with fewer than two.
    let changedMind = false;
    if (voices.length > 1) {
      const seconds = await Promise.all(
        voices.map(async (voice) => {
          const participant = who.find((p) => p.id === voice.gosinoId);
          if (participant === undefined) return { voice, text: undefined };
          return {
            voice,
            text: tidyAnswer(
              await this.deps.local.generate(
                secondRoundPrompt(participant, question, voices),
                200,
              ),
            ),
          };
        }),
      );
      for (const { voice, text } of seconds) {
        if (text === undefined) continue;
        voice.second = text;
        changedMind = true;
      }
    }

    return { question, voices, changedMind };
  }
}
