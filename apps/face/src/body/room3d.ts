import * as THREE from "three";

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
const HORIZON = 0xc4dcec;
/**
 * Il prato, sotto un cielo diurno.
 *
 * Sotto il cielo notturno di prima era quasi nero, e adesso stonerebbe: un
 * prato scuro sotto un cielo azzurro non legge come «erba all'ombra», legge
 * come un errore. Alzato di conseguenza — ma **non fino al maiale**, che è
 * rosa chiaro: fra i due deve restare la distanza che gli tiene la silhouette,
 * che è la sola cosa che un corpo procedurale ha.
 *
 * ⚠️ **I valori di prima erano tarati contro un difetto**, non contro la scena:
 * una `CanvasTexture` non dichiara il proprio spazio colore, three la prendeva
 * per lineare e la ricodificava in sRGB in uscita, e ogni tinta usciva
 * schiarita (`#3f6b32` finiva a `#88ad7b` — un prato slavato). Compensavo a
 * occhio scegliendo un verde molto più cupo del voluto, cioè tenevo due errori
 * che quasi si annullavano. Adesso la trama dichiara `SRGBColorSpace` e questi
 * sono i colori **veri**: quel che sta scritto qui è quel che si vede.
 *
 * Tre toni e non uno: l'erba vera non è mai di un colore solo, e una superficie
 * a tinta unita — per quanto verde — legge come feltro. Le chiazze sono più
 * scure (l'erba fitta, all'ombra di sé stessa) e i fili più chiari.
 */
const FLOOR_BASE = "#5d8a42";
const FLOOR_SPECK = "#79a856";
const FLOOR_MOTTLE = "#4c7636";
/** Un filo su tre è più chiaro: è quel che fa sembrare l'erba illuminata da sopra. */
const FLOOR_BLADE = "#93c268";

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
 * Un raggio grande non costa niente — sono due geometrie — e la nebbia mangia
 * il pavimento molto prima del bordo. Il fondale invece è `fog: false` apposta,
 * quindi resta nitido a qualunque distanza.
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
function floorTexture(): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const rng = mulberry32(20260815);
  ctx.fillStyle = FLOOR_BASE;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);

  // macchie piccole e poco contrastate: grandi diventavano crateri, e siccome
  // la trama si ripete diventavano gli **stessi** crateri ogni quattro unità
  ctx.fillStyle = FLOOR_MOTTLE;
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
    ctx.fillStyle = rng() < 0.34 ? FLOOR_BLADE : FLOOR_SPECK;
    ctx.fillRect(-1.5 - rng() * 2, -0.55, 3 + rng() * 4, 1.1);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  // **Va detto, o i colori escono sbagliati**: una texture di colore che non
  // dichiara il suo spazio viene presa per lineare, e il renderer la ricodifica
  // in sRGB in uscita schiarendola di brutto. Vale per questa e per il cielo,
  // non per la sfumatura del bordo — quella è un dato, non un colore.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set((FLOOR_RADIUS * 2) / FLOOR_TILE, (FLOOR_RADIUS * 2) / FLOOR_TILE);
  // alta: a raggio 220 il prato lontano è quasi radente, ed è lì che una trama
  // ripetuta diventa moiré invece che erba
  texture.anisotropy = 8;
  return texture;
}

/**
 * Il bordo del pavimento, sfumato a niente.
 *
 * Senza, il piano finisce con un cerchio netto in mezzo al nulla e la stanza
 * diventa un disco volante. Non si ripete — è una sola sfumatura su tutto il
 * pavimento — quindi ha il suo `repeat` separato da quello della trama.
 */
function floorFade(): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const gradient = ctx.createRadialGradient(
    TEXTURE_PX / 2,
    TEXTURE_PX / 2,
    0,
    TEXTURE_PX / 2,
    TEXTURE_PX / 2,
    TEXTURE_PX / 2,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.42, "#ffffff");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

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

function skyTexture(): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const gradient = ctx.createLinearGradient(0, 0, 0, TEXTURE_PX);
  // sopra la fascia visibile: più carico, per il giorno che l'inquadratura si
  // alzasse. Non si vede, ma un cielo che schiarisce salendo sarebbe sbagliato
  // proprio nel verso che si nota
  gradient.addColorStop(0, hex(0x3b7fc4));
  gradient.addColorStop(0.55, hex(ZENITH));
  gradient.addColorStop(0.72, hex(0x7fb4e2));
  gradient.addColorStop(0.86, hex(0xa9cfea));
  gradient.addColorStop(1, hex(HORIZON));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Room {
  public readonly object = new THREE.Group();
  private readonly fog = new THREE.Fog(HORIZON, 10, 40);
  private readonly textures: THREE.Texture[] = [];

  public constructor(private readonly scene: THREE.Scene) {
    const map = floorTexture();
    const alphaMap = floorFade();
    const sky = skyTexture();
    this.textures.push(map, alphaMap, sky);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(FLOOR_RADIUS, 64),
      new THREE.MeshStandardMaterial({
        map,
        alphaMap,
        transparent: true,
        roughness: 0.95,
        metalness: 0,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    // sotto l'ombra finta del maiale, che sta a `y = 0.005`: sullo stesso piano
    // le due superfici si contenderebbero il pixel e l'ombra lampeggerebbe
    floor.position.y = -0.004;
    this.object.add(floor);

    // aperto sopra e sotto: senza tappi non c'è una cupola da vedere, e il
    // `BackSide` è ciò che lo rende un dentro invece che un oggetto
    const sphere = new THREE.Mesh(
      new THREE.CylinderGeometry(BACKDROP_RADIUS, BACKDROP_RADIUS, FLOOR_RADIUS * 2, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }),
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
  }
}
