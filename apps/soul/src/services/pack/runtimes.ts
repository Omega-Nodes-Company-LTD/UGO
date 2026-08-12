import { gosini, traitSets, type DbClient } from "@ugo/db";
import type { EmbeddingsClient, LlmClient, LocalTextClient } from "@ugo/memory";
import { desc, eq, isNull } from "drizzle-orm";
import { ChatService } from "../chatService.js";
import { characterFrom, type Character } from "../council/character.js";
import { FaceGateway } from "../faceGateway.js";
import type { PackService } from "../packService.js";
import { PsycheService } from "../psycheService.js";
import { Curiosity } from "../volition/curiosity.js";
import { VolitionService } from "../volition/volitionService.js";

/**
 * One runtime per exemplar (ADR-032).
 *
 * Everything that makes an exemplar himself — mood, memories, thread, diary,
 * initiative, the body he speaks through — used to be a single instance built
 * once at boot. Two gosini in one house were therefore one creature with two
 * names: the same psyche answering from two rooms.
 *
 * Now each one gets his own, and the registry is what a socket asks when it
 * says which of them it wants to be.
 *
 * What is deliberately NOT per exemplar: the household. The pack, the data
 * key, the budget and the clock belong to the house (ADR-019), and two
 * creatures under one roof must agree about who lives there.
 */

export interface GosinoRuntime {
  id: string;
  name: string;
  /** "cucina", "studio" — how a device asks for this one by hand */
  where: string | undefined;
  character: Character;
  psyche: PsycheService;
  gateway: FaceGateway;
  volition: VolitionService;
  chat: ChatService;
}

export interface RuntimeDeps {
  db: DbClient;
  embedder: EmbeddingsClient;
  llm: LlmClient;
  local: LocalTextClient;
  dataKey: Buffer;
  timezone: string;
  pack?: PackService;
  localModelUp: () => boolean;
  initiativeEnabled: () => boolean;
  hourOf: (at: Date) => number;
}

/** Builds the whole apparatus for one exemplar. */
async function buildRuntime(
  deps: RuntimeDeps,
  row: { id: string; name: string; where: string | null },
): Promise<GosinoRuntime> {
  const traits = await deps.db
    .select({ traits: traitSets.traits })
    .from(traitSets)
    .where(eq(traitSets.gosinoId, row.id))
    .orderBy(desc(traitSets.version))
    .limit(1);
  const character = characterFrom(traits[0]?.traits);

  const psyche = await PsycheService.restore(deps.db, new Date(), row.id);
  const chat = new ChatService({
    db: deps.db,
    embedder: deps.embedder,
    llm: deps.llm,
    psyche,
    dataKey: deps.dataKey,
    timezone: deps.timezone,
    gosinoId: row.id,
    ...(deps.pack !== undefined && { pack: deps.pack }),
  });
  const gateway = new FaceGateway({ db: deps.db, psyche, chat, gosinoId: row.id });
  const volition = new VolitionService({
    db: deps.db,
    gosinoId: row.id,
    psyche,
    gateway,
    curiosity: new Curiosity({
      db: deps.db,
      local: deps.local,
      dataKey: deps.dataKey,
      name: row.name,
      gosinoId: row.id,
      persona: character.persona,
    }),
    localModelUp: deps.localModelUp,
    enabled: deps.initiativeEnabled,
    hourOf: deps.hourOf,
  });

  return {
    id: row.id,
    name: row.name,
    where: row.where ?? undefined,
    character,
    psyche,
    gateway,
    volition,
    chat,
  };
}

export class GosinoRegistry {
  private readonly byId = new Map<string, GosinoRuntime>();
  /** the one a device gets when it does not ask for anybody in particular */
  private defaultId: string | undefined;

  private constructor(private readonly deps: RuntimeDeps) {}

  public static async load(deps: RuntimeDeps): Promise<GosinoRegistry> {
    const registry = new GosinoRegistry(deps);
    await registry.reload();
    return registry;
  }

  /** Rebuilds from the database — called at boot and after a birth. */
  public async reload(): Promise<void> {
    const rows = await this.deps.db
      .select({ id: gosini.id, name: gosini.name, where: gosini.locationLabel })
      .from(gosini)
      .where(isNull(gosini.retiredAt))
      .orderBy(gosini.bornAt);
    for (const row of rows) {
      if (this.byId.has(row.id)) continue;
      this.byId.set(row.id, await buildRuntime(this.deps, row));
    }
    // the eldest is the default: on a device that names nobody, the exemplar
    // that has always been there is the one that answers
    this.defaultId ??= rows[0]?.id;
  }

  public all(): GosinoRuntime[] {
    return [...this.byId.values()];
  }

  /**
   * Finds an exemplar by id, by name or by the room he lives in — the three
   * things a person would plausibly type into a URL. Unknown names fall back
   * to the default rather than refusing to show anything: a mistyped query
   * string must not leave a dock with a blank screen.
   */
  public resolve(query: string | undefined): GosinoRuntime | undefined {
    if (query !== undefined && query !== "") {
      const wanted = query.trim().toLowerCase();
      const found = this.all().find(
        (runtime) =>
          runtime.id === query ||
          runtime.name.toLowerCase() === wanted ||
          runtime.where?.toLowerCase() === wanted,
      );
      if (found !== undefined) return found;
    }
    return this.defaultId === undefined ? this.all()[0] : this.byId.get(this.defaultId);
  }
}
