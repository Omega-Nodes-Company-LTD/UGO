import { desires, listItems, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, asc, eq } from "drizzle-orm";
import { addCheckin, MAX_CHECKINS, silenceCheckins, standingCheckins } from "../checkinService.js";
import { confirmList, type ListCommand } from "../volition/lists.js";
import { confirmCheckin, tellCheckins, type CheckinCommand } from "../volition/checkins.js";
import {
  answerTimer,
  confirmCancel,
  confirmTimer,
  type TimerCommand,
} from "../volition/timers.js";
import {
  confirmPostcard,
  tellNoTie,
  tellSendFailed,
  tellTieNotAccepted,
  type PostcardCommand,
} from "../volition/postcards.js";
import type { ParcelService } from "../parcelService.js";
import type { TieService } from "../tieService.js";

/**
 * I comandi della chat che **scrivono** (regola 10).
 *
 * Liste, domande ricorrenti, timer, cartoline: quattro cose che una frase
 * detta a voce fa succedere sul database. Stavano dentro `ChatService`, che è
 * un **centralino** — riconosce cosa è stata detta e decide chi risponde — e
 * mescolare il centralino con quello che i comandi fanno rendeva difficile
 * leggere l'unica cosa che in un centralino conta davvero: **l'ordine**.
 *
 * Tornano una **stringa** e non una risposta intera, di proposito: chi scrive
 * la biografia è uno solo (`recordExchange`), e un comando che se la scrivesse
 * da sé sarebbe la quinta copia di quella scrittura.
 */
export interface ChatCommandDeps {
  db: DbClient;
  dataKey: Buffer;
  accountId: string;
  gosinoId: string;
  /** ADR-099: assente = la cartolina risponde che non è partita, e lo dice */
  postcards?: { ties: TieService; parcels: ParcelService };
}

export class ChatCommands {
  public constructor(private readonly deps: ChatCommandDeps) {}

  /** Il testo cifrato, o una riga che dice di non essere leggibile. */
  private readable(value: string): string {
    try {
      return decryptText(value, this.deps.dataKey);
    } catch {
      return "";
    }
  }

  public async list(command: ListCommand, beingId: string | undefined, at: Date): Promise<string> {
    const { db, dataKey } = this.deps;
    const accountId = this.deps.accountId;
    let reply: string;

    if (command.action === "read") {
      const rows = await db
        .select({ text: listItems.text })
        .from(listItems)
        .where(
          and(
            eq(listItems.accountId, accountId),
            eq(listItems.list, command.list),
            eq(listItems.done, false),
          ),
        )
        .orderBy(listItems.at);
      reply = confirmList(
        command,
        rows.map((row) => this.readable(row.text)).filter((text) => text !== ""),
      );
    } else if (command.action === "add") {
      await db.insert(listItems).values({
        accountId,
        list: command.list,
        text: encryptText(command.item ?? "", dataKey),
        ...(beingId !== undefined && { beingId }),
      });
      reply = confirmList(command);
    } else {
      // spuntare: si cerca fra le righe aperte quella che combacia, e il
      // confronto avviene in chiaro perché il testo è cifrato a riposo
      const rows = await db
        .select({ id: listItems.id, text: listItems.text })
        .from(listItems)
        .where(
          and(
            eq(listItems.accountId, accountId),
            eq(listItems.list, command.list),
            eq(listItems.done, false),
          ),
        );
      const wanted = (command.item ?? "").toLowerCase();
      const hit = rows.find((row) => this.readable(row.text).toLowerCase().includes(wanted));
      if (hit !== undefined) {
        await db
          .update(listItems)
          .set({ done: true, doneAt: at })
          .where(eq(listItems.id, hit.id));
        reply = confirmList(command);
      } else {
        reply = `Non trovo ${command.item ?? ""} nella lista ${command.list}.`;
      }
    }

    return reply;
  }

  /**
   * ADR-085: mettere, spegnere, elencare le domande che tornano.
   *
   * Non tocca `desires`: qui si scrive la **regola**, e il desiderio lo
   * scriverà la sentinella quando sarà l'ora. Metterlo subito vorrebbe dire
   * che «ogni sera alle nove» comincia adesso, alle tre del pomeriggio.
   */
  public async checkin(command: CheckinCommand): Promise<string> {
    const { db, gosinoId } = this.deps;
    if (command.action === "cancel") {
      const off = await silenceCheckins(db, gosinoId);
      return off === 0
        ? "Non ti stavo chiedendo niente, comunque."
        : `Va bene, non te lo chiedo più. (${String(off)} ${off === 1 ? "domanda spenta" : "domande spente"})`;
    }
    if (command.action === "list") {
      return tellCheckins(await standingCheckins(db, gosinoId));
    }
    const added = await addCheckin(db, gosinoId, {
      question: command.question,
      hour: command.hour,
      minute: command.minute,
      weekday: command.weekday,
    });
    // il rifiuto dice il numero: «troppe» senza un numero è un muro senza
    // porta, e chi ascolta non sa cosa togliere
    return added === "troppe"
      ? `Ne ho già ${String(MAX_CHECKINS)} di cose da chiederti: se ne aggiungo altre divento una sveglia. Dimmi «non chiedermelo più» e ricominciamo.`
      : confirmCheckin(command);
  }

  /**
   * ADR-078: mettere, spegnere, chiedere. Un timer È un desiderio con un'ora
   * sopra — la tabella c'era già (ADR-028) — e quello che cambia è chi lo
   * legge: la sentinella del timer, che suona in orario, invece
   * dell'iniziativa, che sceglie il momento buono.
   */
  public async timer(command: TimerCommand, at: Date): Promise<string> {
    const { db } = this.deps;
    const mine = and(
      eq(desires.gosinoId, this.deps.gosinoId),
      eq(desires.kind, command.kind),
      eq(desires.status, "pending"),
    );

    if (command.action === "set") {
      // uno per volta, come una sveglia vera: metterne una seconda sostituisce
      // la prima invece di farne suonare due
      await db.update(desires).set({ status: "expired" }).where(mine);
      /**
       * Una sveglia «alle 7» suona alle 7:00:00. Contando dall'istante in cui
       * l'hai chiesta si portava dietro i suoi secondi e suonava alle 7:00:40:
       * un timer si conta da adesso, un'ora si legge sull'orologio.
       */
      const anchor =
        command.anchor === "orologio" ? new Date(Math.floor(at.getTime() / 60_000) * 60_000) : at;
      await db.insert(desires).values({
        gosinoId: this.deps.gosinoId,
        kind: command.kind,
        status: "pending",
        text: command.label,
        dueAt: new Date(anchor.getTime() + command.inSeconds * 1000),
      });
      return confirmTimer(command);
    }

    const [pending] = await db
      .select({ id: desires.id, text: desires.text, dueAt: desires.dueAt })
      .from(desires)
      .where(mine)
      .orderBy(asc(desires.dueAt))
      .limit(1);

    if (command.action === "cancel") {
      // `expired` e non `done`: un timer spento non è un timer che ha suonato
      if (pending !== undefined) {
        await db.update(desires).set({ status: "expired" }).where(eq(desires.id, pending.id));
      }
      return confirmCancel(command.kind, pending !== undefined);
    }

    const left =
      pending?.dueAt === undefined || pending.dueAt === null
        ? undefined
        : Math.max(0, (pending.dueAt.getTime() - at.getTime()) / 1000);
    return answerTimer(command.kind, left, pending?.text ?? "");
  }

  /**
   * Un gesto risolto in casa: la risposta è già decisa, e quello che resta è
   * la parte che non cambia mai — **lo scambio va in biografia cifrato come
   * ogni altro**. Era copiata cinque volte, una per gesto, e ogni gesto nuovo
   * ne avrebbe aggiunta una sesta: una scorciatoia sul costo non è una
   * scorciatoia sulla memoria, e questo metodo è dove quella promessa smette
   * di dipendere da chi copia bene.
   */
  public async postcard(command: PostcardCommand): Promise<string> {
    const post = this.deps.postcards;
    if (post === undefined) return tellSendFailed();
    const tie = await post.ties.tieByName(this.deps.accountId, command.recipient);
    if (tie === undefined) return tellNoTie(command.recipient);
    if (tie.status !== "accettata") return tellTieNotAccepted(command.recipient);
    const sent = await post.parcels.send(this.deps.accountId, {
      tieId: tie.id,
      fromGosinoId: this.deps.gosinoId,
      kind: command.kind,
      text: command.text,
    });
    if (typeof sent === "string") {
      return sent === "non-accettata" ? tellTieNotAccepted(command.recipient) : tellSendFailed();
    }
    return confirmPostcard(command, tie.otherName);
  }

  /** Il testo di una riga, o stringa vuota se la chiave non la apre. */
}
