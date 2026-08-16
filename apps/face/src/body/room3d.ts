import * as THREE from "three";
import type { SkyBody } from "./ephemeris.js";

/**
 * La stanza: pavimento, fondale, nebbia.
 *
 * Lo spazio **era già a tre dimensioni** — `wander.ts` muove x *e* z dentro un
 * recinto ellittico, e la camera guarda dall'alto — ma non c'era niente contro
 * cui vederlo: nessun piano, nessuno sfondo, nessuna nebbia, e come unica
 * ombra un cerchio finto attaccato sotto il maiale. Su fondo nero, chi avanza
 * lungo Z **sembra soltanto ingrandirsi**: la profondità c'era e non era
 * osservabile, che è il modo in cui una dimensione intera non esiste.
 *
 * Tre indizi, in ordine di quanto rendono:
 *
 * 1. **la nebbia**, l'unico che dice «più lontano = più slavato» anche stando
 *    fermi;
 * 2. **il fondale**, che dà un orizzonte contro cui misurare l'altezza;
 * 3. **la trama del pavimento**, che è l'unico indizio di *movimento*: nessuna
 *    nebbia sostituisce la parallasse di chi cammina su un terreno che ha dei
 *    dettagli.
 *
 * Zero asset binari (ADR-026 §1): la trama si genera qui a runtime con
 * `CanvasTexture`. Il divieto è sui file, non sulla generazione da codice — un
 * pavimento procedurale è esattamente la stessa scelta del corpo.
 *
 * Il fondale sta **dentro la scena** invece che in `scene.background`: così
 * `alpha: true` sul renderer resta vero e il muso può ancora essere composto
 * sopra il CSS del chiosco il giorno che servisse.
 */

/**
 * Il cielo: azzurro allo zenit, pallido all'orizzonte.
 *
 * L'inversione di luminanza rispetto a prima è la scelta portante, e ha una
 * conseguenza che va scritta perché sta **in un altro file**: la barra del
 * chiosco è testo chiaro (`#cfcfe0`) posato in basso sopra la tela, e finché
 * sotto c'era il nero della pagina non serviva altro. Sopra un prato
 * illuminato il contrasto scendeva a ~2.5:1, quindi `index.html` adesso mette
 * una sfumatura scura sotto la barra. Il prato può essere verde davvero.
 *
 * Resta invece un vincolo sul **maiale**: è rosa chiaro, e il prato deve
 * restare abbastanza più scuro da lasciargli una silhouette — che è la sola
 * cosa che un corpo fatto di cubi ha. Chiaro sopra e scuro sotto è anche quel
 * che fa un prato vero con il sole alto.
 */
const ZENITH = 0x5b9bd8;
/** L'orizzonte, e quindi anche il colore della nebbia: sono la stessa cosa. */
// meno bianco di prima (0xc4dcec): sullo schermo vero la fascia bassa della
// cupola occupa mezza inquadratura, e un orizzonte quasi bianco diventava
// «quella banda inguardabile» (parole del proprietario, 2026-08-16)
const HORIZON = 0xa8cae6;
/**
 * Il prato, sotto un cielo diurno.
 *
 * Sotto il cielo notturno di prima era quasi nero, e adesso stonerebbe: un
 * prato scuro sotto un cielo azzurro non legge come «erba all'ombra», legge
 * come un errore. Alzato di conseguenza — ma **non fino al maiale**, che è
 * rosa chiaro: fra i due deve restare la distanza che gli tiene la silhouette,
 * che è la sola cosa che un corpo procedurale ha.
 *
 * ⚠️ Questi valori sono **letterali**: il pavimento è `MeshBasicMaterial` (vedi
 * il costruttore per il perché, che è di prestazioni misurate), quindi né luci
 * né ricodifiche — la trama dichiara `SRGBColorSpace` e quel che sta scritto
 * qui è **esattamente** quel che si vede. Le due tarature precedenti erano
 * entrambe contro un artefatto: prima un colorspace sbagliato che schiariva,
 * poi delle luci che moltiplicavano. Adesso la tavolozza è la verità.
 *
 * Tre toni e non uno: l'erba vera non è mai di un colore solo, e una superficie
 * a tinta unita — per quanto verde — legge come feltro. Le chiazze sono più
 * scure (l'erba fitta, all'ombra di sé stessa) e i fili più chiari — che è
 * anche l'unica «illuminazione» che il prato ha: dipinta, come su un fondale
 * di teatro, e per un piano opaco visto da questa camera non si distingue.
 */
const FLOOR_BASE = "#7fae5e";
const FLOOR_SPECK = "#93c272";
const FLOOR_MOTTLE = "#6b9a4c";
/** Un filo su tre è più chiaro: è quel che fa sembrare l'erba illuminata da sopra. */
const FLOOR_BLADE = "#abd484";

/**
 * Le stagioni nel recinto (gruppo 13): il prato segue il calendario.
 *
 * Stagioni meteorologiche (marzo-maggio primavera, e via di tre in tre): una
 * data, una tavolozza, zero rete. La primavera è il prato di sempre; l'estate
 * ingiallisce e secca; l'autunno si spegne e si copre di foglie; l'inverno
 * impallidisce nel freddo. Si decide all'avvio del muso: un chiosco acceso a
 * cavallo dell'equinozio cambia stagione alla prima ricarica, e va bene così.
 */
export type Season = "primavera" | "estate" | "autunno" | "inverno";

export function seasonOf(at: Date): Season {
  const month = at.getMonth() + 1;
  if (month >= 3 && month <= 5) return "primavera";
  if (month >= 6 && month <= 8) return "estate";
  if (month >= 9 && month <= 11) return "autunno";
  return "inverno";
}

interface FloorPalette {
  base: string;
  speck: string;
  mottle: string;
  blade: string;
  /** i tocchi della stagione: fiori in primavera, foglie in autunno */
  accents?: string[];
}

const FLOOR_SEASONS: Record<Season, FloorPalette> = {
  primavera: {
    base: FLOOR_BASE,
    speck: FLOOR_SPECK,
    mottle: FLOOR_MOTTLE,
    blade: FLOOR_BLADE,
    accents: ["#f2ecc9", "#e8d27a"],
  },
  estate: { base: "#9aa85a", speck: "#adbb6a", mottle: "#87954a", blade: "#c9cf7e" },
  autunno: {
    base: "#8a9152",
    speck: "#9c9d5c",
    mottle: "#76814a",
    blade: "#b3a45e",
    accents: ["#c07a3e", "#a05c34", "#8a5a40"],
  },
  inverno: { base: "#8b9884", speck: "#9daa96", mottle: "#778472", blade: "#b9c4b2" },
};

/**
 * Quanto si estende il pavimento — e con lui il fondale.
 *
 * Era 34, ed era un difetto: la camera si allontana con lo schermo e con quante
 * creature ci sono (`resize()`: `DISTANCE_FOR_FULL_FRAME / share * crowd`), e su
 * un desktop largo con più di un gosino arriva **oltre 100**. Sopra i 37 del
 * fondale la camera si sarebbe trovata **fuori dalla cupola**, che essendo
 * `BackSide` è invisibile da fuori: cielo sparito, sfondo della pagina al suo
 * posto. Non si era visto perché il banco gira a 900 px, dove la distanza è 25.
 *
 * Un raggio grande non costa niente **come geometria** — sono due mesh — ma ha
 * un costo che questa correzione ha fatto pagare e che è stato saldato altrove:
 * un pavimento che arriva all'orizzonte riempie di frammenti *suoi* metà
 * inquadratura, e da lì la scelta del materiale (vedi il costruttore) è
 * diventata di prestazioni, non di stile. La nebbia mangia il pavimento molto
 * prima del bordo; il fondale invece è `fog: false` apposta, quindi resta
 * nitido a qualunque distanza.
 */
const FLOOR_RADIUS = 220;
/**
 * Il raggio della cupola, **esportato apposta**.
 *
 * Il piano lontano della camera lo legge da qui (`renderer3d.ts`): fondale e
 * frustum sono una cosa sola, e tenerli in due file come due numeri scollegati
 * è esattamente il modo in cui è sparito il cielo la prima volta.
 */
export const BACKDROP_RADIUS = FLOOR_RADIUS * 1.05;
/**
 * Quanto è grande una piastrella d'erba, in unità di scena (~50 cm).
 *
 * Il `repeat` si ricava da qui e dal raggio, invece di essere un numero: così
 * il prato ha la stessa grana su qualunque schermo, ed è quel che serve —
 * una piastrella deve restare più piccola del maiale, o la ripetizione si legge
 * come un motivo invece che come terreno.
 */
const FLOOR_TILE = 1.3;
const TEXTURE_PX = 256;
/** Fitti: un prato rado non è un prato, è un campo dopo la siccità. */
const SPECKS = 520;

/**
 * Un dado ripetibile.
 *
 * Il pavimento deve venire identico a ogni avvio e identico per due creature
 * nella stessa stanza: una trama che cambia a ogni ricarica è un terreno che
 * si rifà sotto i piedi, e si nota proprio perché nessuno lo sta guardando.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function context(size: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("no 2d context for the room texture");
  return ctx;
}

/**
 * Un prato: chiazze larghe, e sopra i fili.
 *
 * Il proprietario l'ha chiesto guardando il chiosco — «pavimento lo facciamo di
 * erbetta, così se la gode meglio». Ha ragione anche per una ragione che non ha
 * detto: gli arredi sono un cuscino, un ciuffo d'erba, un cespuglio e un
 * truogolo, cioè roba da aia. Su terriccio scuro sembravano posati su un
 * pavimento di cantina.
 */
function floorTexture(season: Season): THREE.CanvasTexture {
  const palette = FLOOR_SEASONS[season];
  const ctx = context(TEXTURE_PX);
  const rng = mulberry32(20260815);
  ctx.fillStyle = palette.base;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);

  // macchie piccole e poco contrastate: grandi diventavano crateri, e siccome
  // la trama si ripete diventavano gli **stessi** crateri ogni quattro unità
  ctx.fillStyle = palette.mottle;
  for (let i = 0; i < 34; i += 1) {
    const r = 6 + rng() * 18;
    ctx.beginPath();
    ctx.arc(rng() * TEXTURE_PX, rng() * TEXTURE_PX, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // I fili. Trattini e non punti: un trattino ha un verso, e un verso si vede
  // scorrere quando lui cammina — un punto tondo no, ed è quella la parallasse
  // che dice «mi sto muovendo».
  //
  // Corti e fitti, non lunghi e radi: da questa camera un filo lungo si legge
  // come un graffio sulla lente invece che come erba.
  for (let i = 0; i < SPECKS; i += 1) {
    ctx.save();
    ctx.translate(rng() * TEXTURE_PX, rng() * TEXTURE_PX);
    ctx.rotate(rng() * Math.PI);
    // un filo su tre è più chiaro: è quel che fa sembrare l'erba illuminata da
    // sopra invece che colorata di verde
    ctx.fillStyle = rng() < 0.34 ? palette.blade : palette.speck;
    ctx.fillRect(-1.5 - rng() * 2, -0.55, 3 + rng() * 4, 1.1);
    ctx.restore();
  }

  // i tocchi della stagione: fiorellini in primavera, foglie cadute in
  // autunno — pochi e piccoli, o il prato diventa un motivo da tovaglia
  for (const accent of palette.accents ?? []) {
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(rng() * TEXTURE_PX, rng() * TEXTURE_PX, 0.9 + rng() * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  // **Va detto, o i colori escono sbagliati**: una texture di colore che non
  // dichiara il suo spazio viene presa per lineare, e il renderer la ricodifica
  // in sRGB in uscita schiarendola di brutto. Vale per questa e per il cielo.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set((FLOOR_RADIUS * 2) / FLOOR_TILE, (FLOOR_RADIUS * 2) / FLOOR_TILE);
  // 2 e non di più: l'anisotropia si paga a ogni pixel, e in GL software si
  // paga cara (misurato: 8 costava ~2,5 fps). Il moiré del prato radente che
  // 8 avrebbe pulito sta quasi tutto oltre `fog.far`, dove tanto è nebbia.
  texture.anisotropy = 2;
  return texture;
}

// Il bordo sfumato (`floorFade`) non esiste più, e non per pulizia: da quando
// la nebbia ha il colore dell'orizzonte, oltre `fog.far` il pavimento È già
// del colore del cielo — l'orlo che quella sfumatura nascondeva non si può
// più vedere, e il suo prezzo (blending su tutto il piano, una trama in più)
// era diventato il collo di bottiglia del reso in GL software.

/**
 * Il cielo: azzurro sopra, pallido giù verso l'orizzonte.
 *
 * La sfumatura non è decorazione — è il **secondo indizio di profondità dopo la
 * nebbia**. Un cielo a tinta unita è una parete dipinta di azzurro, e si legge
 * come tale: è lo schiarirsi verso il basso che dice «lì è lontano», ed è la
 * stessa cosa che fa l'atmosfera vera.
 *
 * **Le fermate sono tarate su quale striscia si vede davvero**, ed è un conto,
 * non un gusto: la cupola è alta `FLOOR_RADIUS * 2` col centro a `0.55` del
 * raggio, la camera guarda quasi in orizzontale e sta bassa, quindi
 * l'inquadratura prende solo la fascia fra `v ≈ 0.22` (l'orizzonte) e `v ≈ 0.32`
 * (il bordo alto) — cioè l'**ultimo quinto** della trama, contando dall'alto
 * come fa `flipY`. Il primo giro al banco aveva l'azzurro pieno in cima e la
 * parte pallida proprio lì: veniva fuori un cielo lavato, «azzurrino» e non
 * azzurro. Adesso il pieno cade dentro quella fascia e il pallido resta per gli
 * ultimi gradi sopra l'orizzonte, dov'è anche fisicamente giusto.
 *
 * La fascia si sposta pochissimo con lo schermo e con la folla — il campo
 * verticale è fisso a 32°, e allontanando la camera cresce insieme la distanza
 * della parete — quindi la taratura vale su tutti e due i banchi provati.
 */
const hex = (value: number): string => `#${value.toString(16).padStart(6, "0")}`;

/**
 * Il cielo adesso ha un tempo e un'ora (gruppo 12): il meteo VERO fuori dalla
 * finestra e — di notte — la luna con la sua fase e i pianeti a occhio nudo,
 * calcolati e non scaricati (`ephemeris.ts`).
 */
export type SkyWeather = "clear" | "cloudy" | "rain";

export interface NightSky {
  moon: { fraction: number; waxing: boolean; altitude: number; azimuth: number };
  planets: SkyBody[];
}

export interface SkyState {
  /** `golden` (gruppo 13): l'ora d'oro — il sole fra −6° e +6°, agli orari veri */
  mode: "day" | "night" | "golden";
  weather: SkyWeather;
  /** cosa c'è lassù stanotte; ignorato di giorno e sotto le nuvole */
  night?: NightSky;
}

/**
 * Le tavolozze: [alto, zenit, mezzo, basso, orizzonte]. L'orizzonte è anche il
 * colore della nebbia — sono la stessa cosa, ed è ciò che rende invisibile
 * l'orlo del pavimento. `floor` è il moltiplicatore del prato: il pavimento è
 * `MeshBasicMaterial`, quindi la sua «luce» si abbassa da qui, non dalle
 * lampade. La terza riga è l'ora d'oro (gruppo 13): il sole fra −6° e +6°.
 */
const PALETTES: Record<
  "day" | "night" | "golden",
  Record<SkyWeather, { stops: number[]; floor: number }>
> = {
  day: {
    clear: { stops: [0x3b7fc4, ZENITH, 0x74acdd, 0x8fbde2, HORIZON], floor: 0xffffff },
    cloudy: { stops: [0x7c8fa3, 0x8fa3b5, 0xaebdc9, 0xc6d1d9, 0xd4dce2], floor: 0xd8dde0 },
    rain: { stops: [0x5a6a7a, 0x6b7b8a, 0x8a97a3, 0xa5aeb7, 0xb5bfc7], floor: 0xb9c2c6 },
  },
  night: {
    clear: { stops: [0x05080f, 0x0d1626, 0x16233a, 0x22334c, 0x32455e], floor: 0x5a6875 },
    cloudy: { stops: [0x090b10, 0x10141c, 0x181e28, 0x222a36, 0x2c3542], floor: 0x4c565f },
    rain: { stops: [0x07090d, 0x0c1016, 0x131820, 0x1b222c, 0x232c37], floor: 0x434c54 },
  },
  // l'ora d'oro: blu-viola in alto che scende nell'ambra all'orizzonte — è la
  // fisica del crepuscolo, non una decorazione, e dura quanto dura davvero
  golden: {
    clear: { stops: [0x2e3f6e, 0x4a5a8c, 0x9a7a7e, 0xd89a62, 0xf2c078], floor: 0xdec1a0 },
    cloudy: { stops: [0x4a4f5e, 0x5e6270, 0x84788a, 0xa8928e, 0xc0a494], floor: 0xc2b0a2 },
    rain: { stops: [0x33373f, 0x42464f, 0x5c5560, 0x776862, 0x8d7a70], floor: 0x93857b },
  },
};

/**
 * Da dove sta un corpo celeste a dove dipingerlo sulla trama.
 *
 * L'azimut fa il giro della cupola (u), la quota sale verso lo zenit (y più
 * piccolo). La fascia che la camera vede davvero è quella bassa (vedi il
 * commento della sfumatura), quindi la quota si comprime apposta verso
 * l'orizzonte: è scenografia dichiarata, non un planetario — la verifica fine
 * si fa col cielo vero sopra il chiosco.
 */
function paintAt(altitude: number, azimuth: number): { x: number; y: number } {
  return {
    x: (azimuth / 360) * TEXTURE_PX,
    y: TEXTURE_PX * (0.97 - (Math.min(altitude, 90) / 90) * 0.75),
  };
}

function paintNight(ctx: CanvasRenderingContext2D, night: NightSky): void {
  // le stelle: deterministiche, come il prato — un cielo che si rimescola a
  // ogni ricarica si nota proprio perché nessuno lo sta fissando
  const rng = mulberry32(20260816);
  for (let i = 0; i < 150; i += 1) {
    const y = rng() * TEXTURE_PX * 0.9;
    ctx.fillStyle = rng() < 0.2 ? "#e8ecf5" : "#aeb8cc";
    ctx.globalAlpha = 0.4 + rng() * 0.6;
    ctx.fillRect(rng() * TEXTURE_PX, y, 1, 1);
  }
  ctx.globalAlpha = 1;

  for (const body of night.planets) {
    const { x, y } = paintAt(body.altitude, body.azimuth);
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  if (night.moon.altitude > 0) {
    const { x, y } = paintAt(night.moon.altitude, night.moon.azimuth);
    const r = 7;
    ctx.fillStyle = "#e9e7dc";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // la fase: il disco scuro che copre la parte non illuminata, spostato dal
    // lato giusto — crescente illuminata a ovest, calante a est
    const offset = (1 - night.moon.fraction) * 2 * r * (night.moon.waxing ? -1 : 1);
    if (Math.abs(offset) > 0.5) {
      ctx.fillStyle = hex(PALETTES.night.clear.stops[1] ?? 0x0d1626);
      ctx.beginPath();
      ctx.arc(x + offset, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function skyTexture(state: SkyState): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const palette = PALETTES[state.mode][state.weather];
  const gradient = ctx.createLinearGradient(0, 0, 0, TEXTURE_PX);
  // sopra la fascia visibile: più carico, per il giorno che l'inquadratura si
  // alzasse. Non si vede, ma un cielo che schiarisce salendo sarebbe sbagliato
  // proprio nel verso che si nota
  const [top, zenith, mid, low, horizonStop] = palette.stops;
  gradient.addColorStop(0, hex(top ?? 0));
  gradient.addColorStop(0.5, hex(zenith ?? 0));
  // la parte pallida si schiaccia in fondo: la fascia che la camera vede
  // davvero è quella bassa, e con gli stop larghi metà inquadratura era una
  // banda slavata uniforme — il degradé deve vivere DENTRO la parte visibile
  gradient.addColorStop(0.74, hex(mid ?? 0));
  gradient.addColorStop(0.92, hex(low ?? 0));
  gradient.addColorStop(1, hex(horizonStop ?? 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  // gli astri solo a cielo sereno: sotto le nuvole non si vedono, e
  // disegnarli sarebbe una bugia proprio del genere che il meteo vero toglie
  if (state.mode === "night" && state.weather === "clear" && state.night !== undefined) {
    paintNight(ctx, state.night);
  }
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Room {
  public readonly object = new THREE.Group();
  private readonly fog = new THREE.Fog(HORIZON, 10, 40);
  private readonly textures: THREE.Texture[] = [];
  private readonly floorMaterial: THREE.MeshBasicMaterial;
  private readonly skyMaterial: THREE.MeshBasicMaterial;
  private skyMap: THREE.CanvasTexture;

  public constructor(
    private readonly scene: THREE.Scene,
    season: Season = seasonOf(new Date()),
  ) {
    const map = floorTexture(season);
    const sky = skyTexture({ mode: "day", weather: "clear" });
    this.skyMap = sky;
    this.textures.push(map);

    /**
     * `MeshBasicMaterial`, e non è una rinuncia estetica: è **dove stava il
     * costo**. Col cielo diurno il pavimento arriva fino all'orizzonte, e un
     * piano `MeshStandardMaterial` trasparente con due trame shadeggiato su
     * mezza inquadratura ha portato il reso in GL software da 12,5 a 8 fps —
     * misurato al banco con swiftshader, ed è ciò che ha fatto scadere il
     * gesto nell'e2e in CI. Un prato piatto e opaco non ha niente da chiedere
     * alle luci: la sua "illuminazione" è già dipinta nella trama (i fili
     * chiari), e la sfumatura di bordo è diventata ridondante il giorno in cui
     * la nebbia ha preso il colore dell'orizzonte — oltre `fog.far` il piano È
     * già del colore del cielo, non c'è nessun orlo da nascondere.
     * Basic + opaco + una trama sola: 14,5 fps sullo stesso banco.
     */
    this.floorMaterial = new THREE.MeshBasicMaterial({ map });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(FLOOR_RADIUS, 64), this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    // sotto l'ombra finta del maiale, che sta a `y = 0.005`: sullo stesso piano
    // le due superfici si contenderebbero il pixel e l'ombra lampeggerebbe
    floor.position.y = -0.004;
    this.object.add(floor);

    // aperto sopra e sotto: senza tappi non c'è una cupola da vedere, e il
    // `BackSide` è ciò che lo rende un dentro invece che un oggetto
    this.skyMaterial = new THREE.MeshBasicMaterial({
      map: sky,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(
      new THREE.CylinderGeometry(BACKDROP_RADIUS, BACKDROP_RADIUS, FLOOR_RADIUS * 2, 48, 1, true),
      this.skyMaterial,
    );
    // il centro sta **sopra** l'orizzonte, così la metà bassa della trama —
    // quella pallida — cade dove guarda la camera, e l'azzurro pieno resta in
    // alto dove serve solo a non far vedere un bordo
    sphere.position.y = FLOOR_RADIUS * 0.55;
    this.object.add(sphere);

    scene.add(this.object);
    scene.fog = this.fog;
  }

  /**
   * Rimette la nebbia sulla distanza della camera.
   *
   * `resize` cambia quanto sta lontana la camera (uno schermo grande la
   * allontana, e una folla anche), e una nebbia a distanze fisse diventerebbe
   * un velo addosso alla creatura sul telefono e niente del tutto sul desktop.
   * `near` sta appena **prima** di lui apposta: così i suoi passi avanti e
   * indietro cadono dentro la rampa, ed è quello a rendere leggibile la Z.
   */
  public fit(distance: number): void {
    this.fog.near = Math.max(1, distance - 3);
    this.fog.far = distance + 32;
  }

  /**
   * Il tempo che fa, e — di notte — cosa c'è lassù (gruppo 12).
   *
   * Rigenera la trama del cielo, accorda la nebbia all'orizzonte nuovo (sono
   * la stessa cosa: è ciò che rende invisibile l'orlo del pavimento) e abbassa
   * la «luce» del prato — che è `MeshBasicMaterial`, quindi la sua
   * illuminazione è un moltiplicatore, non una lampada. Una trama nuova ogni
   * mezz'ora al massimo: il costo è di generazione, non per fotogramma.
   */
  public setSky(state: SkyState): void {
    const next = skyTexture(state);
    this.skyMaterial.map = next;
    this.skyMaterial.needsUpdate = true;
    this.skyMap.dispose();
    this.skyMap = next;
    const palette = PALETTES[state.mode][state.weather];
    const horizonColor = palette.stops[4] ?? HORIZON;
    this.fog.color.setHex(horizonColor);
    this.floorMaterial.color.setHex(palette.floor);
  }

  /** Portable mode (§4.2): la stanza è la cosa più cara da riempire. */
  public setVisible(on: boolean): void {
    this.object.visible = on;
    this.scene.fog = on ? this.fog : null;
  }

  public dispose(): void {
    this.scene.remove(this.object);
    if (this.scene.fog === this.fog) this.scene.fog = null;
    this.object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.geometry instanceof THREE.BufferGeometry) node.geometry.dispose();
      // i materiali, e non solo le geometrie: qui ce n'è uno per superficie e
      // ognuno tiene in vita uno shader compilato
      const materials: unknown[] = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (material instanceof THREE.Material) material.dispose();
      }
    });
    for (const texture of this.textures) texture.dispose();
    this.skyMap.dispose();
  }
}
