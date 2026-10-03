import type { PayPalClient } from "./paypal.js";

/**
 * Gli accessori del webhook di PayPal. Il `custom_id` porta `<scopo>:<account>[:<riferimento>]`: come i
 * metadati di Stripe, dice al webhook di che casa è l'evento senza cercarla
 * fra le case.
 */
export function customId(purpose: string, accountId: string, ref?: string): string {
  return ref === undefined ? `${purpose}:${accountId}` : `${purpose}:${accountId}:${ref}`;
}

export function parseCustomId(value: unknown): { purpose: string; accountId: string; ref?: string } | undefined {
  if (typeof value !== "string") return undefined;
  const [purpose, accountId, ref] = value.split(":");
  if (purpose === undefined || accountId === undefined || accountId === "") return undefined;
  return { purpose, accountId, ...(ref !== undefined && { ref }) };
}

/** La firma del webhook la verifica PayPal: noi gli giriamo gli header e l'evento. */
export async function verifyPayPalWebhook(
  client: PayPalClient,
  headers: Record<string, string | string[] | undefined>,
  event: unknown,
): Promise<boolean> {
  const header = (name: string): string => {
    const value = headers[name];
    return typeof value === "string" ? value : "";
  };
  try {
    const answer = await client.call<{ verification_status?: string }>(
      "POST",
      "/v1/notifications/verify-webhook-signature",
      {
        auth_algo: header("paypal-auth-algo"),
        cert_url: header("paypal-cert-url"),
        transmission_id: header("paypal-transmission-id"),
        transmission_sig: header("paypal-transmission-sig"),
        transmission_time: header("paypal-transmission-time"),
        webhook_id: client.webhookId,
        webhook_event: event,
      },
    );
    return answer.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}
