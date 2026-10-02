import { accountLogins, loginLinks, withAccount, withMarket, type DbClient } from "@ugo/db";
import { decryptText, encryptText } from "@ugo/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createAccount } from "../accountService.js";
import { accountKey } from "../ai/keyring.js";
import type { AuditLogger } from "../auditLog.js";
import { loginMail, type Mail, type Mailer } from "./mailer.js";
import { digest, keyed, newSecret, normalizeEmail } from "./secrets.js";

/**
 * Il link d'accesso (ADR-124): niente password, niente tabella `users`.
 *
 * Chi chiede un link riceve SEMPRE la stessa risposta: che l'indirizzo abbia
 * un account o no lo sa solo chi legge quella casella. Il link vale quindici
 * minuti e una volta sola — l'uso è un `UPDATE … WHERE used_at IS NULL`
 * atomico, così due clic contemporanei non aprono due porte.
 *
 * All'iscrizione l'account nasce QUANDO il link viene usato, non quando viene
 * chiesto: un indirizzo scritto male non lascia case vuote dietro di sé.
 */

const LINK_MINUTES = 15;

export interface LinkDeps {
  db: DbClient;
  masterKey: Buffer;
  /** il pepe delle email (`pepperFrom(masterKey, "email")`) */
  emailPepper: Buffer;
  mailer: Mailer;
  /** dove vive il sito: il link punta qui */
  publicUrl: string;
  termsVersion: string;
  audit?: AuditLogger | undefined;
}

export type LinkPurpose = "signup" | "login";

/** Chiede un link. Non dice mai se l'indirizzo è conosciuto. */
export async function requestLink(
  deps: LinkDeps,
  input: { email: string; purpose: LinkPurpose },
  now: Date = new Date(),
): Promise<void> {
  const email = normalizeEmail(input.email);
  const emailHash = keyed(deps.emailPepper, email);
  const [known] = await deps.db
    .select({ id: accountLogins.id })
    .from(accountLogins)
    .where(eq(accountLogins.emailHash, emailHash));

  // chi si iscrive di nuovo riceve un link per entrare; chi entra senza un
  // account riceve l'invito a iscriversi — mai un errore a chi ha chiesto
  if (known === undefined && input.purpose === "login") {
    await deps.mailer.send(strangerMail(email, deps.publicUrl));
    return;
  }
  const purpose: LinkPurpose = known === undefined ? "signup" : "login";
  const token = newSecret();
  const [link] = await deps.db
    .insert(loginLinks)
    .values({
      tokenHash: digest(token),
      emailHash,
      emailEnc: encryptText(email, deps.masterKey),
      purpose,
      termsVersion: purpose === "signup" ? deps.termsVersion : null,
      expiresAt: new Date(now.getTime() + LINK_MINUTES * 60_000),
      createdAt: now,
    })
    .returning({ id: loginLinks.id });
  const url = new URL("/auth/verifica", deps.publicUrl);
  url.searchParams.set("t", token);
  await deps.mailer.send(loginMail(email, url.toString(), purpose));
  await deps.audit?.record({ verb: "login_link_sent", outcome: "ok", resourceType: "login_link", resourceId: link?.id });
}

function strangerMail(to: string, publicUrl: string): Mail {
  const signup = new URL("/registrati", publicUrl).toString();
  return {
    to,
    subject: "Nessun account UGO con questo indirizzo",
    text:
      "Ciao!\n\nQualcuno ha chiesto di entrare in UGO con questo indirizzo, ma non c'è un account.\n" +
      `Se vuoi crearne uno: ${signup}\n\nSe non sei stato tu, ignora questa mail.\n\n— UGO`,
    html:
      "<p>Ciao!</p><p>Qualcuno ha chiesto di entrare in UGO con questo indirizzo, ma non c'è un account.</p>" +
      `<p>Se vuoi crearne uno: <a href="${signup}">${signup}</a></p>` +
      "<p>Se non sei stato tu, ignora questa mail.</p><p>— UGO</p>",
  };
}

export interface Admitted {
  accountId: string;
  loginId: string;
  /** l'account è nato adesso: il pannello apre l'accoglienza */
  created: boolean;
}

/** Usa un link. undefined se è scaduto, già usato o mai esistito. */
export async function consumeLink(
  deps: LinkDeps,
  token: string,
  now: Date = new Date(),
): Promise<Admitted | undefined> {
  if (token === "") return undefined;
  const [link] = await deps.db
    .update(loginLinks)
    .set({ usedAt: now })
    .where(and(eq(loginLinks.tokenHash, digest(token)), isNull(loginLinks.usedAt), gt(loginLinks.expiresAt, now)))
    .returning();
  if (link === undefined) return undefined;

  const [login] = await deps.db
    .select({ id: accountLogins.id, accountId: accountLogins.accountId })
    .from(accountLogins)
    .where(eq(accountLogins.emailHash, link.emailHash));
  if (login !== undefined) return { accountId: login.accountId, loginId: login.id, created: false };
  // un link «entra» il cui account è stato chiuso nel frattempo non fonda niente
  if (link.purpose !== "signup" || link.termsVersion === null) return undefined;

  const email = decryptText(link.emailEnc, deps.masterKey);
  const termsVersion = link.termsVersion;
  const born = await withMarket(deps.db, async (tx) => {
    const house = await createAccount(tx, deps.masterKey, {
      slug: `casa-${newSecret().slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
      name: "La mia casa",
      ownerToken: false,
    });
    // l'email entra con la DEK della casa appena nata: muore con lei
    const dek = await accountKey(tx, house.accountId, deps.masterKey);
    const [row] = await tx
      .insert(accountLogins)
      .values({
        accountId: house.accountId,
        emailHash: link.emailHash,
        emailEnc: encryptText(email, dek),
        role: "owner",
        consentedAt: now,
        termsVersion,
      })
      .returning({ id: accountLogins.id });
    if (row === undefined) throw new Error("login not written");
    return { accountId: house.accountId, loginId: row.id };
  });
  // ADR-062: una riga attribuita a una casa si scrive dentro la casa
  const audit = deps.audit;
  if (audit !== undefined) {
    await withAccount(deps.db, born.accountId, (tx) =>
      audit.record(
        { verb: "account_created", outcome: "ok", accountId: born.accountId, resourceType: "account", resourceId: born.accountId },
        tx,
      ),
    );
  }
  return { ...born, created: true };
}
