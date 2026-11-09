import { phoneCalls, type DbClient } from "@ugo/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { HANDOVER_MARKER } from "./phoneCrypto.js";

/** Tre mesi di numeri, poi via: anche i soli numeri di una chiamata sono tracce (ADR-128). */
export const CALL_RETENTION_DAYS = 90;

/**
 * L'istruzione del telefono, nel blocco DINAMICO: il prefisso cached resta
 * quello della reception, byte per byte (regola 2).
 */
export function phoneInstruction(language: "it" | "en"): string {
  const tongue = language === "en" ? "in inglese" : "in italiano";
  return (
    `Sei AL TELEFONO con una persona che non è di casa. Rispondi ${tongue}, in una-tre frasi ` +
    "brevi da dire a voce: niente elenchi, niente simboli, niente markdown, niente link. Non " +
    "hai ricordi di casa da usare e non devi parlarne. Se non sai rispondere con certezza, o " +
    `la richiesta va gestita da una persona, comincia la risposta con ${HANDOVER_MARKER}.`
  );
}

export interface CallTurnRecord {
  accountId: string;
  callRef: string;
  gosinoId: string;
  customerId: string | undefined;
  handover: boolean;
  costUsd: number;
  /** il modello non ha risposto affatto: non un passaggio scelto, un guasto */
  failed: boolean;
  at: Date;
}

/** Un turno in più sulla riga della chiamata, e la pulizia oltre la conservazione. */
export async function recordCall(db: DbClient, turn: CallTurnRecord): Promise<void> {
  const outcome = turn.failed ? "failed" : turn.handover ? "handover" : "answered";
  await db
    .insert(phoneCalls)
    .values({
      accountId: turn.accountId,
      gosinoId: turn.gosinoId,
      callRef: turn.callRef,
      ...(turn.customerId !== undefined && { customerId: turn.customerId }),
      startedAt: turn.at,
      lastTurnAt: turn.at,
      turns: 1,
      handovers: turn.handover ? 1 : 0,
      costUsd: turn.costUsd.toFixed(6),
      outcome,
    })
    .onConflictDoUpdate({
      target: [phoneCalls.accountId, phoneCalls.callRef],
      set: {
        lastTurnAt: turn.at,
        turns: sql`${phoneCalls.turns} + 1`,
        handovers: sql`${phoneCalls.handovers} + ${turn.handover ? 1 : 0}`,
        costUsd: sql`${phoneCalls.costUsd} + ${turn.costUsd.toFixed(6)}`,
        outcome,
      },
    });
  const cutoff = new Date(turn.at.getTime() - CALL_RETENTION_DAYS * 86_400_000);
  await db
    .delete(phoneCalls)
    .where(and(eq(phoneCalls.accountId, turn.accountId), lt(phoneCalls.startedAt, cutoff)));
}
