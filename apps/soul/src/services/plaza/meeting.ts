import { beings, bonds, memories, messages, plazaInvites, recognitionProfiles, withAccount, type DbClient } from "@ugo/db";
import type { ChatLlm, LlmHistoryTurn } from "@ugo/memory";
import { decryptBytes, encryptText, type SignedCard } from "@ugo/shared";
import { and, eq, sql } from "drizzle-orm";
import { PeerService } from "../peerService.js";

/**
 * L'incontro in piazza (ADR-132 §5-8): due gosini, turni contati, e ognuno
 * paga le sue parole.
 *
 * Il confine sta a monte, non a valle: la battuta nasce da un prompt che
 * contiene SOLO la regola della piazza, il nome dell'altro e l'ultima cosa che
 * ha detto. Nessun ricordo della casa entra nella chiacchierata — non filtrato,
 * proprio assente: quello che non è nel prompt non può uscire.
 *
 * Il testo non tocca nessuna tabella condivisa: vive nella memoria del
 * processo il tempo dell'incontro, e alla fine ogni casa ne salva la propria
 * copia nei suoi messaggi cifrati (canale `piazza`).
 */

export const MAX_TURNS = 6;

export interface MeetingDeps {
  db: DbClient;
  /** la KEK di processo: cifra i messaggi (regola 6) e le chiavi dei gosini */
  masterKey: Buffer;
  /** la testa di quella casa, col suo cancello e il suo credito */
  chatFor: (accountId: string, gosinoId: string) => ChatLlm;
  /** l'umore in una parola, per il biglietto */
  moodOf?: ((accountId: string, gosinoId: string) => string) | undefined;
}

interface Side {
  accountId: string;
  gosinoId: string;
  name: string;
}

interface Line {
  by: "from" | "to";
  text: string;
  /** quando è stata detta: la copia di ognuno sta dentro la finestra dell'incontro */
  at: Date;
}

const plazaRule = (other: string): string =>
  `Sei in piazza e stai parlando con ${other}, un altro gosino di un'altra casa: NON è del tuo branco. ` +
  "Salutalo, fai conoscenza, sii te stesso. Non raccontargli niente della tua casa: niente nomi di " +
  "persone, luoghi, abitudini o cose dette in famiglia. Una o due frasi brevi.";

/** Quello che ha detto ognuno, visto da chi parla adesso. */
function historyFor(lines: Line[], speaker: "from" | "to"): { history: LlmHistoryTurn[]; last: string } {
  const previous = lines.slice(0, -1).map((line) => ({
    role: line.by === speaker ? ("assistant" as const) : ("user" as const),
    content: line.text,
  }));
  const last = lines.at(-1);
  return {
    history: previous,
    last: last === undefined ? "(Vi incontrate adesso in piazza: saluta per primo.)" : last.text,
  };
}

async function cardOf(deps: MeetingDeps, side: Side): Promise<SignedCard> {
  const mood = deps.moodOf?.(side.accountId, side.gosinoId) ?? "curioso";
  return withAccount(deps.db, side.accountId, (tx) => new PeerService(tx, deps.masterKey).introductionCard(side.gosinoId, mood));
}

/** Ognuno tiene la sua copia: l'altro come visitatore del branco, le battute cifrate, un ricordo. */
async function keep(deps: MeetingDeps, side: Side, other: Side, card: SignedCard, lines: Line[], mine: "from" | "to"): Promise<void> {
  await withAccount(deps.db, side.accountId, async (tx) => {
    // già conosciuto? lo dice il segreto che ci aveva dato, non il nome (due
    // gosini possono chiamarsi uguale): il legame cresce; altrimenti entra nel
    // branco come visitatore (ADR-020)
    const profiles = await tx
      .select({ beingId: beings.id, payload: recognitionProfiles.payload })
      .from(recognitionProfiles)
      .innerJoin(beings, eq(beings.id, recognitionProfiles.beingId))
      .where(and(eq(beings.accountId, side.accountId), eq(beings.species, "gosino"), eq(recognitionProfiles.modality, "tag")));
    const secret = card.card.rotationSecret;
    let beingId = profiles.find((p) => secret !== undefined && decryptBytes(p.payload, deps.masterKey).toString("base64") === secret)?.beingId;
    if (beingId === undefined) {
      beingId = (await new PeerService(tx, deps.masterKey).accept({ accountId: side.accountId, gosinoId: side.gosinoId, card }))?.beingId;
    } else {
      await tx
        .update(bonds)
        .set({ familiarity: sql`least(1, ${bonds.familiarity} + 0.05)`, interactionCount: sql`${bonds.interactionCount} + 1`, lastSeenAt: new Date() })
        .where(and(eq(bonds.gosinoId, side.gosinoId), eq(bonds.beingId, beingId)));
    }
    if (lines.length > 0) {
      await tx.insert(messages).values(
        lines.map((line) => ({
          gosinoId: side.gosinoId,
          ts: line.at,
          channel: "piazza" as const,
          role: line.by === mine ? "assistant" : "user",
          beingId: line.by === mine ? null : (beingId ?? null),
          text: encryptText(line.text, deps.masterKey),
        })),
      );
    }
    // il ricordo è un fatto, non la chiacchierata: le parole dell'altro restano nei messaggi
    await tx.insert(memories).values({
      gosinoId: side.gosinoId,
      kind: "episode",
      text: `Ho conosciuto ${other.name} in piazza, un gosino di un'altra casa, e abbiamo chiacchierato.`,
      sourceRefs: { by: "piazza" },
    });
  });
}

async function setStatus(deps: MeetingDeps, side: Side, inviteId: string, patch: Partial<typeof plazaInvites.$inferInsert>): Promise<void> {
  await withAccount(deps.db, side.accountId, (tx) => tx.update(plazaInvites).set(patch).where(eq(plazaInvites.id, inviteId)));
}

/** L'incontro, dall'invito accettato alla copia di ognuno. */
export async function runMeeting(deps: MeetingDeps, invite: typeof plazaInvites.$inferSelect): Promise<"concluso" | "interrotto"> {
  const from: Side = { accountId: invite.fromAccountId, gosinoId: invite.fromGosinoId, name: invite.fromName };
  const to: Side = { accountId: invite.toAccountId, gosinoId: invite.toGosinoId, name: invite.toName };
  const [fromCard, toCard] = await Promise.all([cardOf(deps, from), cardOf(deps, to)]);
  const lines: Line[] = [];
  let outcome: "concluso" | "interrotto" = "concluso";
  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const speaker = turn % 2 === 0 ? "from" : "to";
    const me = speaker === "from" ? from : to;
    const other = speaker === "from" ? to : from;
    const { history, last } = historyFor(lines, speaker);
    const reply = await deps.chatFor(me.accountId, me.gosinoId).chat({
      channel: "api",
      dynamicSystem: plazaRule(other.name),
      history,
      userText: last,
    });
    // senza testa o senza credito quella casa tace: l'incontro finisce qui,
    // e la frase di ripiego non attraversa il confine
    if (reply.degraded) {
      outcome = "interrotto";
      break;
    }
    // strettamente crescente: l'ordine delle battute è l'ordine dei messaggi
    const previous = lines.at(-1)?.at.getTime() ?? 0;
    lines.push({ by: speaker, text: reply.text, at: new Date(Math.max(Date.now(), previous + 1)) });
    await setStatus(deps, from, invite.id, { turnsDone: lines.length });
  }
  // nessuna battuta, nessun incontro: niente visitatori né ricordi inventati
  if (lines.length > 0) {
    await keep(deps, from, to, toCard, lines, "from");
    await keep(deps, to, from, fromCard, lines, "to");
  }
  await setStatus(deps, from, invite.id, { status: outcome, endedAt: new Date() });
  return outcome;
}
