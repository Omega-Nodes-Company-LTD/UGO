import { accounts, customerGosini, customers, gosini, type DbClient } from "@ugo/db";
import type { ChatLlm, LocalTtsClient } from "@ugo/memory";
import { and, asc, eq, isNull } from "drizzle-orm";
import { voiceOf } from "../../routes/tts.js";
import type { CustomerChatService, HouseClock } from "../reception/customerChatService.js";
import { phoneInstruction, recordCall } from "./phoneCalls.js";
import { callRefOf, contactEmailHash, handoverPhrase, readHandover } from "./phoneCrypto.js";
import type { CallMemory } from "./phoneMemory.js";

/**
 * Il gosino al telefono (ADR-128): un turno della chiamata.
 *
 * Parla il gosino della casa aziendale, con le regole della reception e MAI
 * coi ricordi di casa: chi chiama non è di famiglia. Se l'email del chiamante
 * è quella di un cliente della reception, risponde come risponderebbe a lui
 * per iscritto — con la sua conoscenza, i suoi muri di costo, i suoi turni
 * cifrati —; altrimenti risponde a uno sconosciuto, e di lui non resta niente
 * su disco.
 */

export interface PhoneTurnInput {
  callId: string;
  turn: number;
  text: string;
  language: "it" | "en";
  customerEmail?: string;
}

export interface PhoneTurnResult {
  text: string;
  audio?: Buffer;
  handover: boolean;
}

export interface PhoneServiceDeps {
  db: DbClient;
  dbFor?: (accountId: string) => DbClient;
  dataKey: Buffer;
  accountId: string;
  llmFor: (accountId: string, gosinoId: string, clock?: HouseClock) => ChatLlm;
  tts: LocalTtsClient & { usdPerChar(): Promise<number> };
  customerChat: CustomerChatService;
  memory: CallMemory;
}

export class PhoneService {
  public constructor(private readonly deps: PhoneServiceDeps) {}

  private get db(): DbClient {
    return this.deps.dbFor?.(this.deps.accountId) ?? this.deps.db;
  }

  public async turn(input: PhoneTurnInput, at: Date = new Date()): Promise<PhoneTurnResult> {
    const { accountId } = this.deps;
    const callRef = callRefOf(input.callId);
    const known = await this.recognize(input.customerEmail);
    const gosinoId = known?.gosinoId ?? (await this.eldest());

    let raw: string;
    let costUsd = 0;
    let degraded = false;
    try {
      if (known !== undefined) {
        const result = await this.deps.customerChat.handle(
          {
            context: { accountId, customerId: known.customerId, tokenId: "phone" },
            gosinoId,
            text: input.text,
            channel: "phone",
            instruction: phoneInstruction(input.language),
          },
          at,
        );
        raw = result.kind === "ok" ? result.reply : "";
        degraded = result.kind !== "ok" || result.degraded;
        costUsd = result.kind === "ok" ? (result.costUsd ?? 0) : 0;
      } else {
        const [house] = await this.db
          .select({ timezone: accounts.timezone, locale: accounts.locale })
          .from(accounts)
          .where(eq(accounts.id, accountId));
        const llm = this.deps.llmFor(accountId, gosinoId, house);
        const result = await llm.chat(
          {
            channel: "phone",
            dynamicSystem: phoneInstruction(input.language),
            history: this.deps.memory.history(callRef, at.getTime()),
            userText: input.text,
          },
          at,
        );
        raw = result.text;
        degraded = result.degraded;
        costUsd = result.costUsd ?? 0;
      }
    } catch {
      // OpenRouter giù: al telefono il silenzio è peggio di una persona
      raw = "";
    }

    const read = readHandover(raw);
    const handover = read.handover || degraded;
    const spoken = handover ? handoverPhrase(input.language) : read.text;
    if (known === undefined && !handover) {
      this.deps.memory.remember(callRef, input.text, spoken, at.getTime());
    }

    const audio = await this.deps.tts.synth(
      { text: spoken, voice: await voiceOf(this.db, gosinoId) },
      { accountId, gosinoId },
    );
    if (audio !== undefined) costUsd += spoken.length * (await this.deps.tts.usdPerChar());

    await recordCall(this.db, {
      accountId,
      callRef,
      gosinoId,
      customerId: known?.customerId,
      handover,
      costUsd,
      failed: raw === "",
      at,
    });
    return { text: spoken, ...(audio !== undefined && { audio }), handover };
  }

  /** Il cliente della reception con quell'email, e il suo gosino (ADR-128). */
  private async recognize(
    email: string | undefined,
  ): Promise<{ customerId: string; gosinoId: string } | undefined> {
    if (email === undefined) return undefined;
    const hash = contactEmailHash(this.deps.dataKey, email);
    const [row] = await this.db
      .select({ customerId: customers.id, gosinoId: gosini.id })
      .from(customers)
      .innerJoin(customerGosini, eq(customerGosini.customerId, customers.id))
      .innerJoin(gosini, eq(gosini.id, customerGosini.gosinoId))
      .where(
        and(
          eq(customers.accountId, this.deps.accountId),
          eq(customers.contactEmailHash, hash),
          isNull(customers.archivedAt),
          isNull(gosini.retiredAt),
        ),
      )
      .orderBy(asc(gosini.bornAt))
      .limit(1);
    return row;
  }

  private async eldest(): Promise<string> {
    const [row] = await this.db
      .select({ id: gosini.id })
      .from(gosini)
      .where(and(eq(gosini.accountId, this.deps.accountId), isNull(gosini.retiredAt)))
      .orderBy(asc(gosini.bornAt))
      .limit(1);
    if (row === undefined) throw new Error(`account ${this.deps.accountId} has no exemplar`);
    return row.id;
  }
}
