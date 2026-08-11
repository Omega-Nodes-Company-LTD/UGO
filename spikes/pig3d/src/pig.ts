import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Pose } from "./pose.js";

/**
 * Il porcetto: cubi arrotondati generati a runtime. Nessun file binario,
 * nessuna pipeline di conversione, nessuna licenza di terzi.
 *
 * Due gruppi di parametri, tenuti separati apposta:
 *  - `Traits` = la FORMA. È l'aggancio per `trait_sets` (ADR-015), che oggi
 *    esiste e non pilota niente: due gosini della stessa casa possono essere
 *    diversi *di corpo*, non solo di ricordi.
 *  - `Pose`   = il MOVIMENTO, che viene dalla psiche (vedi pose.ts).
 */

export interface Traits {
  /** quanto è tozzo: 0 allungato, 1 cubo pieno */
  chonk: number;
  /** dimensione delle orecchie */
  ear: number;
  /** lunghezza del grugno */
  snout: number;
  /** dimensione degli occhi */
  eye: number;
  /** lunghezza delle zampe */
  leg: number;
  /** tinta della pelle (hue 0..1) */
  hue: number;
}

export const DEFAULT_TRAITS: Traits = {
  chonk: 0.62,
  ear: 0.55,
  snout: 0.55,
  eye: 0.5,
  leg: 0.45,
  hue: 0.95,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function box(
  w: number,
  h: number,
  d: number,
  r: number,
  material: THREE.Material,
): THREE.Mesh {
  // il raggio non può superare metà del lato minore, o la geometria degenera
  const safe = Math.min(r, Math.min(w, h, d) / 2 - 0.001);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, safe), material);
}

interface Eye {
  group: THREE.Group;
  sclera: THREE.Mesh;
  pupil: THREE.Mesh;
  /** l'arco che resta quando l'occhio è chiuso */
  shut: THREE.Group;
}

export class Pig {
  public readonly object = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly ears: THREE.Group[] = [];
  private readonly snout = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly tailRoot = new THREE.Group();
  private readonly tailLinks: THREE.Group[] = [];
  private readonly legs: THREE.Mesh[] = [];

  private readonly shadow: THREE.Mesh;
  private readonly cheekMat: THREE.MeshStandardMaterial;
  private readonly restY: number;
  private readonly legH: number;
  private readonly mouthRestY: number;
  private readonly legRestY: number[] = [];
  private readonly legRestZ: number[] = [];
  private readonly traits: Traits;

  public constructor(traits: Traits = DEFAULT_TRAITS) {
    this.traits = traits;

    const skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(traits.hue, 0.6, 0.77),
      roughness: 0.88,
    });
    const limb = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(traits.hue, 0.55, 0.71),
      roughness: 0.88,
    });
    const snoutMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(traits.hue, 0.52, 0.67),
      roughness: 0.82,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(traits.hue, 0.45, 0.22),
      roughness: 0.55,
    });
    const white = new THREE.MeshStandardMaterial({ color: 0xfdfbfb, roughness: 0.45 });
    this.cheekMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.99, 0.72, 0.63),
      roughness: 0.9,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.object.add(this.bodyPivot);

    // ── corpo: il cubo grosso ────────────────────────────────────────────
    const bw = lerp(2.0, 2.5, traits.chonk);
    const bh = lerp(1.55, 2.05, traits.chonk);
    const bd = lerp(2.45, 2.15, traits.chonk);
    this.body = box(bw, bh, bd, 0.55, skin);
    this.bodyPivot.add(this.body);

    // ── testa: cubo più piccolo che sprofonda nel corpo (niente collo) ───
    const hw = bw * 0.86;
    const hh = bh * 0.92;
    const hd = bd * 0.7;
    this.head.position.set(0, bh * 0.1, bd * 0.4);
    this.head.add(box(hw, hh, hd, 0.48, skin));
    this.bodyPivot.add(this.head);

    // ── orecchie: pivot alla base, ruotando si alza la punta ─────────────
    // stanno SOPRA la testa e arretrate: davanti coprirebbero gli occhi
    const earW = lerp(0.32, 0.55, traits.ear);
    const earH = lerp(0.34, 0.62, traits.ear);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * hw * 0.29, hh * 0.32, -hd * 0.07);
      const mesh = box(earW, earH, 0.22, 0.085, limb);
      mesh.position.y = earH / 2;
      pivot.add(mesh);
      this.head.add(pivot);
      this.ears.push(pivot);
    }

    // ── grugno: sporge dalla faccia, due narici ──────────────────────────
    const snW = lerp(0.6, 0.95, traits.snout);
    const snD = lerp(0.22, 0.45, traits.snout);
    this.snout.position.set(0, -hh * 0.19, hd / 2 + snD * 0.3);
    this.snout.add(box(snW, snW * 0.74, snD, 0.14, snoutMat));
    for (const side of [-1, 1]) {
      const nostril = box(0.11, 0.2, 0.09, 0.04, dark);
      nostril.position.set(side * snW * 0.2, 0, snD / 2);
      this.snout.add(nostril);
    }
    this.head.add(this.snout);

    // ── occhi: bianco + pupilla mobile + palpebra che scende dall'alto ───
    const eyeW = lerp(0.36, 0.58, traits.eye);
    const eyeH = eyeW * 1.15;
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * hw * 0.245, hh * 0.1, hd / 2 - 0.06);

      // profondi apposta: con RoundedBoxGeometry il raggio non può superare
      // metà del lato minore, quindi un occhio sottile resta squadrato
      const sclera = box(eyeW, eyeH, 0.26, eyeW * 0.34, white);
      sclera.position.z = 0.09;
      group.add(sclera);

      const pupil = box(eyeW * 0.46, eyeH * 0.5, 0.2, eyeW * 0.2, dark);
      pupil.position.z = 0.16;
      group.add(pupil);

      // chiudere l'occhio è uno schiacciamento, non una palpebra che scende:
      // una palpebra sopra la faccia si vede sempre, anche a occhio aperto.
      // Sotto resta questa riga, che spunta man mano che l'occhio si chiude.
      // dentro il volume della sclera: finché l'occhio è aperto resta sepolto,
      // quando la sclera si schiaccia a zero riemerge da solo. Due segmenti a
      // "∧": una riga dritta legge come cipiglio, l'arco legge come sonno
      const shut = new THREE.Group();
      shut.position.set(0, -eyeH * 0.04, 0.03);
      for (const half of [-1, 1]) {
        const seg = box(eyeW * 0.56, 0.085, 0.1, 0.04, dark);
        seg.position.x = half * eyeW * 0.24;
        // estremo esterno in basso: "∧" legge come sonno, "∨" come broncio
        seg.rotation.z = half * 0.3;
        shut.add(seg);
      }
      shut.scale.y = 0.001;
      group.add(shut);

      const cheek = box(eyeW * 0.95, eyeW * 0.5, 0.08, 0.04, this.cheekMat);
      cheek.position.set(side * 0.14, -eyeH * 0.95, 0.06);
      group.add(cheek);

      this.head.add(group);
      this.eyes.push({ group, sclera, pupil, shut });
    }

    // ── bocca: sotto il grugno, si apre quando parla ─────────────────────
    // sotto il grugno ma dentro la sagoma: più in basso esce dal mento,
    // più in alto sparisce dietro il grugno. E la faccia lì è già curva.
    this.mouthRestY = -hh * 0.4;
    this.mouth = box(0.44, 0.24, 0.14, 0.06, dark);
    this.mouth.position.set(0, this.mouthRestY, hd / 2 - 0.13);
    this.mouth.scale.y = 0.001;
    this.head.add(this.mouth);

    // ── coda: quattro anelli concatenati = ricciolo ──────────────────────
    // bassa: montata più in alto, da accovacciato spuntava sopra la testa
    this.tailRoot.position.set(0, bh * 0.08, -bd / 2 + 0.05);
    let parent: THREE.Group = this.tailRoot;
    for (let i = 0; i < 4; i += 1) {
      const link = new THREE.Group();
      link.position.set(0, 0, -0.16);
      const seg = box(0.16, 0.16, 0.22, 0.065, limb);
      seg.position.z = -0.09;
      link.add(seg);
      parent.add(link);
      this.tailLinks.push(link);
      parent = link;
    }
    this.bodyPivot.add(this.tailRoot);

    // ── zampe: quattro tozze, agli angoli ────────────────────────────────
    const legH = lerp(0.42, 0.8, traits.leg);
    this.legH = legH;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = box(0.46, legH, 0.46, 0.16, limb);
        const y = -bh / 2 - legH * 0.3;
        const z = sz * bd * 0.27;
        leg.position.set(sx * bw * 0.3, y, z);
        this.bodyPivot.add(leg);
        this.legs.push(leg);
        this.legRestY.push(y);
        this.legRestZ.push(z);
      }
    }

    // le zampe toccano y=0: il porcetto sta sul pavimento, non fluttua
    this.restY = bh / 2 + legH * 0.8;
    this.bodyPivot.position.y = this.restY;

    // l'ombra sta nel gruppo del porcetto, così lo segue quando gira per la
    // stanza; è un disco piatto, quindi ruotare con lui non si vede
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(bw, bd) * 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.005;
    this.object.add(this.shadow);
  }

  /** Applica una posa. Nessuno stato interno: stessa posa = stesso fotogramma. */
  public apply(pose: Pose): void {
    // respiro: il corpo si gonfia, non si allunga
    const amp = 0.02 + pose.slump * 0.014;
    const swell = 1 + pose.breath * amp;
    this.body.scale.set(swell, 1 + pose.breath * amp * 0.55, swell);

    // ── accovacciarsi: le zampe si raccorciano e la pancia scende con loro ─
    const legScale = 1 - pose.crouch * 0.82;
    const tuck = this.legH * (1 - legScale);

    // ── andatura: le zampe si muovono a coppie diagonali, come un quadrupede ─
    const gait = pose.walk;
    this.legs.forEach((leg, i) => {
      // 0 = dietro-sx, 1 = avanti-sx, 2 = dietro-dx, 3 = avanti-dx
      const diagonal = i === 1 || i === 2 ? 0 : Math.PI;
      const swing = Math.sin(pose.walkPhase + diagonal);
      const lift = Math.max(0, swing);
      leg.scale.y = legScale;
      leg.position.y = this.legRestY[i] + tuck / 2 + lift * 0.11 * gait + pose.bounce * 0.05;
      leg.position.z = this.legRestZ[i] + swing * 0.17 * gait;
    });

    // il corpo sobbalza a ogni appoggio: due volte per ciclo di passo
    const bob = Math.abs(Math.sin(pose.walkPhase)) * 0.035 * gait;
    this.bodyPivot.position.y =
      this.restY - pose.slump * 0.17 - tuck + bob + pose.bounce * 0.2;
    this.bodyPivot.rotation.x = pose.slump * 0.06 + pose.crouch * 0.04;
    this.bodyPivot.rotation.z = pose.shake * 0.12 + Math.sin(pose.walkPhase) * 0.03 * gait;

    this.head.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);

    this.ears.forEach((pivot, i) => {
      const side = i === 0 ? -1 : 1;
      // riposo = aperte a ~25°; earLift=1 le porta verticali, -1 le affloscia
      pivot.rotation.z = side * (0.44 - pose.earLift * 0.52);
      pivot.rotation.x = -0.1 + pose.earLift * 0.26 + pose.earTwitch * side;
    });

    this.snout.position.x = pose.snoutQuiver * 0.045;
    this.snout.rotation.z = pose.snoutQuiver * 0.05;

    const open = Math.max(0, pose.eyeOpen);
    const lids = Math.min(open, 1); // 0 chiuso, 1 aperto
    const wide = 1 + Math.max(0, open - 1) * 0.55; // >1 = spalancato in alert
    for (const eye of this.eyes) {
      eye.sclera.scale.set(wide, Math.max(0.001, lids * wide), 1);
      eye.pupil.scale.set(wide, Math.max(0.001, lids * wide), 1);
      eye.pupil.visible = lids > 0.12;
      eye.pupil.position.x = pose.pupilX * 0.1;
      eye.pupil.position.y = pose.pupilY * 0.1 * lids;
      eye.shut.scale.y = Math.max(0.001, 1 - lids);
      eye.shut.visible = lids < 0.92;
    }

    this.mouth.scale.y = Math.max(0.001, pose.mouthOpen);
    this.mouth.position.y = this.mouthRestY - pose.mouthOpen * 0.03;

    this.cheekMat.opacity = pose.blush * 0.8;

    this.tailRoot.rotation.y = pose.tailWag;
    this.tailLinks.forEach((link, i) => {
      // ogni anello ruota un po' di più: la somma è il ricciolo
      link.rotation.x = 0.3 + pose.tailCurl * (0.5 + i * 0.14);
      link.rotation.z = pose.tailCurl * 0.22;
    });

    // accovacciato l'ombra si allarga e si scurisce: è più vicino al pavimento
    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = 0.2 + pose.crouch * 0.1;
    const spread = 1 + pose.crouch * 0.12 - bob * 0.6;
    this.shadow.scale.set(spread, spread, 1);
  }

  public dispose(): void {
    this.object.traverse((node) => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
  }

  public get shape(): Traits {
    return this.traits;
  }
}
