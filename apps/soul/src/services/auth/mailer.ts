/**
 * Le mail di UGO (ADR-124), via Resend. Una sola cosa da mandare oggi: il
 * link d'accesso. L'indirizzo non finisce mai in un log: se Resend rifiuta,
 * si scrive lo stato, non a chi.
 */

export interface MailerOptions {
  apiKey: string;
  from: string;
  baseUrl?: string | undefined;
  logger?: { warn: (data: Record<string, unknown>, message: string) => void };
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<boolean>;
}

export class ResendMailer implements Mailer {
  public constructor(private readonly options: MailerOptions) {}

  public async send(mail: Mail): Promise<boolean> {
    try {
      const response = await fetch(new URL("/emails", this.options.baseUrl ?? "https://api.resend.com"), {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [mail.to],
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.options.logger?.warn({ status: response.status }, "resend refused the mail");
        return false;
      }
      return true;
    } catch {
      this.options.logger?.warn({}, "resend unreachable");
      return false;
    }
  }
}

/** Escape per la parte HTML della mail: l'unico dato variabile è il link. */
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

export function loginMail(to: string, link: string, purpose: "signup" | "login"): Mail {
  const action = purpose === "signup" ? "completare l'iscrizione" : "entrare";
  const subject = purpose === "signup" ? "Benvenuto in UGO: conferma la tua email" : "Il tuo link per entrare in UGO";
  const text =
    `Ciao!\n\nPer ${action} apri questo link entro 15 minuti:\n${link}\n\n` +
    "Se non sei stato tu, ignora questa mail: senza il link non succede niente.\n\n— UGO 🐷";
  const html =
    `<p>Ciao!</p><p>Per ${action} apri questo link <b>entro 15 minuti</b>:</p>` +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    "<p>Se non sei stato tu, ignora questa mail: senza il link non succede niente.</p><p>— UGO</p>";
  return { to, subject, text, html };
}
