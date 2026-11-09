/**
 * L'umore che colora la voce (ADR-125 §6). Con OpenAI era una riga di
 * `instructions`; i modelli ElevenLabs leggono invece un **tag audio** in testa
 * al testo, e non lo pronunciano (verificato ritrascrivendo l'audio).
 *
 * Le etichette sono quelle di `@ugo/psyche` (`pickLabel`): un umore che non
 * ha un tono dedicato — sereno compreso — non porta tag, e la voce resta
 * quella del gene, senza colore aggiunto.
 */

const TAG_BY_MOOD: readonly (readonly [prefix: string, tag: string])[] = [
  ["in ansia", "[nervous]"],
  ["spaventat", "[nervous]"],
  ["offeso", "[annoyed]"],
  ["mogio", "[sad]"],
  ["in letargo", "[tired]"],
  ["gasato", "[excited]"],
  ["annoiato", "[bored]"],
  ["curioso", "[curious]"],
];

export function audioTagFor(mood: string | undefined): string | undefined {
  if (mood === undefined) return undefined;
  const label = mood.trim().toLowerCase();
  return TAG_BY_MOOD.find(([prefix]) => label.startsWith(prefix))?.[1];
}

export function taggedText(text: string, mood: string | undefined): string {
  const tag = audioTagFor(mood);
  return tag === undefined ? text : `${tag} ${text}`;
}
