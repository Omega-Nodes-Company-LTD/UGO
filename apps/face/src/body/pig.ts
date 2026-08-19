import * as THREE from "three";
import type { Pose } from "./channels.js";
import { box } from "./solid.js";

/**
 * The body: rounded cubes generated at runtime. No binary asset, no texture,
 * no conversion pipeline, no third-party licence to interpret.
 *
 * Two parameter groups kept deliberately apart:
 *  - `Traits` is the SHAPE. It is the hook for `trait_sets` (ADR-015), which
 *    exists in the schema since birth and drives nothing: two gosini in the
 *    same account can differ in body, not only in memories.
 *  - `Pose` is the MOVEMENT, and comes from the psyche.
 */

export interface Traits {
  chonk: number; // 0 lanky .. 1 solid cube
  ear: number;
  snout: number;
  eye: number;
  leg: number;
  hue: number;
  /**
   * The coat (ADR-068). `spots` is a RECESSIVE gene: the expressed value
   * crosses the visible threshold only when both alleles are high, so a
   * spotted coat is genuinely rare and never a purchase. `tail` scales the
   * curl. Defaults match the gene catalog: founders look exactly as before.
   */
  spots: number;
  tail: number;
  /**
   * L'età che si vede (ADR-071): 0 fino a metà vita, poi le setole
   * sbiadiscono. Riflette la CONVERGENZA — ha finito di diventare sé stesso —
   * non una decrepitezza finta: niente posture curve, niente passo lento.
   */
  greying: number;
}

export const DEFAULT_TRAITS: Traits = {
  chonk: 0.62,
  ear: 0.55,
  snout: 0.55,
  eye: 0.5,
  leg: 0.45,
  hue: 0.95,
  spots: 0.1,
  tail: 0.5,
  greying: 0,
};

/** Below this the coat is plain: carriers (one high allele) show nothing. */
const SPOTS_VISIBLE_FROM = 0.45;

/**
 * Fixed patch catalog, fractions of the body box. Deterministic on purpose:
 * same genome, same coat — the pattern is the creature's, not the frame's.
 */
const SPOT_SITES: readonly {
  axis: "x" | "z";
  side: number;
  y: number;
  along: number;
  size: number;
}[] = [
  { axis: "x", side: -1, y: 0.16, along: -0.12, size: 0.66 },
  { axis: "x", side: 1, y: -0.02, along: 0.2, size: 0.5 },
  { axis: "z", side: -1, y: 0.12, along: 0.22, size: 0.55 },
  { axis: "x", side: 1, y: 0.22, along: -0.3, size: 0.42 },
  { axis: "x", side: -1, y: -0.14, along: 0.34, size: 0.38 },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Leg {
  mesh: THREE.Mesh;
  restY: number;
  restZ: number;
  /** true for the two at the head end: they fold differently */
  front: boolean;
  /** trot: the two diagonals swing half a cycle apart */
  diagonal: number;
}

interface Eye {
  sclera: THREE.Mesh;
  pupil: THREE.Mesh;
  /** the arc left behind when the eye closes */
  shut: THREE.Group;
}

export class Pig {
  public readonly object = new THREE.Group();

  private readonly bodyPivot = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly ears: THREE.Group[] = [];
  /**
   * Il muso, esposto perché è il bersaglio della mela (ADR-058).
   *
   * `public` e non un metodo `hitTest` qui dentro: il raycasting ha bisogno
   * della camera, che è della stanza e non della creatura, e portarla dentro
   * `Pig` per un colpo di dito significherebbe dare al corpo una dipendenza
   * dalla scena che ha passato tre ADR a non avere.
   */
  public readonly snout = new THREE.Group();
  private readonly eyes: Eye[] = [];
  private readonly mouth: THREE.Mesh;
  private readonly tailRoot = new THREE.Group();
  private readonly tailLinks: THREE.Group[] = [];
  private readonly legs: Leg[] = [];
  private readonly shadow: THREE.Mesh;

  private readonly cheekMat: THREE.MeshStandardMaterial;
  private readonly restY: number;
  private readonly mouthRestY: number;
  /**
   * Quanto può scorrere una pupilla senza uscire dall'occhio.
   *
   * Era `0.1` fisso per ogni genoma, cioè quasi il massimo per l'occhio più
   * piccolo e molto meno del possibile per il più grande — e uno sguardo che a
   * `|gaze| = 1` sposta la pupilla di un decimo di unità è uno sguardo che non
   * si vede. Il fermo vero è metà sclera meno metà pupilla; qui si sta appena
   * dentro, e si ricava dall'occhio invece che dal caso peggiore.
   */
  private readonly pupilTravel: number;
  private readonly legH: number;
  private readonly depth: number;

  public constructor(traits: Traits = DEFAULT_TRAITS) {
    /**
     * Greying desaturates and lightens: the pigment goes, the hue stays. A
     * grey pig is still a pink pig that has lived, not a different animal.
     */
    const grey = Math.min(1, Math.max(0, traits.greying));
    const aged = (saturation: number, lightness: number): THREE.Color =>
      new THREE.Color().setHSL(
        traits.hue,
        saturation * (1 - grey * 0.72),
        lightness + (1 - lightness) * grey * 0.35,
      );

    const skin = new THREE.MeshStandardMaterial({ color: aged(0.6, 0.77), roughness: 0.88 });
    const limb = new THREE.MeshStandardMaterial({ color: aged(0.55, 0.71), roughness: 0.88 });
    const snoutMat = new THREE.MeshStandardMaterial({ color: aged(0.52, 0.67), roughness: 0.82 });
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

    const bw = lerp(2.0, 2.5, traits.chonk);
    const bh = lerp(1.55, 2.05, traits.chonk);
    const bd = lerp(2.45, 2.15, traits.chonk);
    this.depth = bd;
    this.body = box(bw, bh, bd, 0.55, skin);
    this.bodyPivot.add(this.body);

    // coat spots (ADR-068): thin panels just proud of the flank, the cheek's
    // trick. Children of the body mesh so they breathe with it.
    const spotting = Math.max(0, (traits.spots - SPOTS_VISIBLE_FROM) / (1 - SPOTS_VISIBLE_FROM));
    const shown = Math.round(spotting * SPOT_SITES.length);
    if (shown > 0) {
      const spotMat = new THREE.MeshStandardMaterial({
        color: aged(0.5, lerp(0.6, 0.42, spotting)),
        roughness: 0.9,
      });
      for (const site of SPOT_SITES.slice(0, shown)) {
        const s = site.size * lerp(0.55, 0.9, spotting);
        const patch =
          site.axis === "x"
            ? box(0.1, s, s * 0.82, s * 0.3, spotMat)
            : box(s, s * 0.82, 0.1, s * 0.3, spotMat);
        if (site.axis === "x") {
          patch.position.set(site.side * (bw / 2 - 0.02), site.y * bh, site.along * bd);
        } else {
          patch.position.set(site.along * bw, site.y * bh, site.side * (bd / 2 - 0.02));
        }
        patch.name = "spot";
        this.body.add(patch);
      }
    }

    // head: a smaller cube sunk into the body — no neck, like the reference
    const hw = bw * 0.86;
    const hh = bh * 0.92;
    const hd = bd * 0.7;
    this.head.position.set(0, bh * 0.1, bd * 0.4);
    this.head.add(box(hw, hh, hd, 0.48, skin));
    this.bodyPivot.add(this.head);

    // ears sit ON TOP and set back: in front they would cover the eyes
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

    const eyeW = lerp(0.36, 0.58, traits.eye);
    const eyeH = eyeW * 1.15;
    // (sclera/2 - pupilla/2) = eyeW * (0.5 - 0.23) = 0.27; si resta sotto
    this.pupilTravel = eyeW * 0.25;
    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.position.set(side * hw * 0.245, hh * 0.1, hd / 2 - 0.06);

      // deep on purpose: the corner radius is capped at half the smallest side,
      // so a thin eye stays square no matter what radius you ask for
      const sclera = box(eyeW, eyeH, 0.26, eyeW * 0.34, white);
      sclera.position.z = 0.09;
      group.add(sclera);

      const pupil = box(eyeW * 0.46, eyeH * 0.5, 0.2, eyeW * 0.2, dark);
      pupil.position.z = 0.16;
      group.add(pupil);

      // closing is a squash, not a lid coming down: a lid over the face is
      // visible even when the eye is open. Underneath sits this arc, which
      // surfaces by itself as the sclera flattens to nothing.
      const shut = new THREE.Group();
      shut.position.set(0, -eyeH * 0.04, 0.03);
      for (const half of [-1, 1]) {
        const seg = box(eyeW * 0.56, 0.085, 0.1, 0.04, dark);
        seg.position.x = half * eyeW * 0.24;
        // outer end low: "∧" reads as sleep, "∨" reads as a scowl
        seg.rotation.z = half * 0.3;
        shut.add(seg);
      }
      shut.scale.y = 0.001;
      group.add(shut);

      const cheek = box(eyeW * 0.95, eyeW * 0.5, 0.08, 0.04, this.cheekMat);
      cheek.position.set(side * 0.14, -eyeH * 0.95, 0.06);
      group.add(cheek);

      this.head.add(group);
      this.eyes.push({ sclera, pupil, shut });
    }

    // under the snout but inside the silhouette: lower and it leaves the chin,
    // higher and it disappears behind the snout
    this.mouthRestY = -hh * 0.4;
    this.mouth = box(0.44, 0.24, 0.14, 0.06, dark);
    this.mouth.position.set(0, this.mouthRestY, hd / 2 - 0.13);
    this.mouth.scale.y = 0.001;
    this.head.add(this.mouth);

    // tail: four chained links make the curl. Mounted low, or it crests above
    // the head once he is lying down.
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
    // the tail gene scales the whole curl: a long tail is born, not bought
    this.tailRoot.scale.setScalar(lerp(0.72, 1.45, traits.tail));
    this.bodyPivot.add(this.tailRoot);

    const legH = lerp(0.42, 0.8, traits.leg);
    this.legH = legH;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const mesh = box(0.46, legH, 0.46, 0.16, limb);
        const restY = -bh / 2 - legH * 0.3;
        const restZ = sz * bd * 0.27;
        mesh.position.set(sx * bw * 0.3, restY, restZ);
        this.bodyPivot.add(mesh);
        const front = sz > 0;
        this.legs.push({
          mesh,
          restY,
          restZ,
          front,
          diagonal: (sx < 0) === front ? 0 : Math.PI,
        });
      }
    }

    this.restY = bh / 2 + legH * 0.8;
    this.bodyPivot.position.y = this.restY;

    // the shadow belongs to the pig's group so it follows him around the room
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(bw, bd) * 0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.005;
    this.object.add(this.shadow);
  }

  /** Applies a pose. No internal state: same pose in, same frame out. */
  public apply(pose: Pose): void {
    const amp = 0.02 + pose.slump * 0.014;
    const swell = 1 + pose.breath * amp;
    this.body.scale.set(swell, 1 + pose.breath * amp * 0.55, swell);

    // ── posture: front and back fold by different amounts, which is what
    // makes sitting look like sitting and not like a squat
    const rearFold = pose.sit * 0.78 + pose.lie * 0.88 + pose.crouch * 0.82;
    const frontFold = pose.sit * 0.06 + pose.lie * 0.8 + pose.crouch * 0.82;
    const gait = pose.walk;

    for (const leg of this.legs) {
      const fold = leg.front ? frontFold : rearFold;
      const swing = Math.sin(pose.walkPhase + leg.diagonal);
      leg.mesh.scale.y = Math.max(0.08, 1 - fold);
      leg.mesh.position.y =
        leg.restY + (this.legH * fold) / 2 + Math.max(0, swing) * 0.11 * gait + pose.bounce * 0.05;
      // lying is a sphinx: the front legs stretch out ahead instead of tucking
      leg.mesh.position.z =
        leg.restZ + swing * 0.17 * gait + (leg.front ? pose.lie * 0.34 : -pose.lie * 0.1);
    }

    const rearDrop = this.legH * rearFold;
    const frontDrop = this.legH * frontFold;
    const bob = Math.abs(Math.sin(pose.walkPhase)) * 0.035 * gait;
    this.bodyPivot.position.y = this.restY - pose.slump * 0.17 - (rearDrop + frontDrop) / 2 + bob +
      pose.bounce * 0.2;
    // sitting = rear on the floor, chest up: the body tips backwards
    this.bodyPivot.rotation.x =
      pose.slump * 0.06 - (rearDrop - frontDrop) / this.depth + pose.lean;
    this.bodyPivot.rotation.z = pose.shake * 0.12 + Math.sin(pose.walkPhase) * 0.03 * gait;

    this.head.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);

    this.ears.forEach((pivot, i) => {
      const side = i === 0 ? -1 : 1;
      pivot.rotation.z = side * (0.44 - pose.earLift * 0.52);
      pivot.rotation.x = -0.1 + pose.earLift * 0.26 + pose.earTwitch * side;
    });

    this.snout.position.x = pose.snoutQuiver * 0.045;
    this.snout.rotation.z = pose.snoutQuiver * 0.05;

    const open = Math.max(0, pose.eyeOpen);
    const lids = Math.min(open, 1);
    const wide = 1 + Math.max(0, open - 1) * 0.55;
    for (const eye of this.eyes) {
      eye.sclera.scale.set(wide, Math.max(0.001, lids * wide), 1);
      eye.pupil.scale.set(wide, Math.max(0.001, lids * wide), 1);
      eye.pupil.visible = lids > 0.12;
      eye.pupil.position.x = pose.pupilX * this.pupilTravel;
      eye.pupil.position.y = pose.pupilY * this.pupilTravel * lids;
      eye.shut.scale.y = Math.max(0.001, 1 - lids);
      eye.shut.visible = lids < 0.92;
    }

    this.mouth.scale.y = Math.max(0.001, pose.mouthOpen);
    this.mouth.position.y = this.mouthRestY - pose.mouthOpen * 0.03;

    this.cheekMat.opacity = pose.blush * 0.8;

    this.tailRoot.rotation.y = pose.tailWag;
    this.tailLinks.forEach((link, i) => {
      link.rotation.x = 0.3 + pose.tailCurl * (0.5 + i * 0.14);
      link.rotation.z = pose.tailCurl * 0.22;
    });

    const shadowMat = this.shadow.material as THREE.MeshBasicMaterial;
    shadowMat.opacity = 0.2 + (pose.lie + pose.crouch) * 0.1;
    const spread = 1 + (pose.lie + pose.crouch) * 0.12 - bob * 0.6;
    this.shadow.scale.set(spread, spread, 1);
  }

  public dispose(): void {
    this.object.traverse((node) => {
      if (node instanceof THREE.Mesh && node.geometry instanceof THREE.BufferGeometry) {
        node.geometry.dispose();
      }
    });
  }
}
