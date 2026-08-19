/**
 * Dove guardare, nel sistema di riferimento del corpo — PURO.
 *
 * Il difetto che questo file chiude: lo sguardo arrivava in coordinate di
 * schermo e finiva così com'era dentro `computePose`, mentre il corpo intanto
 * ruotava (`inhabitant.ts`: `pig.object.rotation.y = loco.heading`). In tutto
 * `body/` non c'era **un solo riferimento a `heading`** dal lato dello sguardo:
 * il collo è relativo al corpo, quindi «guarda a destra dello schermo»
 * diventava «guarda a destra del muso», cioè da tutt'altra parte non appena il
 * muso non era già rivolto verso di te.
 *
 * La conversione è una sottrazione di angoli, e sta qui invece che dentro
 * `computePose` perché `computePose` non sa dov'è il corpo — e non deve
 * saperlo: riceve una posa, non una scena.
 */

/**
 * Quanto vale `gaze.x = 1` in radianti.
 *
 * È metà del campo orizzontale della camera del telefono (~65°): una faccia sul
 * bordo del fotogramma è a ~0.55 rad dall'asse. Non è la camera della scena
 * (32°), che inquadra il maiale e non te.
 */
export const VIEWER_SPREAD = 0.55;

/**
 * Quanto gira il collo, in radianti (~24°).
 *
 * Piccolo di proposito: oltre, la testa esce dalla silhouette del corpo e si
 * vede che è un pezzo attaccato. Il resto lo fanno gli occhi, che è anche ciò
 * che fa un animale vero.
 */
export const NECK_LIMIT = 0.42;

/** Quanti radianti coprono le pupille oltre il collo (~34°). */
export const PUPIL_SPAN = 0.6;

/**
 * Oltre questo angolo sei dietro di lui e non ti vede (~126°).
 *
 * Serve, o le pupille resterebbero incollate al bordo dell'occhio mentre lui
 * guarda dall'altra parte: uno strabismo permanente, che è peggio di uno
 * sguardo che non ti segue perché sembra rotto invece che spento.
 */
export const OUT_OF_SIGHT = 2.2;

export interface Attention {
  /** rotazione della testa sul collo, in radianti, relativa al corpo */
  yaw: number;
  /** quanto scorrono le pupille, [-1,1], per ciò che il collo non copre */
  pupil: number;
  /** falso quando il bersaglio gli è dietro le spalle: allora guarda avanti */
  sees: boolean;
}

const AHEAD: Attention = { yaw: 0, pupil: 0, sees: false };

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * @param gazeX  dove sta il bersaglio, [-1,1], dove 1 è {@link VIEWER_SPREAD}
 *               radianti alla sua destra. `null` = non c'è nessuno da guardare.
 * @param heading dove è girato il corpo, in radianti; 0 = verso la camera.
 */
export function attentionOf(gazeX: number | null, heading: number): Attention {
  if (gazeX === null || !Number.isFinite(gazeX) || !Number.isFinite(heading)) return AHEAD;
  // dove sta il bersaglio nel mondo, meno dove è girato lui: quel che resta è
  // di quanto deve girare la testa
  const relative = wrapAngle(gazeX * VIEWER_SPREAD - heading);
  if (Math.abs(relative) > OUT_OF_SIGHT) return AHEAD;
  const yaw = clamp(relative, -NECK_LIMIT, NECK_LIMIT);
  return { yaw, pupil: clamp((relative - yaw) / PUPIL_SPAN, -1, 1), sees: true };
}
