import { z } from "zod";

/**
 * Local vision through Ollama (`/api/generate` with `images`).
 *
 * Il secondo taglio della visione (gruppo 12): un modello vision locale —
 * moondream, llava, qwen-vl, quel che il server regge — trasforma uno
 * sguardo della camera in UNA frase. Come `localText`, deliberatamente NON
 * dentro `LlmClient`: quel guardiano ferma i soldi verso il provider
 * (regola 3), e questo non costa niente. Condivide la disciplina: timeout
 * duro, uscita corta, e chi chiama sopravvive al modello assente.
 *
 * L'immagine arriva, viene descritta, e finisce lì: questo client non salva
 * niente da nessuna parte — la persistenza di uno sguardo è una decisione
 * che non gli appartiene, e infatti nessuno l'ha presa.
 */

const generateResponseSchema = z.object({ response: z.string() });

export interface LocalVisionClient {
  /** una frase, o undefined se il modello è assente: mai un'eccezione */
  describe(imageBase64: string): Promise<string | undefined>;
  available(): Promise<boolean>;
}

const PROMPT =
  "Descrivi questa scena in UNA frase breve in italiano, come la racconterebbe " +
  "un maialino curioso che guarda la stanza. Solo la frase, niente altro.";

export class OllamaVisionClient implements LocalVisionClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs = 60_000,
  ) {}

  public async available(): Promise<boolean> {
    try {
      const response = await fetch(new URL("/api/tags", this.baseUrl), {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { models?: { name: string }[] };
      return (body.models ?? []).some((m) => m.name.startsWith(this.model.split(":")[0] ?? ""));
    } catch {
      return false;
    }
  }

  public async describe(imageBase64: string): Promise<string | undefined> {
    try {
      const response = await fetch(new URL("/api/generate", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: PROMPT,
          images: [imageBase64],
          stream: false,
          options: { num_predict: 60, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) return undefined;
      const parsed = generateResponseSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const text = parsed.data.response.trim();
      return text.length === 0 ? undefined : text;
    } catch {
      // irraggiungibile, scaduto, non scaricato: lo sguardo resta uno sguardo
      return undefined;
    }
  }
}
