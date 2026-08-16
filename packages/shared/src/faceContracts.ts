import { z } from "zod";
import { PROP_KINDS } from "./props.js";

/** WS `/v1/face` contract (PROGETTO §5.7). Zod on both directions. */

export const FACE_STATES = [
  "sleeping",
  "idle",
  "alert",
  "listening",
  "thinking",
  "talking",
] as const;
export type FaceState = (typeof FACE_STATES)[number];

/**
 * Glyph LED patterns (§4.1). Kept as a closed set so soul and the face agree
 * on meaning; the face degrades silently when the device has no Glyph SDK.
 */
export const GLYPH_PATTERNS = ["sleep", "alert", "listening", "thinking", "talking", "rec"] as const;
export type GlyphPattern = (typeof GLYPH_PATTERNS)[number];

/** Which pattern belongs to which face state (rec is driven separately). */
export const GLYPH_FOR_STATE: Readonly<Record<FaceState, GlyphPattern | undefined>> = {
  sleeping: "sleep",
  idle: undefined,
  alert: "alert",
  listening: "listening",
  thinking: "thinking",
  talking: "talking",
};

/** face → server */
export const faceToServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heard_text"),
    text: z.string().min(1).max(2000),
    /**
     * ADR-045: la voce che ha detto la frase, PCM int16 a 16 kHz in base64.
     *
     * Facoltativa perché il riconoscimento è facoltativo: un corpo senza
     * microfono aperto, o una casa che non vuole la biometria, manda solo il
     * testo e tutto continua a funzionare.
     *
     * Il tetto è aritmetica, non un numero tondo: a 16 kHz (`SAMPLE_RATE` in
     * `ops/voice/app.py`) tre secondi di int16 sono 96 000 byte, cioè 128 000
     * caratteri di base64. 200 000 lascia margine e resta molto sotto quanto
     * servirebbe per ricostruire una conversazione da questo campo. Un corpo
     * che spedisse al ritmo nativo del microfono ne produrrebbe 384 000 e
     * verrebbe rifiutato qui — è successo, e per mesi in silenzio: il
     * ricampionamento sta in `apps/face/src/voiceClip.ts`.
     */
    audio: z.string().max(200_000).optional(),
  }),
  z.object({
    type: z.literal("face_seen"),
    /**
     * ADR-057: il ritaglio del volto, RGB uint8 112×112 in base64 — la misura
     * esatta che `decode_face` vuole.
     *
     * Facoltativo, come `audio` su `heard_text` e per la stessa ragione: un
     * corpo senza camera, o una casa che non vuole la biometria del volto,
     * manda `face_seen` nudo e tutto continua a funzionare.
     *
     * Il tetto è aritmetica: 112×112×3 sono 37 632 byte, cioè 50 176 caratteri
     * di base64. 56 000 lascia margine e rifiuta qualunque cosa non sia un
     * ritaglio — **e il corpo il rettangolo ce l'aveva già in mano da sempre**
     * (`faceLocator.ts`), e teneva solo i due centri buttando via il resto.
     */
    image: z.string().max(56_000).optional(),
  }),
  z.object({ type: z.literal("light"), lux: z.number().min(0) }),
  /**
   * ADR-056 (gruppo 10): il botto, e chi era al riparo quando è arrivato.
   *
   * `sheltered` elenca i `who` delle creature che in quel momento stanno
   * dietro un riparo: per loro il colpo di stress arriva **attutito** — un
   * nascondiglio che non protegge da niente è scenografia, non un riparo.
   * È una lista e non un booleano perché il frame è della STANZA: in una
   * stanza di due, uno è dietro il cespuglio e l'altro no. La casa a
   * esemplare solo senza registro manda `[""]`, che è il suo `who` di
   * sempre. Assente = nessuno al riparo, cioè il frame di prima, intatto.
   */
  z.object({
    type: z.literal("noise"),
    db: z.number().min(0),
    sheltered: z.array(z.string().max(64)).max(8).optional(),
    /**
     * 2026-08-16: la stanza è DICHIARATA rumorosa (sensibilità «bassa» sul
     * chiosco). Un botto che passa comunque il cancello lì dentro pesa metà
     * (`loud_noise_muffled`, la famiglia di ADR-056): in un'officina i
     * fracassi sono parte della vita, e un maiale che ci vive non deve
     * passare la giornata col cuore a mille.
     */
    roomLoud: z.boolean().optional(),
  }),
  z.object({ type: z.literal("tap") }),
  z.object({ type: z.literal("shake") }),
  /**
   * Gruppo 12: il corpo ha riconosciuto una COSA davanti alla camera —
   * EfficientDet on-device, il video non esce mai. `kind` è la categoria in
   * snake_case («apple», «teddy_bear»), mai un'immagine: al registro degli
   * eventi interessa che ha visto una mela, non la foto della mela.
   */
  z.object({ type: z.literal("seen_object"), kind: z.string().min(1).max(24) }),
  /**
   * Gruppo 12, il secondo taglio della visione: uno sguardo della stanza,
   * chiesto da soul (`glimpse_ask`) e MAI spontaneo — un corpo che manda
   * immagini quando vuole è una telecamera di sorveglianza, non un paio
   * d'occhi. JPEG 320×240 in base64 (~15-25k caratteri; il tetto lascia
   * margine), descritto dal modello locale e mai scritto da nessuna parte.
   */
  z.object({ type: z.literal("glimpse"), image: z.string().min(1).max(120_000) }),
  /**
   * ADR-058: la mela. Un premio deliberato, e non un tocco qualunque.
   *
   * Il bersaglio è il **muso**, non tutta la tela: `tap` è la carezza e arriva
   * ovunque, questo arriva solo se hai mirato. Un premio che si dà per sbaglio
   * non è un premio, e la differenza fra i due è tutta lì.
   *
   * `act` è l'id dell'iniziativa che si sta premiando. Il **muso non lo manda**,
   * ed è voluto: quale iniziativa UGO abbia appena preso lo sa soul, che l'ha
   * decisa e scritta in `events`, e farlo tracciare anche al corpo sarebbe una
   * seconda copia della stessa verità da tenere allineata a mano. Il campo
   * esiste per chi *sa* cosa sta premiando — il pannello, quando premia una
   * riga precisa del registro delle iniziative.
   */
  z.object({
    type: z.literal("reward"),
    act: z.string().min(1).max(40).optional(),
  }),
  /**
   * ADR-056: è andato a usare un arredo, e ce n'è andato **da solo**.
   *
   * Lo manda il corpo perché è il corpo a deciderlo: la scelta di avvicinarsi
   * al cuscino è locale e costa zero token (ADR-026 §6), e l'anima non ha modo
   * di saperlo se non glielo si dice. `kind` e non l'id del piazzamento: alla
   * psiche interessa *che cosa* ha fatto, e un id di riga nel prompt sarebbe
   * un numero senza significato.
   */
  z.object({
    type: z.literal("used_prop"),
    kind: z.string().min(1).max(24),
    /**
     * **Quale** creatura ci è andata. È l'unico frame che sale portando un
     * `who`, e non è simmetria per bellezza: i sensi appartengono alla stanza
     * e una frase la dice chi risponde, ma andare sul cuscino lo fa **uno**, e
     * in una stanza di due, senza questo campo, il sollievo dalla noia finirebbe
     * a caso su uno dei due. Assente in una casa a esemplare solo, dove `who`
     * non ha mai significato niente (`tagFor`).
     */
    who: z.string().max(64).optional(),
  }),
  // ADR-030: which body he is in right now. Until this existed UGO could ask
  // to go out and never find out that he had been taken.
  z.object({ type: z.literal("mode"), mode: z.enum(["home", "portable"]) }),
  /**
   * ADR-057, il pezzo mancante: la voce, registrata dal chiosco.
   *
   * Sale SOLO in risposta a un `enroll_voice` recente: soul tiene aperta la
   * richiesta per una finestra breve (`VOICE_ASK_WINDOW_MIN`) e fuori da
   * quella il frame viene ignorato — un corpo che può depositare biometria
   * quando vuole non è un corpo, è un registratore abusivo.
   *
   * Il tetto è aritmetica, come per `audio` su `heard_text`: dieci secondi di
   * webm/opus a voce (la stessa ricetta del pannello, ~2-4 kB/s) sono
   * 20-40 000 byte, cioè al massimo ~54 000 caratteri di base64. 120 000
   * lascia margine per microfoni loquaci e rifiuta qualunque cosa non sia
   * un clip di arruolamento.
   */
  z.object({
    type: z.literal("voice_sample"),
    beingId: z.uuid(),
    audio: z.string().min(1).max(120_000),
  }),
]);
export type FaceToServerMessage = z.infer<typeof faceToServerSchema>;

/**
 * server → face
 *
 * ADR-036: every frame carries `who`, because a socket is attached to a ROOM
 * and a room can hold more than one creature. Without it a body could not tell
 * which of the two just sighed. Optional, so a single-creature house — and any
 * face built before rooms existed — keeps working untouched.
 */
export const serverToFaceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mood"),
    label: z.string(),
    vars: z.record(z.string(), z.number()),
    who: z.string().optional(),
  }),
  /**
   * `murmur` (gruppo 12): parla nel sonno. La nuvoletta appare e il registro
   * ricorda, ma il TTS NON parte — un borbottio notturno che sveglia la casa
   * non è un borbottio, è una sveglia. Assente = la frase di sempre, a voce.
   */
  z.object({
    type: z.literal("speak"),
    text: z.string(),
    who: z.string().optional(),
    murmur: z.boolean().optional(),
  }),
  z.object({ type: z.literal("state"), state: z.enum(FACE_STATES), who: z.string().optional() }),
  z.object({ type: z.literal("glyph"), pattern: z.enum(GLYPH_PATTERNS), who: z.string().optional() }),
  // ADR-027: soul decides an initiative, the body performs it. The id is a
  // gesture from the body's own catalogue; a face that does not know it
  // ignores it rather than failing — the decision must never depend on the
  // renderer that happens to be running.
  z.object({ type: z.literal("gesture"), id: z.string().min(1).max(64), who: z.string().optional() }),
  // ADR-032: which exemplar answered this socket. A device that asked for
  // "cucina" and got the default has to be able to tell.
  z.object({ type: z.literal("whoami"), name: z.string().min(1).max(40), who: z.string().optional() }),
  // ADR-036: who lives in the room this socket is attached to. The body draws
  // one creature per entry, so this arrives before anything else.
  /**
   * ADR-056: cosa c'è nella stanza, oltre a chi ci vive.
   *
   * Arriva all'apertura del socket **e a scena aperta** ogni volta che il
   * proprietario sposta qualcosa: senza la spinta dovrebbe ricaricare il
   * chiosco dopo ogni modifica, e un pannello che sembra non fare niente
   * finché non ricarichi è un pannello che si legge come rotto.
   *
   * Sostituisce sempre tutto l'arredamento invece di mandare differenze: la
   * lista è di al massimo otto oggetti, e uno stato completo non può andare
   * fuori sincrono — che è l'unico modo in cui questo potrebbe fallire in
   * silenzio.
   */
  z.object({
    type: z.literal("scene"),
    props: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(PROP_KINDS),
        x: z.number().min(-1).max(1),
        z: z.number().min(-1).max(1),
        rot: z.number(),
      }),
    ),
  }),
  /**
   * ADR-057, il pezzo mancante: «fatti sentire la voce».
   *
   * Parte quando un volto ignoto viene rivendicato dal pannello: UGO ha
   * appena imparato la faccia di `name`, e chiede — dal chiosco, dove la
   * persona sta davvero — di parlargli, così dopo la riconosce anche senza
   * vederla. Il corpo mostra un invito temporaneo; se nessuno lo tocca entro
   * la finestra, scade e non se ne fa niente.
   */
  z.object({
    type: z.literal("enroll_voice"),
    beingId: z.string(),
    name: z.string().min(1).max(80),
    who: z.string().optional(),
  }),
  /** gruppo 12: «fammi dare un'occhiata» — il corpo risponde con un `glimpse`
   * se la camera è accesa, e con niente se non lo è: lo sguardo si chiede.
   * `fine` (ADR-065): uno sguardo a 640px per LEGGERE — l'OCR su 320px vede
   * macchie, non lettere. Stesso tetto sul frame di risposta: il corpo cala
   * la qualità JPEG finché ci sta. */
  z.object({ type: z.literal("glimpse_ask"), fine: z.boolean().optional() }),
  z.object({
    type: z.literal("roster"),
    room: z.string().optional(),
    gosini: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(40),
        traits: z.record(z.string(), z.number()).optional(),
      }),
    ),
  }),
]);
export type ServerToFaceMessage = z.infer<typeof serverToFaceSchema>;

/** Local-reaction thresholds shared by face (zero-token logic) and soul. */
/**
 * Kept as documentation of what "loud" means physically, but no longer a
 * decision: since ADR-029 the startle is judged by the body against the
 * room's own learned floor, because an uncalibrated phone microphone with
 * automatic gain control makes an absolute number meaningless.
 */
export const NOISE_ALERT_DB = 80;
export const DARKNESS_LUX = 10;
export const NIGHT_START_HOUR = 22;
