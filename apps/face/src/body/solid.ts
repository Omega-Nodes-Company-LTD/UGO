import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Il mattone di tutto ciò che si vede: un cubo con gli spigoli tondi.
 *
 * Estratto da `pig.ts` quando gli arredi hanno cominciato a servirsene
 * (ADR-056). Un cuscino disegnato con una `box()` copiata sarebbe una seconda
 * definizione della stessa cosa, e la seconda definizione è sempre quella che
 * non riceve la correzione — qui per esempio il fermo sul raggio, che senza
 * degenera la geometria e fa sparire il pezzo invece di renderlo spigoloso.
 */
export function box(
  w: number,
  h: number,
  d: number,
  r: number,
  material: THREE.Material,
): THREE.Mesh {
  // the radius cannot exceed half the smallest side, or the geometry degenerates
  const safe = Math.min(r, Math.min(w, h, d) / 2 - 0.001);
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, safe), material);
}
