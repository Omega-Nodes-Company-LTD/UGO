/**
 * La palette di UGO (ADR-127): una sola, per il sito, il pannello, il muso e
 * la reception.
 *
 * Il rosa è quello del porcello, adulto: è l'**accento**, e si usa poco — il
 * gesto principale di una pagina, il segno di un dato, l'elemento corrente
 * del menu. Il resto è un neutro caldo, come una stanza di legno chiaro e non
 * come un ufficio. I colori di stato (bene, attenzione, critico) sono gli
 * stessi ovunque e non vanno mai da soli: viaggiano con una parola o una
 * forma (ADR-035).
 *
 * I contrasti sono una regola, non un gusto: `contrast.test.ts` li misura
 * (WCAG 2.2 AA) e diventa rosso se qualcuno ritocca un valore a occhio.
 */

export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  raised: string;
  line: string;
  lineStrong: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  data: string;
  dataSoft: string;
  good: string;
  warning: string;
  critical: string;
  info: string;
  focus: string;
}

export const LIGHT: Palette = {
  bg: "#f7f3ef",
  surface: "#fffdfb",
  surface2: "#f1ebe5",
  raised: "#ffffff",
  line: "#e6ddd5",
  lineStrong: "#cdbfb3",
  ink: "#1f1a17",
  ink2: "#564c45",
  ink3: "#73675f",
  accent: "#b23f66",
  accentSoft: "#b23f6614",
  onAccent: "#ffffff",
  data: "#b23f66",
  dataSoft: "#b23f6624",
  good: "#2a7444",
  warning: "#8f5410",
  critical: "#b83232",
  info: "#2f6399",
  focus: "#2f6399",
};

export const DARK: Palette = {
  bg: "#141110",
  surface: "#1c1816",
  surface2: "#26211e",
  raised: "#211c1a",
  line: "#352e2a",
  lineStrong: "#4a413b",
  ink: "#f4eee9",
  ink2: "#c9beb5",
  ink3: "#a3978e",
  accent: "#ea8aab",
  accentSoft: "#ea8aab1f",
  onAccent: "#21101a",
  data: "#ea8aab",
  dataSoft: "#ea8aab2e",
  good: "#6fcf8f",
  warning: "#ecaa55",
  critical: "#f08585",
  info: "#82b4ea",
  focus: "#82b4ea",
};

/** Le coppie che devono reggere, con la soglia: testo 4.5, segni d'interfaccia 3. */
export const CONTRAST_PAIRS: readonly [keyof Palette, keyof Palette, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink2", "bg", 4.5],
  ["ink2", "surface2", 4.5],
  ["ink3", "surface", 4.5],
  ["ink3", "bg", 4.5],
  ["onAccent", "accent", 4.5],
  ["accent", "surface", 4.5],
  ["good", "surface", 4.5],
  ["warning", "surface", 4.5],
  ["critical", "surface", 4.5],
  ["info", "surface", 4.5],
  ["lineStrong", "surface", 1.5],
];
