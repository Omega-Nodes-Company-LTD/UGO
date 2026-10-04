# ADR-127 — Un solo design system

**Stato: ACCETTATA** (2026-10-02). Precisa ADR-035 (il pannello ha due livelli) e ADR-096 (il chiosco
nascondibile): ne tiene la sostanza, ne cambia i colori.

## Contesto

Tre superfici, tre palette scollegate (argilla nel pannello, verde nel muso, rosa nella reception),
tre font, icone emoji in un posto e SVG nell'altro. Per una persona che passa dal sito al pannello al
muso, sono tre prodotti diversi.

## Decisione

1. **`packages/design`**: token CSS (colore, tipografia, spaziature, raggi, ombre, movimento), chiaro
   e scuro via `prefers-color-scheme` con override `[data-theme]`; un set di icone SVG (tratto 1.7,
   griglia 24, `currentColor`); il font Atkinson Hyperlegible, servito da noi.
2. **Esportato due volte**: come file `tokens.css` (muso e reception lo importano dal bundler) e come
   stringa `TOKENS_CSS` (pannello e sito sono template server-side senza bundler).
3. **Una palette di marca**: il rosa del porcello come accento, un neutro caldo per le superfici, i
   colori di stato (bene, attenzione, critico) uguali ovunque, contrasti AA verificati da un test.
4. **Il pannello si ordina per compiti**, non per tabelle: Oggi · I miei gosini · La casa · Insieme ·
   Mercato · Lavoro · Account · Operatore. Le voci che il piano o il ruolo non permettono **non si
   mostrano**: `GET /v1/me` dice al pannello chi sei e cosa puoi.
5. **Le rotte senza interfaccia** (rinomina stanza, luogo della stanza, ricerca nell'album, dote,
   dimensione del grafo) ricevono la loro.

## Note di implementazione (2026-10-04) — la revisione UI/UX

Il proprietario ha chiesto se le grafiche fossero «nello standard UI/UX più moderno». Non lo erano
del tutto: la revisione è stata fatta con screenshot reali di ogni pagina (desktop chiaro e scuro,
telefono) e axe-core, prima e dopo.

- **Trovato guardando**: la pagina «Da chi discende» non funzionava. Cessione, vetrina e genoma
  stavano dentro `PEDIGREE_STYLES`, cioè nel foglio di stile, dove il browser non esegue niente
  («loadGenome is not defined»). Spostati in `script/pedigreeActs.ts`; `script.test.ts` ora
  pretende che ogni funzione chiamata dal router esista e che nessun foglio di stile contenga
  script. Anche il test e2e della salute contava ancora il nodo GPU tolto da ADR-122.
- **Niente più `style=`**: 81 stili scritti a mano nel pannello e 30 nella reception sono classi
  (`page/stylesUi.ts`, `globals.css`); le larghezze calcolate viaggiano in `data-w`/`data-x` e le
  applica lo script dal CSSOM. La CSP pubblica vieta ora gli attributi di stile
  (`style-src-attr 'none'`); restano ammessi i blocchi `<style>` delle pagine composte dal server.
- **Il muso**: 39 colori fissi diventano token semantici derivati dal design system; restano fissi
  solo il bianco della carta del QR e il nero del velo sul corpo 3D.
- **Il telefono**: il menu del pannello è un cassetto con una barra che dice dove sei; i bersagli
  crescono a 44 px, i campi a 16 px (niente zoom forzato di iOS), le righe di campi vanno a capo.
- **Lo stato delle cose**: pulsante che lavora (`aria-busy`, non si preme due volte), riga di
  caricamento sulla pagina, campi sbagliati segnati dopo averli toccati (`:user-invalid`), fuoco
  sempre visibile, movimento ridotto rispettato, etichette sui campi che avevano solo il segnaposto.
- **Gli errori parlano sempre** (`routes/speakingErrors.ts`): ogni risposta d'errore di soul esce
  con titolo e spiegazione in italiano — cosa è successo, cosa fare — comprese quelle delle rotte
  scritte in inglese o in modo vago, i 404 di rotte che non esistono (una pagina vera per il
  browser), il JSON storto e i 5xx (con un riferimento al registro, mai lo stack). Pannello, muso,
  reception e CLI coprono quel che non arriva dal server: la rete che cade, un proxy che risponde
  HTML, un errore del database.
- **Risultato misurato**: 35 pagine del pannello × desktop e telefono, più sito e muso: zero
  violazioni axe, zero errori JavaScript, zero violazioni CSP.
- **Resta**: lo zoom del muso è bloccato apposta (un pizzico sul dock non deve ingrandirlo);
  `page/gosino.ts` resta sopra le 200 righe come prima di questa revisione.
