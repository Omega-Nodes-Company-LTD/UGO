import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import {
  createDbClient,
  type DbClient,
  gosini,
  households,
  PRIME_HOUSEHOLD_ID,
  psycheSnapshots,
  runMigrations,
  traitSets,
} from "@ugo/db";
import type { LocalTextClient } from "@ugo/memory";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARCHETYPES, characterFrom } from "../../src/services/council/character.js";
import { CouncilService } from "../../src/services/council/councilService.js";

/**
 * The council against a real database (ADR-031).
 *
 * The local model is recorded rather than stubbed blind: what these assert is
 * that each exemplar is asked AS HIMSELF — different character, different mood
 * — because a council of identical copies is an echo, and that is exactly the
 * failure this feature has to avoid.
 */

let pg: StartedPostgreSqlContainer;
let db: DbClient;
let householdId: string;

/** Remembers every prompt it was asked, and answers with a canned line. */
function recorder(answers: Record<string, string | undefined>): {
  client: LocalTextClient;
  prompts: string[];
} {
  const prompts: string[] = [];
  return {
    prompts,
    client: {
      available: () => Promise.resolve(true),
      generate: (prompt: string) => {
        prompts.push(prompt);
        const who = Object.keys(answers).find((name) => prompt.includes(`Sei ${name}`));
        return Promise.resolve(who === undefined ? undefined : answers[who]);
      },
    },
  };
}

async function born(name: string, archetype: keyof typeof ARCHETYPES, where: string): Promise<string> {
  const rows = await db
    .insert(gosini)
    .values({ householdId, name, locationLabel: where })
    .returning({ id: gosini.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("not created");
  await db.insert(traitSets).values({
   householdId: PRIME_HOUSEHOLD_ID,
    gosinoId: id,
    version: 1,
    traits: characterFrom(ARCHETYPES[archetype]).traits,
  });
  return id;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();
  const url = pg.getConnectionUri();
  await runMigrations(url);
  db = createDbClient(url);
  const houses = await db.select({ id: households.id }).from(households).limit(1);
  const first = houses[0]?.id;
  if (first === undefined) throw new Error("the migrations seed one household");
  householdId = first;
  await db.execute(sql`delete from trait_sets`);
}, 240_000);

afterAll(async () => {
  await pg.stop();
});

describe("the council", () => {
  it("asks each exemplar as himself, with his own character and his own mood", async () => {
    const curious = await born("Ugo", "curiosone", "cucina");
    await born("Nino", "pigrone", "studio");
    // one of them is in a foul mood, and the prompt must say so
    await db.insert(psycheSnapshots).values({
      gosinoId: curious,
      vars: { umore: 0.9, energia: 0.9, affetto: 0.5, noia: 0.1, stress: 0.2, curiosita: 0.95 },
      label: "gasato",
    });

    const { client, prompts } = recorder({
      Ugo: "Andiamo subito, dai!",
      Nino: "Mah. Si sta bene anche qui.",
    });
    const result = await new CouncilService({ db, local: client }).deliberate("Usciamo?", householdId);

    expect(result.voices.map((v) => v.name).sort()).toEqual(["Nino", "Ugo"]);
    expect(result.voices.find((v) => v.name === "Ugo")?.where).toBe("cucina");

    // the two were asked differently: that is the whole point of the genome.
    // NB: the exemplar seeded by the migrations (`ugo-prime`) is a real
    // participant too and is asked as well — he simply has nothing to say
    // here, so he never reaches the transcript.
    const firstRound = prompts.filter((p) => !p.includes("Gli altri hanno detto"));
    const forUgo = firstRound.find((p) => p.includes("Sei Ugo"));
    const forNino = firstRound.find((p) => p.includes("Sei Nino"));
    expect(forUgo).not.toBe(forNino);
    expect(forUgo).toContain("curiosissimo");
    expect(forNino).toContain("flemmatico");
    // and the one with a mood has it in his prompt
    expect(forUgo).toContain("ottimo umore");
  });

  it("holds the first round blind: nobody sees another answer before speaking", async () => {
    const { client, prompts } = recorder({ Ugo: "Sì", Nino: "No" });
    await new CouncilService({ db, local: client }).deliberate("Piove?", householdId);
    for (const prompt of prompts.slice(0, 2)) {
      expect(prompt).not.toContain("Gli altri hanno detto");
    }
  });

  it("lets them hear each other in the second round, and answer back", async () => {
    const { client, prompts } = recorder({
      Ugo: "Il fango è la cosa migliore del mondo.",
      Nino: "Il fango è sopravvalutato.",
    });
    const result = await new CouncilService({ db, local: client }).deliberate("Meglio il fango?", householdId);

    const second = prompts.filter((p) => p.includes("Gli altri hanno detto"));
    expect(second).toHaveLength(2);
    // each is shown the OTHER's words, and reminded of his own
    const ugoSecond = second.find((p) => p.includes("Sei Ugo"));
    expect(ugoSecond).toContain("Il fango è sopravvalutato.");
    expect(ugoSecond).toContain("Tu avevi risposto");
    expect(result.changedMind).toBe(true);
    expect(result.voices.every((v) => v.second !== undefined)).toBe(true);
  });

  it("leaves out whoever had nothing usable to say, instead of inventing for him", async () => {
    const { client } = recorder({ Ugo: "Direi di sì.", Nino: undefined });
    const result = await new CouncilService({ db, local: client }).deliberate("Tutto bene?", householdId);
    expect(result.voices.map((v) => v.name)).toEqual(["Ugo"]);
    // and with a single voice there is nothing to deliberate about
    expect(result.changedMind).toBe(false);
    expect(result.voices[0]?.second).toBeUndefined();
  });
});
