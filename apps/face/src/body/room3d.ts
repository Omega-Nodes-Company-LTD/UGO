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

/** Il fondo della pagina del chiosco: il cielo della stanza ci si fonde. */
const NIGHT = 0x0b0b10;
/** L'orizzonte, e quindi anche il colore della nebbia: sono la stessa cosa. */
const HORIZON = 0x241a20;
/**
 * Il pavimento è scuro perché il maiale è rosa.
 *
 * Le luci montate (emisferica 1.5 più una chiave a 2.1) alzano parecchio
 * qualunque base, quindi un colore che sulla tavolozza sembra giusto viene
 * fuori slavato — e un pavimento chiaro quanto lui gli toglie la silhouette,
 * che è la sola cosa che un corpo procedurale ha.
 */
const FLOOR_BASE = "#1b1219";
const FLOOR_SPECK = "#2a1d25";
const FLOOR_MOTTLE = "#1f151d";

/** Quanto si estende il pavimento. Oltre la nebbia l'ha già mangiato. */
const FLOOR_RADIUS = 34;
/**
 * Quante volte si ripete la trama sul pavimento.
 *
 * Alto di proposito: la piastrella deve restare **più piccola del maiale**, o
 * la ripetizione si legge come un motivo invece che come terreno — e con
 * piastrelle grandi si vedeva il disegno tornare uguale a ogni passo.
 */
const FLOOR_TILES = 22;
const TEXTURE_PX = 256;
const SPECKS = 260;

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

/** Terriccio e paglia: macchie grandi, e sopra una grana fine. */
function floorTexture(): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const rng = mulberry32(20260815);
  ctx.fillStyle = FLOOR_BASE;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);

  // macchie piccole e poco contrastate: grandi diventavano crateri, e siccome
  // la trama si ripete diventavano gli **stessi** crateri ogni quattro unità
  ctx.fillStyle = FLOOR_MOTTLE;
  for (let i = 0; i < 34; i += 1) {
    const r = 5 + rng() * 16;
    ctx.beginPath();
    ctx.arc(rng() * TEXTURE_PX, rng() * TEXTURE_PX, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = FLOOR_SPECK;
  for (let i = 0; i < SPECKS; i += 1) {
    // trattini e non punti: un trattino ha un verso, e un verso si vede
    // scorrere quando lui cammina — un punto tondo no
    const x = rng() * TEXTURE_PX;
    const y = rng() * TEXTURE_PX;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.fillRect(-2.5 - rng() * 4, -0.6, 5 + rng() * 8, 1.2);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(ctx.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_TILES, FLOOR_TILES);
  texture.anisotropy = 4;
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

/** Il cielo della stanza: dal nero della pagina al colore dell'orizzonte. */
function skyTexture(): THREE.CanvasTexture {
  const ctx = context(TEXTURE_PX);
  const gradient = ctx.createLinearGradient(0, 0, 0, TEXTURE_PX);
  gradient.addColorStop(0, `#${NIGHT.toString(16).padStart(6, "0")}`);
  gradient.addColorStop(0.62, `#${NIGHT.toString(16).padStart(6, "0")}`);
  gradient.addColorStop(1, `#${HORIZON.toString(16).padStart(6, "0")}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX);
  return new THREE.CanvasTexture(ctx.canvas);
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
      new THREE.CylinderGeometry(FLOOR_RADIUS * 1.1, FLOOR_RADIUS * 1.1, 46, 48, 1, true),
      new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    sphere.position.y = 14;
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
