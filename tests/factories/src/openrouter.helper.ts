/**
 * La chiave per i test che parlano col fornitore VERO (ADR-125: niente stub).
 * Obbligatoria: un test che salta quando manca la chiave è un test che non
 * gira mai, e sembra verde.
 */
export function openRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (key === undefined || key === "") {
    throw new Error("OPENROUTER_API_KEY is required: these tests call the real provider (ADR-125)");
  }
  return key;
}

/** Un modello che OpenRouter rifiuta con un 4xx vero: «il fornitore non risponde». */
export const REFUSED_MODEL = "ugo/this-model-does-not-exist";
