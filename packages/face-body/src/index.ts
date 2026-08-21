/**
 * Il corpo di UGO, in un package suo (backlog gruppo 15).
 *
 * Stava dentro `apps/face`, che è il chiosco: quindi il porcello 3D esisteva
 * solo dove gira quell'app, e la reception — che è **una nostra stanza** e non
 * un sito qualunque — poteva mostrare al cliente al massimo un'icona.
 *
 * Qui non c'è niente di nuovo: sono gli stessi file, spostati. La parte sporca
 * (`main.ts`, i sensori, il microfono, il WebSocket) **resta nel chiosco**,
 * perché è del chiosco: un package condiviso che aprisse un microfono sarebbe
 * un package che nessun altro può montare.
 *
 * L'export è volutamente **stretto**: quello che serve a montare un corpo e
 * fargli fare una faccia. Il resto è dentro, e chi lo importava dal chiosco lo
 * importa per cammino — così la superficie condivisa resta piccola e la si può
 * cambiare senza rompere due app.
 */
export { createFace, type CreateFaceOptions } from "./createFace.js";
export { Canvas2dFace, type GazeTarget } from "./renderer.js";
export { Pig, DEFAULT_TRAITS, type Traits } from "./pig.js";
export { Webgl3dFace, type Webgl3dOptions } from "./renderer3d.js";
export type { FaceRenderer } from "./faceRenderer.js";
export { computePose, NEUTRAL_VARS, type PsycheVars } from "./pose.js";
export { GESTURES, GESTURE_BY_ID, type GestureSpec } from "./gestures.js";
/**
 * La mappa dei riflessi: `reflex("noise")` non è il nome di un gesto, è il
 * nome di uno **stimolo**, e questa dice quale gesto ne segue. Esce perché il
 * chiosco chiama `reflex()` per nome, e senza la mappa un test che verifica
 * quei nomi contro il catalogo dei gesti boccerebbe le chiamate giuste.
 */
export { REFLEX } from "./autonomy.js";

/**
 * E questi li usa il chiosco: il cielo (che il muso guarda dal suo `skyWatch`)
 * e le posture (che il banco elenca). Stanno qui perché sono del corpo — la
 * stanza è del corpo, e la postura pure — e ci arriva chi li usa, senza che il
 * chiosco debba conoscere i cammini interni del package.
 */
export {
  moonPhase,
  moonPosition,
  sunAltitude,
  visiblePlanets,
} from "./ephemeris.js";
export type { SkyState, SkyWeather } from "./room3d.js";
export { POSTURES, POSTURE_IT, type Posture } from "./channels.js";
export { GruntSound, gruntShouldSound, gruntVoice, type GruntVoice } from "./gruntSound.js";
