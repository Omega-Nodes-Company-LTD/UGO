import { z } from "zod";

/**
 * L'unica strada da cui soul manda un'email (ADR-127): Resend, una POST.
 *
 * Il corpo dell'email non finisce mai nel log (regola 6): se Resend rifiuta,
 * si scrive lo stato e basta.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<boolean>;
}

const sentSchema = z.object({ id: z.string() });

export class ResendMailer implements Mailer {
  public constructor(
    private readonly options: {
      apiKey: string;
      from: string;
      logger?: { warn: (data: Record<string, unknown>, message: string) => void };
    },
  ) {}

  public async send(message: MailMessage): Promise<boolean> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from: this.options.from, ...message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.options.logger?.warn({ status: response.status }, "resend refused the email");
        return false;
      }
      return sentSchema.safeParse(await response.json()).success;
    } catch {
      this.options.logger?.warn({}, "resend unreachable");
      return false;
    }
  }
}

/** L'email del link: corta, in italiano, e dice cosa fare se non l'hai chiesta tu. */
export function loginEmail(link: string): Omit<MailMessage, "to"> {
  return {
    subject: "Entra in UGO",
    text:
      `Per entrare in UGO apri questo link entro 15 minuti:\n\n${link}\n\n` +
      "Vale una volta sola. Se non l'hai chiesto tu, ignora questa email: senza il link non entra nessuno.",
    html:
      `<p>Per entrare in UGO apri questo link entro 15 minuti:</p>` +
      `<p><a href="${link}">Entra in UGO</a></p>` +
      `<p>Vale una volta sola. Se non l'hai chiesto tu, ignora questa email: senza il link non entra nessuno.</p>`,
  };
}
