/**
 * La porta del «modello di casa»: un testo breve da un prompt solo, per il
 * giudice, l'iniziativa, il cantastorie, il consiglio e la ruminazione.
 *
 * Il nome è storico (ADR-027, quando era Ollama). ADR-131: l'implementazione
 * è `OpenRouterTextClient`, dietro il varco a budget. Il contratto non cambia:
 * una frase o `undefined`, mai un'eccezione — chi chiama ha sempre un ripiego.
 */
export interface GenerateOptions {
  temperature?: number;
}

export interface LocalTextClient {
  generate(
    prompt: string,
    maxTokens?: number,
    options?: GenerateOptions,
  ): Promise<string | undefined>;
  available(): Promise<boolean>;
}
