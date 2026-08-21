import { randomInt } from "node:crypto";
import { games, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, eq, isNull } from "drizzle-orm";
import {
  GAME_STALE_HOURS,
  HIGH,
  judge,
  LOW,
  moveOf,
  tellAlreadyPlaying,
  tellGaveUp,
  tellStart,
} from "./volition/guessGame.js";

/**
 * La partita, dal lato che tocca il database (ADR-112).
 *
 * Tre regole, e sono tutte e tre la stessa regola guardata da tre lati:
 *
 * 1. **il segreto non entra mai in un prompt** — a giudicare è `judge`, che è
 *    un confronto fra due interi;
 * 2. **il segreto è cifrato a riposo** come ogni altro contenuto (regola 6):
 *    chi legge il database non gioca in vantaggio;
 * 3. **il numero lo tira `randomInt`** e non `Math.random`: è la stessa
 *    funzione che il progetto usa per le chiavi, e un gioco indovinabile
 *    conoscendo l'ora di inizio non è un gioco.
 */
export interface GameDeps {
  db: DbClient;
  accountId: string;
  gosinoId: string;
  dataKey: Buffer;
}

export class GameService {
  public constructor(private readonly deps: GameDeps) {}

  /**
   * La risposta alla mossa, o `undefined` se la frase non era una mossa — e
   * allora la conversazione prosegue come sempre.
   */
  public async answer(text: string, at: Date = new Date()): Promise<string | undefined> {
    const open = await this.open(at);
    const move = moveOf(text, open !== undefined);

    if (move.move === "none") return undefined;

    if (move.move === "start") {
      if (open !== undefined) return tellAlreadyPlaying();
      await this.deps.db.insert(games).values({
        accountId: this.deps.accountId,
        gosinoId: this.deps.gosinoId,
        secret: encryptText(String(randomInt(LOW, HIGH + 1)), this.deps.dataKey),
        startedAt: at,
        lastAt: at,
      });
      return tellStart();
    }

    if (open === undefined) return undefined;

    if (move.move === "give-up") {
      await this.close(open.id, at);
      return tellGaveUp(open.secret, open.turns);
    }

    const turns = open.turns + 1;
    const verdict = judge(open.secret, move.number, turns);
    if (verdict.over) {
      await this.close(open.id, at, turns);
    } else {
      await this.deps.db
        .update(games)
        .set({ turns, lastAt: at })
        .where(eq(games.id, open.id));
    }
    return verdict.reply;
  }

  /**
   * La partita aperta, se ce n'è una e se è ancora viva.
   *
   * Una lasciata a metà **scade** invece di restare aperta per sempre: senza,
   * un numero pensato a marzo trasformerebbe ogni cifra detta a giugno in un
   * tentativo. Scade leggendo, non con un giro notturno: è il momento in cui
   * la differenza si vede, e un passo del sogno per questo sarebbe lavoro
   * inventato.
   */
  private async open(
    at: Date,
  ): Promise<{ id: string; secret: number; turns: number } | undefined> {
    const [row] = await this.deps.db
      .select({
        id: games.id,
        secret: games.secret,
        turns: games.turns,
        lastAt: games.lastAt,
      })
      .from(games)
      .where(
        and(
          eq(games.gosinoId, this.deps.gosinoId),
          eq(games.accountId, this.deps.accountId),
          isNull(games.endedAt),
        ),
      );
    if (row === undefined) return undefined;

    const staleAfterMs = GAME_STALE_HOURS * 3_600_000;
    if (at.getTime() - row.lastAt.getTime() > staleAfterMs) {
      await this.close(row.id, at);
      return undefined;
    }
    try {
      const secret = Number.parseInt(decryptText(row.secret, this.deps.dataKey), 10);
      if (!Number.isInteger(secret)) throw new Error("segreto illeggibile");
      return { id: row.id, secret, turns: row.turns };
    } catch {
      // chiave ruotata, o riga manomessa: la partita si chiude invece di
      // rispondere «più alto» rispetto a un numero che non c'è
      await this.close(row.id, at);
      return undefined;
    }
  }

  private async close(id: string, at: Date, turns?: number): Promise<void> {
    await this.deps.db
      .update(games)
      .set({ endedAt: at, lastAt: at, ...(turns !== undefined && { turns }) })
      .where(eq(games.id, id));
  }
}
