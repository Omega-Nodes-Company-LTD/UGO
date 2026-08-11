# Spike — il porcetto in tre dimensioni, generato dal codice

> **Stato: spike, non codice di produzione.** Non è agganciato a `apps/face`, non entra in
> nessuna build, non è coperto da test. Serve a decidere una cosa sola, e poi o diventa un ADR
> o si cancella con un `git rm -r`.

## La domanda a cui risponde

«Ha senso dare a UGO un corpo con tantissimi stati, e possiamo ottenerlo in browser senza
stravolgere tutto?»

La risposta che questo spike mette sotto gli occhi: **sì, e senza importare niente**. Il porcetto
è costruito a runtime da una decina di solidi arrotondati (`RoundedBoxGeometry`), quindi nel
repository non entra nessun asset binario, nessuna texture, nessuna licenza di terzi.

## Cosa dimostra davvero

1. **«Tantissimi stati» non si elencano, si compongono.** Tre strati sovrapposti:

   | Strato | Cosa fa | Dove sta |
   |---|---|---|
   | **Posa continua** | venti canali alimentati dalle sei variabili di psiche (`§5.3`) | `pose.ts`, puro |
   | **Stato discreto** | i sei stati di `§4.1`, che *inclinano* la posa, non la sostituiscono | dal WS di soul |
   | **Gesti** | sbadiglio, scrollata, starnuto: eventi che iniziano e finiscono | `gesture.ts`, puro + un driver |

   Cento stati enumerati sarebbero cento cose da scrivere, nominare e testare — e comunque con
   stacchi netti fra l'una e l'altra. Venti canali continui danno una combinatoria molto più
   grande di cento, e restano venti cose da mantenere. Oggi il renderer 2D riceve solo `umore` e
   `stress`, e disegna solo `umore`.
2. **La forma è separata dal movimento.** `Traits` decide le proporzioni, `Pose` decide la posa.
   È l'aggancio naturale per `trait_sets` (ADR-015), che esiste nello schema dalla nascita e non
   pilota niente: due gosini della stessa casa possono essere diversi **di corpo**, non solo di
   ricordi.
3. **Il corpo vive anche quando non gli parli.** Lasciato in `idle` con la noia alta, gira per la
   stanza, si ferma e mette il grugno a terra a grufolare; addormentato si accovaccia, con le
   zampe raccolte e la pancia a terra. È un piccolo driver a stati (`wander.ts`), non
   un'animazione registrata: la voglia di muoversi esce da `noia` ed `energia`.
4. **Il costo è noto**: ~138 kB compressi in tutto (three.js incluso), zero byte di mesh.

## Cosa NON dimostra, e va misurato sul ferro vero

- **La batteria** sul Nothing 3a Pro. La modalità portable qui è simulata (~2 fps in idle) ma il
  numero che conta è una giornata di lavoro, e si ottiene solo col telefono.
- **Il rendering software** di Chromium headless per `apps/meet-face` (post-v1): in questo
  container, con SwiftShader, la scena gira a **2–6 fps**. Funziona, ma non è gratis.

## Come si guarda

```bash
cd spikes/pig3d
npm install            # three + esbuild + playwright, fuori dal workspace pnpm
npm run build          # genera preview.html (autoconsistente, apribile con un doppio clic)
```

`preview.html`, `bundle.js` e `node_modules/` non sono versionati: si rigenerano dal sorgente.

## Struttura, che è già la proposta

| File | Cosa fa | Dove andrebbe |
|---|---|---|
| `src/pose.ts` | **puro**: (stato, psiche, sguardo, tempo, locomozione, gesto) → posa | `apps/face/src/pose.ts`, unit-testabile come `packages/psyche` |
| `src/gesture.ts` | **puro**: (gesto, progresso) → scostamento, più il driver che tiene l'orologio | `apps/face/src/gesture.ts` |
| `src/wander.ts` | il driver del movimento: posizione, direzione, cosa sta facendo | `apps/face/src/wander.ts` |
| `src/pig.ts` | geometria e applicazione della posa | `apps/face/src/renderer3d.ts`, dietro la stessa interfaccia del renderer 2D |
| `src/main.ts` | scena, luci, banco di prova con i cursori | resta qui: è il banco, non il prodotto |

La divisione che conta è **puro / driver**: le funzioni pure si testano con numeri dentro e numeri
fuori (proprietà: «le orecchie sono monotone in `umore`», «occhi chiusi ⟺ dorme o batte le
palpebre», «nessun canale esce dal suo intervallo»), e sono una decina di test che coprono tutto
lo spazio. Cento stati enumerati sarebbero cento asserzioni che nessuno scriverà.

Il punto è `pose.ts`: **vale anche senza il 3D**. Sarebbe il primo commit da fare in ogni caso,
perché serve identico al renderer canvas che già esiste.

## Se si decide di adottarlo

Serve un **ADR**: cambiare il renderer del corpo di casa è strutturale. La decisione da mettere
per iscritto non è «passiamo al 3D», è **«due renderer dietro un'interfaccia, il 2D resta il
fallback»** — per WebGL assente, batteria critica, o headless senza GPU.
