/**
 * Il cielo di stanotte, calcolato e non scaricato (gruppo 12).
 *
 * Posizione della luna e dei pianeti a occhio nudo: pura effemeride, zero
 * rete, zero costo per sempre. Gli algoritmi sono quelli a bassa precisione
 * di Paul Schlyter («How to compute planetary positions»), buoni a ~1°:
 * per decidere se Marte è quel puntino rossastro sopra il recinto bastano e
 * avanzano — questa non è astronomia, è scenografia onesta.
 *
 * Tutto puro e deterministico: la data entra, il cielo esce, e i test girano
 * in Node senza un browser.
 */

const DEG = Math.PI / 180;

/** giorni dall'epoca J2000.0 (2000-01-01 12:00 TT, che qui vale UTC) */
export function daysSinceJ2000(at: Date): number {
  return (at.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
}

const rev = (angle: number): number => angle - Math.floor(angle / 360) * 360;

/**
 * La fase della luna: 0 = nuova, 0.5 = piena, e `waxing` dice se cresce.
 *
 * Dall'elongazione media Sole-Luna (Meeus, forma semplificata): per disegnare
 * uno spicchio giusto e sapere da che parte è illuminato non serve di più.
 */
export function moonPhase(at: Date): { fraction: number; waxing: boolean } {
  const d = daysSinceJ2000(at);
  // longitudini medie di luna e sole, e l'elongazione fra le due
  const elongation = rev(218.316 + 13.176396 * d - (280.459 + 0.98564736 * d));
  const illuminated = (1 - Math.cos(elongation * DEG)) / 2;
  return { fraction: illuminated, waxing: elongation < 180 };
}

export interface SkyBody {
  name: "venere" | "marte" | "giove" | "saturno";
  /** altezza sull'orizzonte in gradi: sotto zero non si disegna */
  altitude: number;
  /** azimut in gradi da nord verso est: dove guardare, e dove dipingerlo */
  azimuth: number;
  /** il colore con cui l'occhio lo vede — Marte è il puntino rossastro */
  color: string;
}

/** Elementi orbitali kepleriani (Schlyter): a in AU, angoli in gradi. */
interface Elements {
  N: [number, number];
  i: [number, number];
  w: [number, number];
  a: number;
  e: [number, number];
  M: [number, number];
}

const PLANETS: { name: SkyBody["name"]; color: string; el: Elements }[] = [
  {
    name: "venere",
    color: "#f5f0d8",
    el: {
      N: [76.6799, 2.4659e-5],
      i: [3.3946, 2.75e-8],
      w: [54.891, 1.38374e-5],
      a: 0.72333,
      e: [0.006773, -1.302e-9],
      M: [48.0052, 1.6021302244],
    },
  },
  {
    name: "marte",
    color: "#e8a07a",
    el: {
      N: [49.5574, 2.11081e-5],
      i: [1.8497, -1.78e-8],
      w: [286.5016, 2.92961e-5],
      a: 1.523688,
      e: [0.093405, 2.516e-9],
      M: [18.6021, 0.5240207766],
    },
  },
  {
    name: "giove",
    color: "#f3e3c3",
    el: {
      N: [100.4542, 2.76854e-5],
      i: [1.303, -1.557e-7],
      w: [273.8777, 1.64505e-5],
      a: 5.20256,
      e: [0.048498, 4.469e-9],
      M: [19.895, 0.0830853001],
    },
  },
  {
    name: "saturno",
    color: "#e8d9a8",
    el: {
      N: [113.6634, 2.3898e-5],
      i: [2.4886, -1.081e-7],
      w: [339.3939, 2.97661e-5],
      a: 9.55475,
      e: [0.055546, -9.499e-9],
      M: [316.967, 0.0334442282],
    },
  },
];

/** posizione eliocentrica eclittica di un corpo dai suoi elementi */
function heliocentric(el: Elements, d: number): { x: number; y: number; z: number } {
  const N = rev(el.N[0] + el.N[1] * d) * DEG;
  const i = (el.i[0] + el.i[1] * d) * DEG;
  const w = rev(el.w[0] + el.w[1] * d) * DEG;
  const e = el.e[0] + el.e[1] * d;
  const M = rev(el.M[0] + el.M[1] * d) * DEG;

  // equazione di Keplero, iterata: per e < 0.1 tre giri sono già oltre il
  // decimo di grado
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 5; k += 1) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  const xv = el.a * (Math.cos(E) - e);
  const yv = el.a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);

  return {
    x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
    y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
    z: r * Math.sin(v + w) * Math.sin(i),
  };
}

/** posizione del sole (geocentrica eclittica), per passare a geocentrico */
function sunPosition(d: number): { x: number; y: number; lon: number } {
  const w = rev(282.9404 + 4.70935e-5 * d) * DEG;
  const e = 0.016709 - 1.151e-9 * d;
  const M = rev(356.047 + 0.9856002585 * d) * DEG;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = v + w;
  return { x: r * Math.cos(lon), y: r * Math.sin(lon), lon };
}

/** tempo siderale locale in gradi, dalla longitudine est (Schlyter §5b) */
function localSiderealDeg(d: number, lonEast: number): number {
  const { lon } = sunPosition(d);
  const gmst0 = rev(lon / DEG + 180);
  // frazione di giorno da mezzanotte UTC: d conta da mezzogiorno, quindi +0.5
  const dayFraction = d + 0.5 - Math.floor(d + 0.5);
  return rev(gmst0 + dayFraction * 360 + lonEast);
}

/** da eclittico geocentrico ad altezza/azimut per l'osservatore */
function toHorizon(
  gx: number,
  gy: number,
  gz: number,
  d: number,
  lat: number,
  lonEast: number,
): { altitude: number; azimuth: number } {
  const obl = (23.4393 - 3.563e-7 * d) * DEG;
  // eclittico → equatoriale
  const xe = gx;
  const ye = gy * Math.cos(obl) - gz * Math.sin(obl);
  const ze = gy * Math.sin(obl) + gz * Math.cos(obl);
  const ra = Math.atan2(ye, xe);
  const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye));
  // angolo orario
  const ha = rev(localSiderealDeg(d, lonEast) - ra / DEG) * DEG;
  const latR = lat * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(latR) + Math.cos(dec) * Math.cos(latR) * Math.cos(ha);
  const altitude = Math.asin(sinAlt) / DEG;
  const az =
    Math.atan2(
      Math.sin(ha),
      Math.cos(ha) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR),
    ) /
      DEG +
    180;
  return { altitude, azimuth: rev(az) };
}

/**
 * I pianeti a occhio nudo sopra l'orizzonte, adesso, da qui.
 *
 * Mercurio resta fuori di proposito: sta sempre incollato al sole, e da un
 * recinto illuminato non si vede comunque — disegnarlo sarebbe una bugia più
 * spesso che una verità.
 */
export function visiblePlanets(at: Date, lat: number, lonEast: number): SkyBody[] {
  const d = daysSinceJ2000(at);
  const sun = sunPosition(d);
  const out: SkyBody[] = [];
  for (const planet of PLANETS) {
    const h = heliocentric(planet.el, d);
    // geocentrico = eliocentrico del pianeta + posizione del sole
    const where = toHorizon(h.x + sun.x, h.y + sun.y, h.z, d, lat, lonEast);
    if (where.altitude > 3) {
      out.push({ name: planet.name, color: planet.color, ...where });
    }
  }
  return out;
}

/** Anche la luna va dipinta dove sta: bassa precisione (~2°), che qui basta. */
export function moonPosition(
  at: Date,
  lat: number,
  lonEast: number,
): { altitude: number; azimuth: number } {
  const d = daysSinceJ2000(at);
  const N = rev(125.1228 - 0.0529538083 * d) * DEG;
  const i = 5.1454 * DEG;
  const w = rev(318.0634 + 0.1643573223 * d) * DEG;
  const a = 60.2666; // raggi terrestri, ma per la direzione non conta
  const e = 0.0549;
  const M = rev(115.3654 + 13.0649929509 * d) * DEG;
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 5; k += 1) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.sqrt(xv * xv + yv * yv);
  const x = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
  const y = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
  const z = r * Math.sin(v + w) * Math.sin(i);
  return toHorizon(x, y, z, d, lat, lonEast);
}
