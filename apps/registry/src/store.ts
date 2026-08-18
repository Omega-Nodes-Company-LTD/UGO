import {
  actHash,
  entryHash,
  genesisPrevHash,
  signEntry,
  type Act,
  type ChainEntry,
} from "@ugo/shared";
import type { Sql } from "postgres";

/**
 * Il libro genealogico su disco (ADR-073).
 *
 * Un database suo, separato da quello delle anime: un registro che vive dove
 * vivono le creature non è un dominio di fiducia separato, e allora non
 * garantisce niente che non fosse già garantito da chi possiede quel database.
 *
 * L'append-only qui non è una convenzione: la tabella non ha UPDATE né DELETE
 * concessi al ruolo dell'applicazione, e ogni voce porta l'hash della
 * precedente. Riscrivere il passato richiederebbe di riscrivere tutto il
 * seguito — e le teste già viste dai testimoni non tornerebbero comunque.
 */

/**
 * Cosa finisce davvero in catena, campo per campo.
 *
 * Serializzazione **esplicita** e non `JSON.parse(JSON.stringify(...))`: lo
 * «schema chiuso» promesso dall'ADR-073 va imposto qui, al confine di
 * scrittura, o basterebbe un campo aggiunto a monte perché qualcosa che non
 * deve stare su un registro pubblico ci finisca senza che nessuno lo decida.
 */
type ActField = string | number | undefined;
type ActPayload = Readonly<Record<string, ActField | readonly Readonly<Record<string, ActField>>[]>>;

function actPayload(act: Act): ActPayload {
  return {
    kind: act.kind,
    gosinoId: act.gosinoId,
    genomeHash: act.genomeHash,
    at: act.at,
    ...(act.generation !== undefined && { generation: act.generation }),
    // ADR-082: la custodia. Lasciarli fuori dallo schema chiuso non li avrebbe
    // «protetti»: li avrebbe fatti sparire fra ciò che si firma e ciò che si
    // rilegge, e la catena si sarebbe dichiarata alterata da sola
    ...(act.fromHash !== undefined && { fromHash: act.fromHash }),
    ...(act.toHash !== undefined && { toHash: act.toHash }),
    ...(act.parents !== undefined && {
      parents: act.parents.map((parent) => ({
        gosinoId: parent.gosinoId,
        publicKey: parent.publicKey,
        signature: parent.signature,
      })),
    }),
  };
}

export interface WitnessedHead {
  registrar: string;
  seq: number;
  hash: string;
  seenAt: Date;
}

export class ChainStore {
  public constructor(
    private readonly sql: Sql,
    private readonly registrarPrivateKey: Buffer,
  ) {}

  public async migrate(): Promise<void> {
    await this.sql`
      create table if not exists chain_entries (
        seq bigint primary key,
        prev_hash text not null,
        act_hash text not null,
        hash text not null unique,
        act jsonb not null,
        registrar_signature text not null,
        appended_at timestamptz not null default now()
      )`;
    /**
     * Un atto per esemplare e tipo — ma **solo per nascita e morte**: si nasce
     * una volta e si muore una volta, e una seconda nascita dello stesso
     * gosino è esattamente ciò che il registro esiste per rendere visibile.
     *
     * ADR-082: i **trasferimenti no**. Una creatura può cambiare mano più
     * volte nella vita, e l'indice unico di prima le avrebbe permesso una sola
     * rivendita — cioè avrebbe reso il mercato secondario impossibile per un
     * dettaglio d'implementazione. La doppia vendita si vede in un altro modo,
     * e migliore: la catena della custodia (v. `holderOf`).
     */
    await this.sql`drop index if exists chain_entries_act_uq`;
    await this.sql`
      create unique index if not exists chain_entries_once_uq
        on chain_entries ((act->>'gosinoId'), (act->>'kind'))
       where act->>'kind' in ('birth', 'death')`;
    await this.sql`
      create table if not exists witnessed_heads (
        registrar text not null,
        seq bigint not null,
        hash text not null,
        seen_at timestamptz not null default now(),
        primary key (registrar, seq)
      )`;
  }

  public async head(): Promise<{ seq: number; hash: string } | undefined> {
    const rows = await this.sql<{ seq: string; hash: string }[]>`
      select seq, hash from chain_entries order by seq desc limit 1`;
    const row = rows[0];
    return row === undefined ? undefined : { seq: Number(row.seq), hash: row.hash };
  }

  /**
   * Appende un atto. Restituisce la voce, o `undefined` se quell'atto c'è già
   * — presentare due volte la stessa nascita non è un errore da urlare, è una
   * richiesta a cui il registro ha già risposto.
   */
  public async append(act: Act): Promise<ChainEntry | undefined> {
    return this.sql.begin(async (tx) => {
      // il lock serializza gli appendi: due nascite simultanee non devono
      // ottenere lo stesso `seq` e spezzare la catena
      await tx`select pg_advisory_xact_lock(hashtext('ugo-chain'))`;

      // ADR-082: solo nascita e morte sono irripetibili. Un trasferimento si
      // ripete per definizione — una creatura può cambiare mano più volte —
      // e la sua unicità è quella dell'atto intero, non della coppia
      const existing =
        act.kind === "transfer"
          ? await tx<{ seq: string }[]>`
              select seq from chain_entries where act_hash = ${actHash(act)}`
          : await tx<{ seq: string }[]>`
              select seq from chain_entries
               where act->>'gosinoId' = ${act.gosinoId} and act->>'kind' = ${act.kind}`;
      if (existing.length > 0) return undefined;

      const last = await tx<{ seq: string; hash: string }[]>`
        select seq, hash from chain_entries order by seq desc limit 1`;
      const prev = last[0];
      const seq = prev === undefined ? 1 : Number(prev.seq) + 1;
      const prevHash = prev?.hash ?? genesisPrevHash();
      const hashOfAct = actHash(act);
      const hash = entryHash(seq, prevHash, hashOfAct);
      const registrarSignature = signEntry(hash, this.registrarPrivateKey);

      await tx`
        insert into chain_entries (seq, prev_hash, act_hash, hash, act, registrar_signature)
        values (${seq}, ${prevHash}, ${hashOfAct}, ${hash},
                ${tx.json(actPayload(act))}, ${registrarSignature})`;
      return { seq, prevHash, actHash: hashOfAct, hash, act, registrarSignature };
    });
  }

  public async entries(from = 1, limit = 200): Promise<ChainEntry[]> {
    const rows = await this.sql<
      {
        seq: string;
        prev_hash: string;
        act_hash: string;
        hash: string;
        act: Act;
        registrar_signature: string;
      }[]
    >`
      select seq, prev_hash, act_hash, hash, act, registrar_signature
        from chain_entries where seq >= ${from} order by seq asc limit ${Math.min(limit, 1000)}`;
    return rows.map((row) => ({
      seq: Number(row.seq),
      prevHash: row.prev_hash,
      actHash: row.act_hash,
      hash: row.hash,
      act: row.act,
      registrarSignature: row.registrar_signature,
    }));
  }

  /** Gli atti che riguardano una creatura: il suo pedigree, pubblicamente. */
  public async actsFor(gosinoId: string): Promise<ChainEntry[]> {
    const rows = await this.sql<{ seq: string }[]>`
      select seq from chain_entries where act->>'gosinoId' = ${gosinoId} order by seq asc`;
    const entries: ChainEntry[] = [];
    for (const row of rows) {
      const [one] = await this.entries(Number(row.seq), 1);
      if (one !== undefined) entries.push(one);
    }
    return entries;
  }

  /**
   * Chi ha in custodia questa creatura, secondo la catena (ADR-082).
   *
   * `undefined` = non è mai stata ceduta. Non è la stessa cosa di «non ha un
   * proprietario»: la prima cessione parte da un allevamento che il registro
   * non ha mai visto dichiarare, e va bene — quello che il registro sa fare è
   * **seguire la catena da lì in poi**, e accorgersi se qualcuno la spezza.
   */
  public async holderOf(gosinoId: string): Promise<string | undefined> {
    const rows = await this.sql<{ to: string | null }[]>`
      select act->>'toHash' as to from chain_entries
       where act->>'gosinoId' = ${gosinoId} and act->>'kind' = 'transfer'
       order by seq desc limit 1`;
    return rows[0]?.to ?? undefined;
  }

  /** Se questa creatura è **nata**: senza atto di nascita non si cede (ADR-081). */
  public async wasBorn(gosinoId: string): Promise<boolean> {
    const rows = await this.sql<{ seq: string }[]>`
      select seq from chain_entries
       where act->>'gosinoId' = ${gosinoId} and act->>'kind' = 'birth' limit 1`;
    return rows.length > 0;
  }

  /**
   * La testa vista da un altro registrar (il gossip di Certificate
   * Transparency): se un registro riscrivesse la sua storia, le teste che
   * altri hanno già osservato non tornerebbero. È ciò che rende l'append-only
   * una proprietà **osservabile** invece che una promessa.
   */
  public async witness(registrar: string, seq: number, hash: string): Promise<void> {
    await this.sql`
      insert into witnessed_heads (registrar, seq, hash) values (${registrar}, ${seq}, ${hash})
      on conflict (registrar, seq) do nothing`;
  }

  public async witnesses(): Promise<WitnessedHead[]> {
    const rows = await this.sql<
      { registrar: string; seq: string; hash: string; seen_at: Date }[]
    >`select registrar, seq, hash, seen_at from witnessed_heads order by seen_at desc limit 100`;
    return rows.map((row) => ({
      registrar: row.registrar,
      seq: Number(row.seq),
      hash: row.hash,
      seenAt: row.seen_at,
    }));
  }
}
