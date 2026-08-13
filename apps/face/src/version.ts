/**
 * Che versione del corpo sto guardando, e accorgersene da solo.
 *
 * Il problema era di diagnosi, non di funzionalità: davanti a un muso che non
 * risponde non c'era **modo di sapere** se il dispositivo stesse eseguendo il
 * codice appena rilasciato o quello di prima ancora in cache. Ogni ipotesi
 * costava un giro di deploy per essere smentita.
 *
 * L'identità di una versione è il nome del bundle che vite ha prodotto:
 * `index-Bqlezltc.js`. È un hash del contenuto, quindi cambia **esattamente
 * quando cambia il codice** e non cambia quando non cambia — nessuna variabile
 * d'ambiente da ricordare al deploy, nessun numero da incrementare a mano.
 *
 * Il corpo lo legge da `import.meta.url`, che in un modulo costruito è l'URL
 * del modulo stesso; soul legge dal disco quale bundle sta servendo. Se i due
 * non coincidono, questa pagina è vecchia.
 */

/** Quello che un modulo non costruito (`vite dev`) restituisce. */
export const UNVERSIONED = "dev";

/**
 * L'id di build dentro un nome di asset, o `UNVERSIONED`.
 *
 * `/assets/index-Bqlezltc.js` → `Bqlezltc`. In sviluppo l'URL è
 * `/src/version.ts` e non c'è nessun hash: la versione non esiste, e dire
 * «dev» è più onesto che inventare un numero.
 */
export function buildIdOf(url: string): string {
  return /\/index-([A-Za-z0-9_-]+)\.js(?:$|[?#])/.exec(url)?.[1] ?? UNVERSIONED;
}

/** Questa pagina. */
export function myBuildId(): string {
  return buildIdOf(import.meta.url);
}

/**
 * Va ricaricata?
 *
 * Solo quando **sappiamo entrambe** le versioni e sono diverse. Sconosciuta da
 * una delle due parti significa sviluppo, o un soul più vecchio della rotta: e
 * in nessuno dei due casi ricaricare aiuta, mentre ricaricare a vuoto su un
 * chiosco che sta parlando è peggio del problema che risolve.
 */
export function shouldReload(mine: string, served: string | undefined): boolean {
  if (served === undefined || served === UNVERSIONED) return false;
  if (mine === UNVERSIONED) return false;
  return mine !== served;
}
