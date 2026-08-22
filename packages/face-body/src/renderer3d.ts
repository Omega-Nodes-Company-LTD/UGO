import * as THREE from "three";
import type { FaceState } from "@ugo/shared/face";
import type { PropKind, SceneProp } from "@ugo/shared/props";
import { VIEWER_SPREAD } from "./attention.js";
import type { Posture } from "./channels.js";
import { Furniture, propAt, type Pen } from "./props3d.js";
import type { FaceRenderer, Resident } from "./faceRenderer.js";
import { Inhabitant } from "./inhabitant.js";
import type { Traits } from "./pig.js";
import type { PsycheVars } from "./pose.js";
import { BACKDROP_RADIUS, Room, type SkyState } from "./room3d.js";

/**
 * The WebGL room: scene, lights, camera, and the clock.
 *
 * Everything expressive lives in the pure modules next door, and everything
 * that belongs to a CREATURE lives in `Inhabitant` — because since ADR-036 a
 * device shows a room, and a room can hold more than one of them.
 */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/**
 * Framing (ADR-028). He used to fill nine tenths of the screen, which left him
 * nowhere to be.
 *
 * How much room he needs depends on how much there is: on a phone held in one
 * hand a tenth of the frame is a speck, and on a desktop a quarter is a poster.
 * So the share is chosen from the viewport, and the camera distance is solved
 * from the share rather than pinned to a number.
 */
const SHARE_ON_PHONE = 0.25;
const SHARE_ON_DESKTOP = 0.1;
const PHONE_WIDTH = 640;
const DESKTOP_WIDTH = 1280;
/**
 * Calibration: at this distance he occupies one unit of frame height. Measured
 * against the real render, not derived — the camera looks down, so the naive
 * trigonometry is wrong by enough to matter.
 */
const DISTANCE_FOR_FULL_FRAME = 4.8;
/** The camera rides this fraction of its own distance above the floor. */
const CAMERA_RISE = 0.2;
const LOOK_AT_Y = 1.25;
/**
 * Fin dove vede la camera: la cupola, più la distanza da cui la guarda.
 *
 * Il fattore è 2 perché nel caso peggiore la camera sta da una parte e la parete
 * che deve vedere sta dall'altra — cioè un diametro — e il resto è margine per
 * la distanza, che con uno schermo largo e una folla arriva a un centinaio.
 */
const SEES_AS_FAR_AS = BACKDROP_RADIUS * 2.4;

export interface Webgl3dOptions {
  traits?: Traits;
  /** off in the dock if the owner prefers him planted; on by default */
  wander?: boolean;
}

export class Webgl3dFace implements FaceRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly observer: ResizeObserver;
  private readonly room: Room;
  private readonly furniture = new Furniture();
  private props: readonly SceneProp[] = [];
  private pen: Pen = { radiusX: 3.4, radiusZ: 1.7 };
  private usedProp: ((who: string, kind: PropKind) => void) | undefined;
  /** uno solo, riusato: costruirne uno per tocco è spazzatura per niente */
  private readonly ray = new THREE.Raycaster();

  /** insertion order is the order they stand in, left to right */
  private readonly people = new Map<string, Inhabitant>();
  private lowPower = false;
  private wandering: boolean;
  private raf = 0;
  private lastDrawAt = 0;
  private readonly traits: Traits | undefined;

  private readonly home = new THREE.Vector3(1.1, 2.6, 13);
  private distance = 13;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    options: Webgl3dOptions = {},
  ) {
    this.wandering = options.wander ?? true;
    this.traits = options.traits;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Il piano lontano **dipende dal fondale**, e non è un numero rotondo scelto
    // a occhio: la cupola ha raggio `FLOOR_RADIUS * 1.05` (~231) e la camera si
    // allontana con lo schermo e con la folla — fino a un centinaio di unità —
    // quindi la parete opposta arriva sui 380. A 200 il cielo veniva tagliato
    // **tutto**, e al suo posto si vedeva il bianco della pagina (`alpha: true`):
    // scoperto al banco guardando il reso, non da un test.
    //
    // Allargarlo non costa: la precisione della z la detta il piano vicino, che
    // resta 0.1.
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, SEES_AS_FAR_AS);
    this.camera.position.set(1.1, 2.6, 13);
    this.camera.lookAt(0, LOOK_AT_Y, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff1f4, 0x2a1b20, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(3, 5.5, 4.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    rim.position.set(-4, 2, -3);
    this.scene.add(rim);

    // la stanza prima degli abitanti: prende le luci già montate, e senza di
    // lei lo spazio era tridimensionale senza che si potesse vedere
    this.room = new Room(this.scene);
    // gli arredi stanno nella stanza, non addosso a una creatura: due gosini
    // nella stessa cucina guardano lo stesso cuscino (ADR-056)
    this.scene.add(this.furniture.object);

    // until the room says who lives in it, there is one nameless creature —
    // the single-exemplar house, and every face built before rooms existed
    this.setResidents([{ id: "", name: "UGO" }]);

    this.observer = new ResizeObserver(() => {
      this.resize();
    });
    this.observer.observe(canvas);
    this.resize();
  }

  /**
   * Who is in the room. Creatures already here keep their bodies — and so
   * their mood, their posture and whatever they were in the middle of — so a
   * roster arriving on reconnect does not make everybody flinch.
   */
  public setResidents(residents: readonly Resident[]): void {
    const wanted = new Set(residents.map((r) => r.id));
    for (const [id, person] of this.people) {
      if (wanted.has(id)) continue;
      this.scene.remove(person.object);
      person.dispose();
      this.people.delete(id);
    }
    for (const resident of residents) {
      if (this.people.has(resident.id)) continue;
      const person = new Inhabitant(
        resident.id,
        resident.name,
        resident.traits ?? this.traits,
        this.wandering,
      );
      this.people.set(resident.id, person);
      const listener = this.usedProp;
      if (listener !== undefined) {
        person.reportUsedProp((kind) => {
          listener(resident.id, kind);
        });
      }
      this.scene.add(person.object);
    }
    // un arrivato nella stanza deve sapere che c'è un cuscino: senza, il
    // secondo gosino di una casa camminerebbe attraverso l'arredamento
    this.spreadProps();
    // resize, not layout: how far the camera stands depends on HOW MANY are in
    // the room, and laying out lanes against the old distance put the third
    // creature outside the frame — visible only as a shadow with no pig on it
    this.resize();
  }

  public setState(state: FaceState, who?: string): void {
    for (const person of this.pick(who)) person.setState(state);
  }

  public setMood(label: string, vars: Partial<PsycheVars>, who?: string): void {
    for (const person of this.pick(who)) person.setMood(label, vars);
  }

  /**
   * The room is looked at, so everybody in it looks back. `null` = nobody is
   * there any more, e va passato: senza, le pupille restano dove eri.
   */
  public setGaze(target: { x: number; y: number } | null): void {
    for (const person of this.people.values()) person.setGaze(target);
  }

  /** ADR-056: l'arredamento della stanza, sostituito in blocco. */
  public setProps(props: readonly SceneProp[]): void {
    this.props = props;
    this.furniture.set(props);
    this.spreadProps();
  }

  /** Gruppo 12: il tempo che fa fuori, e il cielo di stanotte. */
  public setSky(state: SkyState): void {
    this.room.setSky(state);
  }

  /**
   * ADR-058: hai mirato al muso? E di chi?
   *
   * Il bersaglio piccolo **è** la decisione: `tap` è la carezza e arriva
   * ovunque sulla tela, la mela arriva solo se hai puntato. Un premio che si dà
   * per sbaglio non è un premio, e un raycast su tutto il canvas avrebbe reso i
   * due gesti la stessa cosa con due nomi.
   *
   * @param at coordinate normalizzate del puntatore, [-1,1] come le vuole three
   * @returns l'id della creatura toccata sul muso, o `undefined`
   */
  public snoutAt(at: { x: number; y: number }): string | undefined {
    this.ray.setFromCamera(new THREE.Vector2(at.x, at.y), this.camera);
    for (const [id, person] of this.people) {
      // `true`: il muso è un gruppo con dentro il blocco e le narici, e senza
      // la ricorsione il raggio non colpirebbe niente
      if (this.ray.intersectObject(person.pig.snout, true).length > 0) return id;
    }
    return undefined;
  }

  /** ADR-056: uno di loro è andato a usare qualcosa, da solo. */
  public onUsedProp(listener: (who: string, kind: PropKind) => void): void {
    this.usedProp = listener;
    for (const [id, person] of this.people) {
      person.reportUsedProp((kind) => {
        listener(id, kind);
      });
    }
  }

  /** Dove stanno gli arredi in unità di scena, detto a chi ci cammina in mezzo. */
  private spreadProps(): void {
    this.furniture.setPen(this.pen);
    const placed = this.props.map((prop) => ({
      id: prop.id,
      kind: prop.kind,
      ...propAt(prop, this.pen),
    }));
    for (const person of this.people.values()) person.setProps(placed);
  }

  public setLowPower(on: boolean): void {
    this.lowPower = on;
    // §4.2 dice «fondo nero»: la stanza è la superficie più grande da riempire
    // a ogni fotogramma, quindi è anche la prima da spegnere
    this.room.setVisible(!on);
  }

  public setWandering(on: boolean): void {
    this.wandering = on;
    for (const person of this.people.values()) person.setWandering(on);
  }

  /** Pins the posture (bench); `undefined` hands it back to the driver. */
  public forcePosture(posture: Posture | undefined): void {
    for (const person of this.people.values()) person.forcePosture(posture);
  }

  public reflex(kind: string, who?: string): void {
    for (const person of this.pick(who)) person.reflex(kind);
  }

  /** ADR-056 (gruppo 10): chi è dietro un riparo adesso, per il frame `noise`. */
  public shelteredNow(): string[] {
    return [...this.people.entries()]
      .filter(([, person]) => person.sheltered)
      .map(([id]) => id);
  }

  public start(): void {
    const loop = (t: number): void => {
      this.raf = requestAnimationFrame(loop);
      this.frame(t);
    };
    this.raf = requestAnimationFrame(loop);
  }

  public stop(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const person of this.people.values()) person.dispose();
    this.people.clear();
    // la stanza va smontata con loro, e non è teorico: `bench.ts` fa
    // `stop()` + ricostruzione **a ogni trascinamento** di uno slider del
    // genoma, quindi una geometria non liberata qui diventa cento geometrie
    // e tre trame per slider in pochi secondi
    this.room.dispose();
    this.furniture.dispose();
    this.renderer.dispose();
  }

  public readonly debug = (): Record<string, string | number> => {
    const [first] = [...this.people.values()];
    return {
      renderer: "3d",
      residents: this.people.size,
      names: [...this.people.values()].map((p) => p.name).join(","),
      ...(first?.debug() ?? {}),
    };
  };

  /**
   * Somebody is speaking (ADR-037): everybody else turns to look at him.
   *
   * The gaze is aimed from where he actually is, so the two on the left of the
   * room look right and the one on the right looks left — and they perk up,
   * because being spoken to near you is worth noticing. Zero tokens: this is
   * the body reacting to the body, the soul is not consulted.
   */
  public attendTo(who: string | undefined): void {
    const speaker = who === undefined ? undefined : this.people.get(who);
    if (speaker === undefined || this.people.size < 2) return;
    for (const person of this.people.values()) {
      if (person === speaker) continue;
      // l'azimut vero verso chi parla, in unità di `VIEWER_SPREAD`: da quando
      // `attention.ts` toglie l'orientamento del corpo, «x» è un angolo nel
      // mondo e non più una posizione sullo schermo, quindi qui si calcola
      // invece di stimarlo a occhio. Non si limita a ±1: il vicino di stanza
      // può stargli davvero di fianco, e il collo e le pupille hanno già i
      // loro fermi.
      const dx = speaker.position.x - person.position.x;
      const dz = speaker.position.z - person.position.z;
      person.setGaze({ x: Math.atan2(dx, dz) / VIEWER_SPREAD, y: 0 });
      // `earPerk` non è mai esistito: `REFLEX` non lo mappa e non è un id di
      // gesto, quindi `player.play` falliva in silenzio e chi ascoltava non
      // drizzava mai le orecchie. Il gesto vero si chiama `perkUp`.
      person.reflex("perkUp");
    }
  }

  /** Nobody named means everybody: a bang is heard by the whole room. */
  private pick(who: string | undefined): Inhabitant[] {
    if (who === undefined || who === "") return [...this.people.values()];
    const one = this.people.get(who);
    return one === undefined ? [] : [one];
  }

  /** Gives each creature its own slice of the floor, so nobody overlaps. */
  private layout(): void {
    const people = [...this.people.values()];
    if (people.length === 0) return;
    const visibleHalfWidth =
      Math.tan((this.camera.fov * Math.PI) / 360) * this.distance * this.camera.aspect;
    // a crowd stands closer together than one creature roams alone, so the
    // camera does not have to retreat as far to hold them
    const spread = people.length === 1 ? 0.55 : 0.42;
    const half = Math.max(1.5, visibleHalfWidth * spread);
    const depth = Math.max(0.9, this.distance * 0.14);
    const slice = (half * 2) / people.length;
    people.forEach((person, index) => {
      // centre of his lane, measured from the middle of the room
      const centre = -half + slice * (index + 0.5);
      person.setLane(centre, Math.max(0.5, slice * 0.4), depth);
    });
    // il recinto della STANZA, che non è la corsia di nessuno: è quello che
    // denormalizza le coordinate degli arredi, e cambia con il fotogramma
    this.pen = { radiusX: half, radiusZ: depth };
    this.spreadProps();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // share of the frame he should take, from the width of the frame itself
    const t = clamp01((w - PHONE_WIDTH) / (DESKTOP_WIDTH - PHONE_WIDTH));
    const share = SHARE_ON_PHONE + (SHARE_ON_DESKTOP - SHARE_ON_PHONE) * t;
    // ...and the frame has to hold all of them: two creatures at one creature's
    // distance would each be cropped at the shoulder. Gently, though — pulling
    // back also makes them SHORTER, and √n turned a room of three into three
    // specks. They stand closer together instead (see `layout`).
    const crowd = 1 + 0.3 * Math.max(0, this.people.size - 1);
    this.distance = (DISTANCE_FOR_FULL_FRAME / share) * crowd;
    this.home.set(this.distance * 0.085, this.distance * CAMERA_RISE, this.distance);
    // la nebbia segue la camera: a distanze fisse sarebbe un velo addosso a lui
    // sul telefono e niente del tutto sul desktop
    this.room.fit(this.distance);
    this.layout();
  }

  private frame(now: number): void {
    // Portable mode (§4.2): if nothing is actually moving, stop drawing. Not a
    // throttled game loop — no frame at all until something changes.
    const busy = [...this.people.values()].some((person) => person.busy);
    if (this.lowPower && !busy && now - this.lastDrawAt < 500) return;
    this.lastDrawAt = now;

    let sumX = 0;
    for (const person of this.people.values()) {
      person.step(now);
      sumX += person.position.x;
    }
    // the camera follows the middle of the room, and only just enough: with
    // room to walk, a camera that chases cancels the walking out
    const centre = this.people.size === 0 ? 0 : sumX / this.people.size;
    this.camera.position.x += (this.home.x + centre * 0.22 - this.camera.position.x) * 0.04;
    this.camera.position.y += (this.home.y - this.camera.position.y) * 0.08;
    this.camera.position.z += (this.home.z - this.camera.position.z) * 0.08;
    this.camera.lookAt(centre * 0.3, LOOK_AT_Y, 0);
    this.renderer.render(this.scene, this.camera);
  }
}
