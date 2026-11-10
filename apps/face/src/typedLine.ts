/**
 * Scrivergli (2026-11-09, dal proprietario: «se volessi scrivere non ho
 * modo»). Fino a ieri il muso aveva solo orecchie e una fotocamera: chi non
 * poteva parlare — in ufficio, di notte, col microfono negato — restava fuori.
 *
 * Una frase scritta è una frase detta a lui: niente cancello del nome
 * (ADR-111) e niente filtro dell'eco, che esistono per le orecchie. Esce
 * dalla stessa porta della voce (`heard_text` sul socket), quindi soul la
 * tratta come ogni altro turno: stessi ricordi, stesso umore, risposta a voce.
 */

/** lo stesso tetto del contratto (`faceToServerSchema`, heard_text) */
export const TYPED_MAX_CHARS = 2000;

/** Ripulisce quello che è stato scritto; `undefined` = non c'è niente da mandare. */
export function typedText(raw: string): string | undefined {
  const text = raw.replace(/\s+/gu, " ").trim();
  if (text === "") return undefined;
  return text.slice(0, TYPED_MAX_CHARS);
}

export function wireTypedLine(
  form: HTMLFormElement,
  input: HTMLInputElement,
  send: (text: string) => void,
): void {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = typedText(input.value);
    if (text === undefined) return;
    send(text);
    input.value = "";
  });
}
