import { messages, type DbClient } from "@ugo/db";
import { encryptText } from "@ugo/shared";

/**
 * La biografia: l'unico posto che scrive uno scambio.
 *
 * Le due righe — quella di chi ha parlato e quella di UGO — erano copiate in
 * più punti di `ChatService`, ognuno con la sua idea di cosa mettere: il
 * `beingId` solo sulla riga dell'utente, il secondo timestamp spostato di un
 * millesimo perché l'ordine regga, il costo solo dove c'era un provider. Copie
 * così non divergono subito: divergono al primo campo nuovo, che qualcuno
 * aggiunge in tre strade su quattro — ed è un difetto che si vede in
 * produzione e non nei test, perché ogni strada presa da sola funziona.
 *
 * Regola 6: append-only e testo cifrato a riposo, mai contenuti nei log.
 */
export interface ExchangeOwner {
  gosinoId: string;
  dataKey: Buffer;
}

/** I canali del prodotto: la biografia non ne conosce altri (schema `messages`). */
export type Channel = (typeof messages.$inferInsert)["channel"];

export interface Exchange {
  channel: Channel;
  /** chi ha parlato, quando si sa: sta sulla riga dell'utente e su nessun'altra */
  beingId?: string | null;
  at: Date;
  said: string;
  replied: string;
  /** presente solo quando ha risposto un provider a pagamento */
  spent?: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
}

/**
 * Il millesimo di secondo fra le due righe non è un dettaglio estetico: la
 * cronologia si ordina per `ts`, e due righe con lo stesso istante possono
 * tornare invertite — UGO che risponde prima che gli si parli.
 */
const REPLY_OFFSET_MS = 1;

export async function recordExchange(
  db: DbClient,
  owner: ExchangeOwner,
  exchange: Exchange,
): Promise<void> {
  const { gosinoId, dataKey } = owner;
  /**
   * Il tipo è dichiarato invece di essere dedotto: con lo spread condizionale
   * del costo TypeScript deduce un'unione di due forme diverse, e l'overload
   * dell'insert a più righe non la accetta.
   */
  const rows: (typeof messages.$inferInsert)[] = [
    {
      gosinoId,
      ts: exchange.at,
      channel: exchange.channel,
      role: "user",
      beingId: exchange.beingId ?? null,
      text: encryptText(exchange.said, dataKey),
    },
    {
      gosinoId,
      ts: new Date(exchange.at.getTime() + REPLY_OFFSET_MS),
      channel: exchange.channel,
      role: "assistant",
      text: encryptText(exchange.replied, dataKey),
      ...(exchange.spent !== undefined && {
        tokensIn: exchange.spent.tokensIn,
        tokensOut: exchange.spent.tokensOut,
        costUsd: exchange.spent.costUsd.toFixed(6),
      }),
    },
  ];
  await db.insert(messages).values(rows);
}
