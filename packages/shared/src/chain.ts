import { createHash, createPublicKey, sign, verify } from "node:crypto";

/**
 * Il libro genealogico (ADR-073): un log append-only con collegamento a hash e
 * voci firmate — il modello Certificate Transparency, non una criptovaluta.
 *
 * Sta in `shared` perché lo usano **entrambe le parti**: chi scrive la catena
 * e chi la verifica. Un registro che si può controllare solo col codice di chi
 * lo tiene non è un registro: è un database con delle pretese.
 */

/** Cosa può essere registrato. Schema chiuso: ciò che non è qui non entra. */
export const ACT_KINDS = ["birth", "death", "transfer"] as const;
export type ActKind = (typeof ACT_KINDS)[number];

/**
 * Il contenuto di un atto. **Mai** ricordi, nomi di persone, voci, volti,
 * posizione o proprietario: sulla catena non c'è nessuno da dimenticare, ed è
 * per questo che l'oblio GDPR non la tocca (ADR-069/070/073).
 */
export interface Act {
  kind: ActKind;
  /** l'esemplare di cui si parla */
  gosinoId: string;
  /** l'impronta del genoma alla nascita */
  genomeHash: string;
  /** i genitori, ordinati, con la firma di ciascuno sull'atto di nascita */
  parents?: { gosinoId: string; publicKey: string; signature: string }[];
  /** ISO-8601, dichiarato da chi presenta l'atto */
  at: string;
  generation?: number;
}

export interface ChainEntry {
  seq: number;
  prevHash: string;
  actHash: string;
  hash: string;
  act: Act;
  /** la firma del registrar sulla voce: dice CHI l'ha messa in catena */
  registrarSignature: string;
}

const GENESIS_PREV_HASH = "0".repeat(64);

export const genesisPrevHash = (): string => GENESIS_PREV_HASH;

function canonicalJson(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(6) : "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function actHash(act: Act): string {
  return createHash("sha256").update(canonicalJson(act), "utf8").digest("hex");
}

/** hash = SHA-256(seq ‖ prevHash ‖ actHash): il legame che rende la catena una catena. */
export function entryHash(seq: number, prevHash: string, hashOfAct: string): string {
  return createHash("sha256")
    .update(`${String(seq)}|${prevHash}|${hashOfAct}`, "utf8")
    .digest("hex");
}

export function signEntry(hash: string, registrarPrivateKey: Buffer): string {
  return sign(null, Buffer.from(hash, "utf8"), {
    key: registrarPrivateKey,
    format: "der",
    type: "pkcs8",
  }).toString("base64");
}

export function verifyEntrySignature(entry: ChainEntry, registrarPublicKey: Buffer): boolean {
  try {
    const key = createPublicKey({ key: registrarPublicKey, format: "der", type: "spki" });
    return verify(
      null,
      Buffer.from(entry.hash, "utf8"),
      key,
      Buffer.from(entry.registrarSignature, "base64"),
    );
  } catch {
    return false;
  }
}

export type ChainProblem =
  | { seq: number; reason: "sequenza-non-contigua" }
  | { seq: number; reason: "anello-rotto" }
  | { seq: number; reason: "atto-alterato" }
  | { seq: number; reason: "firma-del-registrar-non-valida" };

/**
 * Cammina la catena e dice cosa non torna. Vuota = tutto regge.
 *
 * `registrarPublicKey` è facoltativa: senza, si verificano i legami (che
 * nessuno abbia riscritto la storia) ma non chi l'ha scritta. Con, si verifica
 * anche quello — ed è il controllo che un compratore fa davvero.
 */
export function verifyChain(
  entries: readonly ChainEntry[],
  registrarPublicKey?: Buffer,
): ChainProblem[] {
  const problems: ChainProblem[] = [];
  let expectedPrev = GENESIS_PREV_HASH;
  let expectedSeq = entries[0]?.seq ?? 1;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      problems.push({ seq: entry.seq, reason: "sequenza-non-contigua" });
    }
    // il primo pezzo esaminato può essere in mezzo alla catena: si accetta il
    // suo prevHash come punto di partenza e si controllano i legami DA LÌ
    if (expectedSeq !== entries[0]?.seq && entry.prevHash !== expectedPrev) {
      problems.push({ seq: entry.seq, reason: "anello-rotto" });
    }
    if (actHash(entry.act) !== entry.actHash) {
      problems.push({ seq: entry.seq, reason: "atto-alterato" });
    }
    if (entryHash(entry.seq, entry.prevHash, entry.actHash) !== entry.hash) {
      problems.push({ seq: entry.seq, reason: "anello-rotto" });
    }
    if (registrarPublicKey !== undefined && !verifyEntrySignature(entry, registrarPublicKey)) {
      problems.push({ seq: entry.seq, reason: "firma-del-registrar-non-valida" });
    }
    expectedPrev = entry.hash;
    expectedSeq = entry.seq + 1;
  }
  return problems;
}
