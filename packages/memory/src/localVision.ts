/**
 * La porta della visione: una foto diventa UNA frase.
 *
 * Il nome è storico (gruppo 12, quando gli occhi erano un modello su Ollama).
 * ADR-131: l'implementazione è `OpenRouterVisionClient`, dietro il varco a
 * budget. Il contratto non cambia: chi chiama sopravvive al modello assente,
 * e questa porta non salva niente da nessuna parte.
 */
export interface LocalVisionClient {
  /** una frase, o undefined se il modello non risponde: mai un'eccezione */
  describe(imageBase64: string): Promise<string | undefined>;
  available(): Promise<boolean>;
}
