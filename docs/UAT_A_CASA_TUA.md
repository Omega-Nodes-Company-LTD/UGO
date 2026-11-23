---
title: "UGO a casa tua — protocollo di accettazione"
description: "La prova con una persona non tecnica (MKT-10.10): cosa si misura, come si conduce, quando passa."
version: "0.1.0"
last_updated: "2026-11-23"
author: "Senior Principal Engineer & Privacy Officer"
---

# Protocollo di accettazione — «A casa tua» (MKT-10.10)

Questo protocollo si esegue **una volta per sistema operativo** (Windows, macOS, Linux) con una
**persona non tecnica** — qualcuno che non ha mai visto il repo, non sa cos'è un container e
non conosce UGO oltre a quello che c'è scritto in `documentation/01-getting-started/a-casa-tua.md`.
La prova **non è superata** finché non l'ha fatta una persona vera: la parte tecnica
(sezione 5) è già verificata, e non la sostituisce.

## 1. Regole della prova

- **Chi conduce non aiuta.** Si siede accanto, legge le consegne ad alta voce, **non tocca la
  tastiera, non suggerisce**. Annota ogni esitazione, ogni errore, ogni frase detta ad alta voce.
- Se la persona è ferma da **5 minuti**, si annota «bloccato a: …», si dà *un* aiuto e si
  segna che è stato dato. Un aiuto = un punto debole della guida o del kit.
- Si registra lo schermo (con il consenso della persona), senza audio dell'ambiente.
- La persona usa **il suo computer**, con Docker non ancora installato se possibile: è la prima
  cosa da cui il kit deve saperla portare fuori.

## 2. Preparazione (a cura di chi conduce)

1. Una creatura **di prova**, con dentro almeno: 20 ricordi, qualche pagina di diario, un secondo
   gosino, una foto. Mai dati veri di nessuno.
2. Il file `.ugosoul` esportato dalla casa di prova, **modo Trasloco**, e la frase di recupero
   **scritta su un foglio** consegnato alla persona (come farebbe un utente vero).
3. Una chiave OpenRouter di prova con **tetto di spesa basso** (qualche dollaro).
4. La cartella `ops/home` del kit e `documentation/01-getting-started/a-casa-tua.md`
   (stampata o aperta): sono le **sole** istruzioni.
5. Verificare prima, senza la persona, che sulla macchina d'origine l'esportazione sia accesa
   (`UGO_SOUL_EXPORT=on`).

## 3. Le consegne (si leggono una alla volta)

1. «Questo è un file con dentro la tua creatura e questo foglio con la sua frase segreta.
   Voglio che tu la faccia vivere su questo computer. Hai a disposizione questa guida.»
2. (Quando serve) «Questa è la tua chiave del servizio che paga le risposte.» *(la chiave di prova)*
3. «Ora chiedile come si chiama e cosa si ricorda di *[un fatto noto della creatura di prova]*.»
4. «Chiudi tutto, spegni il computer, riaccendilo e riportala in vita.»
5. «Fai una copia di sicurezza, e dimmi dove la metteresti e perché.»

## 4. Cosa si misura

| # | Misura | Criterio di riuscita |
|---|---|---|
| 1 | Tempo dalla consegna 1 alla prima risposta della creatura (consegna 3) | **≤ 30 minuti**, escluso il tempo di costruzione/scaricamento dell'immagine (si annota a parte) |
| 2 | Aiuti dati | **0** per la riuscita piena; ≥ 1 va nel rapporto come difetto |
| 3 | La persona sa dire **cosa le costerà** (OpenRouter, a consumo) | Lo dice con parole sue prima dell'installazione |
| 4 | La persona sa dire **cosa non va perso** (la frase; la coppia di file del salvataggio) | Lo dice con parole sue |
| 5 | La creatura risponde e **ricorda il fatto noto** (stessa identità, stessa memoria) | Sì, alla prima o alla seconda domanda |
| 6 | Dopo spegnimento e riaccensione, la creatura c'è | Sì, senza rifare il setup |
| 7 | Messaggi d'errore incontrati | Ogni errore è **capito** dalla persona leggendo la pagina, senza chiedere |
| 8 | Il passo Docker (assente / spento), se capita | Il kit lo spiega e la persona sa cosa fare |
| 9 | La persona sa dove sta la copia di sicurezza e come si usa | Sì |
| 10 | Domanda finale: «cosa ti ha fatto più paura?» | Si annota così com'è, senza correggere |

La prova **passa** quando 1, 3, 4, 5, 6 e 9 sono soddisfatti **e** nessun errore (7) ha
lasciato la persona senza una via d'uscita. Ogni aiuto (2) e ogni «paura» (10) produce una
voce nel backlog, anche se la prova passa.

## 5. Evidenze tecniche già raccolte (2026-11-23, Windows 10 + Docker Desktop, senza persona)

Fatte sul kit **vero**, con l'immagine costruita da `soul.Dockerfile` e i lanciatori:

- `start.ps1` da zero: crea `.env`, avvia Postgres e soul, legge il link con il gettone dai log,
  lo apre. Container `healthy`.
- Flusso `/setup` attraverso la **porta pubblicata** `127.0.0.1:3000`: carica → installa → il
  setup scompare (404) e parte il runtime, `/health` ok.
- Il processo gira come utente **non root** (uid 1000); `data.key`, `internal.token`,
  `openrouter.key` sono 0600 di proprietà di quell'utente.
- Riavvio del contenitore: la casa c'è, nessun nuovo setup.
- `ugo.ps1 backup` → `restore` **con soul acceso** → dati tornati → `update` (salvataggio,
  costruzione, riavvio) → `/health` ok.

**Non coperto da queste evidenze**: macOS e Linux; la ricerca nei ricordi con vettori veri (richiede
`OPENROUTER_API_KEY` vera: `soulImportEmbeddings.integration.test.ts`); la risposta di chat vera
(l'archivio di prova non aveva ricordi né una chiave valida); Docker assente sul sistema; una
macchina con meno di 4 GB di RAM (i requisiti sono ipotesi: vedi la misura sotto).

## 6. Misure da prendere durante la prova (requisiti hardware)

Con la creatura di prova in conversazione per 10 minuti, annotare: memoria a riposo e di picco
(`docker stats`), CPU media, spazio occupato dai volumi, tempo di avvio a freddo. Servono a
sostituire le **ipotesi** di ADR-132 §3 (2 core, 4 GB, 20 GB) con numeri.

## 7. Rapporto

Un file per sistema operativo in `docs/uat/`, con: data, sistema, versione del kit, esito di ogni
riga della tabella, aiuti dati (con il punto esatto), citazioni testuali della persona, e le
voci di backlog che ne escono. **Niente nome della persona**: un codice (P1, P2…).
