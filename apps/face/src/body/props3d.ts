import * as THREE from "three";
import { PROP_NATURE, type PropKind, type SceneProp } from "@ugo/shared/props";
import { box } from "./solid.js";

/**
 * Gli arredi, disegnati (ADR-056).
 *
 * Stesse regole del corpo (ADR-026 §1): cubi arrotondati generati a runtime,
 * zero asset binari, zero pipeline di conversione, zero licenze di terzi da
 * interpretare. Un cuscino è tre scatole, un cespuglio sono sei — e vanno
 * benissimo, perché la creatura accanto è fatta della stessa cosa: un modello
 * importato accanto a un maiale di cubi stonerebbe più di qualunque cubo.
 *
 * Il *catalogo* di cosa esiste sta in `@ugo/shared/props`: qui c'è solo come si
 * disegna. Aggiungere un arredo è aggiungere una voce là e un caso qui, e il
 * `check` del database rifiuta tutto ciò che non è in nessuno dei due.
 */

/** Quanto è largo il recinto in unità di scena, per denormalizzare le x/z. */
export interface Pen {
  radiusX: number;
  radiusZ: number;
}

const material = (color: number, roughness = 0.9): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness });

function cushion(): THREE.Group {
  const group = new THREE.Group();
  const cloth = material(0x7a4a63, 0.95);
  // ~60 cm di lato: un pancia a tazza ci sta sopra tutto, che è il punto di un
  // cuscino. A 1.15 unità ci stava mezzo maiale e sembrava uno zerbino.
  const pad = box(1.5, 0.34, 1.5, 0.16, cloth);
  pad.position.y = 0.17;
  group.add(pad);
  // il bottone al centro: è ciò che lo rende un cuscino invece che una piastra
  const button = box(0.2, 0.12, 0.2, 0.05, material(0x5d3549, 0.9));
  button.position.y = 0.29;
  group.add(button);
  return group;
}

function grass(): THREE.Group {
  const group = new THREE.Group();
  const blade = material(0x4a6b3a, 0.95);
  // ciuffi a raggiera, inclinati: dritti sembrerebbero uno steccato. Alti
  // quanto il ginocchio di un pancia a tazza — l'erba in cui grufolare gli
  // arriva alla pancia, non alle caviglie
  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2;
    const far = 0.14 + ((i * 7) % 5) * 0.085;
    const tall = 0.42 + ((i * 3) % 4) * 0.13;
    const mesh = box(0.1, tall, 0.1, 0.035, blade);
    mesh.position.set(Math.cos(angle) * far, tall / 2, Math.sin(angle) * far);
    mesh.rotation.z = Math.cos(angle) * 0.35;
    mesh.rotation.x = -Math.sin(angle) * 0.35;
    group.add(mesh);
  }
  return group;
}

/**
 * Il cespuglio, che è un **riparo** e non un soprammobile.
 *
 * Era alto 0.9 unità — sui 36 cm — cioè un ciuffo che arrivava al ginocchio di
 * un pancia a tazza, e dietro un ciuffo non ci si nasconde. Adesso è più alto
 * di lui e più largo di lui: ci va dietro quando è stressato, e da lì la stanza
 * lo vede meno. È l'unico arredo che risponde a una spinta che non è la noia.
 */
function bush(): THREE.Group {
  const group = new THREE.Group();
  const leaf = material(0x3f5b36, 0.95);
  const trunk = box(0.3, 0.5, 0.3, 0.1, material(0x4a3a2e, 0.9));
  trunk.position.y = 0.25;
  group.add(trunk);
  // La chioma **arriva quasi a terra**, e non è estetica: il maiale è alto ~1.8
  // alla testa, e una macchia che comincia a 1.5 lo lascerebbe visibile
  // attraverso il vuoto sotto le foglie. Un cespuglio dietro cui si vede tutto
  // non è un riparo, è un albero. Va da ~0.5 a ~2.5, e non ha un tronco nudo.
  const blobs: [number, number, number, number][] = [
    [0, 1.25, 0, 1.72],
    [0.7, 0.85, 0.32, 1.2],
    [-0.66, 0.92, -0.36, 1.28],
    [0.5, 1.75, -0.48, 1.15],
    [-0.44, 1.82, 0.52, 1.1],
    [0.14, 2.18, 0.2, 0.95],
    [-0.16, 0.62, 0.44, 1.0],
    [0.34, 0.58, -0.5, 0.95],
  ];
  for (const [x, y, z, size] of blobs) {
    const mesh = box(size, size * 0.85, size, size * 0.4, leaf);
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  return group;
}

function ball(): THREE.Group {
  const group = new THREE.Group();
  // ~20 cm: una palla che un pancia a tazza spinge col muso, non un pallone
  const mesh = box(0.5, 0.5, 0.5, 0.24, material(0xc4574f, 0.6));
  mesh.position.y = 0.25;
  group.add(mesh);
  return group;
}

function trough(): THREE.Group {
  const group = new THREE.Group();
  const wood = material(0x6a5140, 0.92);
  // ~60 × 32 cm, e alto quanto basta perché ci infili dentro il muso stando in
  // piedi: più basso e sarebbe un vassoio, più alto e dovrebbe scavalcarlo
  const floor = box(1.5, 0.14, 0.8, 0.06, wood);
  floor.position.y = 0.07;
  group.add(floor);
  for (const side of [-1, 1]) {
    const wall = box(1.5, 0.46, 0.12, 0.05, wood);
    wall.position.set(0, 0.3, side * 0.34);
    group.add(wall);
    const end = box(0.12, 0.46, 0.8, 0.05, wood);
    end.position.set(side * 0.69, 0.3, 0);
    group.add(end);
  }
  // il pastone dentro: senza, è una cassetta vuota e non un truogolo
  const slop = box(1.24, 0.14, 0.58, 0.05, material(0x574033, 0.98));
  slop.position.y = 0.2;
  group.add(slop);
  return group;
}

const BUILDERS: Readonly<Record<PropKind, () => THREE.Group>> = {
  cushion,
  grass,
  bush,
  ball,
  trough,
};

/**
 * L'ombra finta, come quella del maiale.
 *
 * Non è decorazione: senza, un oggetto posato su un pavimento piatto **fluttua**
 * — il cervello legge il contatto col terreno dall'ombra e da nient'altro, ed è
 * lo stesso motivo per cui `pig.ts` ne porta una da sempre.
 */
function shadowOf(radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.85, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  // sopra il pavimento (`y = -0.004`) e sotto quella del maiale (`y = 0.005`):
  // tre piani a quote diverse invece di tre piani che si contendono il pixel
  mesh.position.y = 0.002;
  return mesh;
}

/** Dove sta un arredo, in unità di scena. Una sola conversione, in un posto. */
export function propAt(prop: SceneProp, pen: Pen): { x: number; z: number } {
  return { x: prop.x * pen.radiusX, z: prop.z * pen.radiusZ };
}

/** Un arredo montato: il suo gruppo, il suo tipo, e dove sta davvero. */
export interface StandingProp {
  id: string;
  kind: PropKind;
  object: THREE.Group;
  x: number;
  z: number;
}

/**
 * L'arredamento della stanza, sostituito in blocco.
 *
 * In blocco e non a differenze, come il messaggio `scene` che lo alimenta: la
 * lista è di al massimo otto oggetti, e uno stato completo non può andare fuori
 * sincrono — che sarebbe l'unico modo in cui questo fallirebbe in silenzio.
 */
export class Furniture {
  public readonly object = new THREE.Group();
  private standing: StandingProp[] = [];
  private wanted: readonly SceneProp[] = [];
  private pen: Pen = { radiusX: 3.4, radiusZ: 1.7 };

  /** Cosa c'è nella stanza adesso. */
  public set(props: readonly SceneProp[]): void {
    this.wanted = props;
    this.rebuild();
  }

  /** Il recinto è cambiato (il fotogramma, o quanti ci vivono): riposiziona. */
  public setPen(pen: Pen): void {
    this.pen = pen;
    for (const prop of this.standing) {
      const source = this.wanted.find((p) => p.id === prop.id);
      if (source === undefined) continue;
      const at = propAt(source, pen);
      prop.x = at.x;
      prop.z = at.z;
      prop.object.position.set(at.x, 0, at.z);
    }
  }

  /** Gli ostacoli e i richiami, per il corpo che ci deve camminare in mezzo. */
  public get placed(): readonly StandingProp[] {
    return this.standing;
  }

  private rebuild(): void {
    for (const prop of this.standing) {
      this.object.remove(prop.object);
      disposeTree(prop.object);
    }
    this.standing = [];
    for (const prop of this.wanted) {
      const build = BUILDERS[prop.kind];
      const group = build();
      group.add(shadowOf(PROP_NATURE[prop.kind].radius));
      const at = propAt(prop, this.pen);
      group.position.set(at.x, 0, at.z);
      group.rotation.y = prop.rot;
      this.object.add(group);
      this.standing.push({ id: prop.id, kind: prop.kind, object: group, x: at.x, z: at.z });
    }
  }

  public dispose(): void {
    for (const prop of this.standing) disposeTree(prop.object);
    this.standing = [];
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.geometry instanceof THREE.BufferGeometry) node.geometry.dispose();
    const materials: unknown[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const one of materials) {
      if (one instanceof THREE.Material) one.dispose();
    }
  });
}
