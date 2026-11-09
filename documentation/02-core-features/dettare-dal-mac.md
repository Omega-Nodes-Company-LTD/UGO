---
title: "Dettare in qualunque app dal Mac"
description: "UGO Dettatura: tieni premuta una scorciatoia, parla, e il testo compare dove sta il cursore. Con un'altra scorciatoia UGO ti risponde."
version: "0.1.0"
last_updated: "2026-11-09"
author: "ThinkPink Studio"
---

# Dettare in qualunque app dal Mac

UGO Dettatura è una piccola app per Mac che vive nella barra dei menu. Tieni premuta una
scorciatoia, parli, la lasci: il testo compare dove stava il cursore, in qualunque app — la posta,
un documento, una chat, il terminale. La tua voce la trascrive UGO sul suo server, e **non passa
da nessun servizio esterno**.

## Prima volta

1. Apri **UGO Dettatura**. L'icona compare nella barra dei menu in alto, non nel Dock.
2. Nel [pannello di UGO](./il-pannello.md) apri **Dispositivi** e chiedi un **codice di
   abbinamento**. Vale dieci minuti.
3. Scrivi il codice nella finestra di UGO Dettatura e premi **Abbina**.
4. Quando macOS lo chiede, concedi il **Microfono** e l'**Accessibilità** (Impostazioni di Sistema
   → Privacy e sicurezza → Accessibilità). L'Accessibilità serve a incollare il testo nell'app che
   stai usando.

## Dettare

1. Metti il cursore dove vuoi scrivere.
2. Tieni premuto **⌃⌥D** (Control, Opzione, D) e parla.
3. Lascia i tasti: dopo un istante il testo compare.

Mentre ti ascolta, accanto all'icona compare un pallino. Puoi dettare a lungo: UGO divide il
discorso nelle pause e lo ricuce. Quello che avevi negli appunti prima di dettare torna al suo
posto.

Se preferisci non tenere premuto, in **Impostazioni** scegli «Premi per cominciare, premi per
finire».

## Chiedere a UGO

Tieni premuto **⌃⌥R** e fai la tua domanda. Si apre una piccola finestra con la risposta di UGO,
e la senti con la sua voce.

## Se qualcosa non va

| Cosa vedi                                    | Cosa vuol dire                                               | Cosa fare                                                                |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| «abbina prima questo Mac a UGO»              | Il Mac non ha ancora un codice, o il codice è stato revocato | Chiedi un codice nuovo dal pannello                                      |
| «negli appunti: concedi l'Accessibilità…»    | Manca il permesso per incollare da solo                      | Concedilo nelle Impostazioni di Sistema; nel frattempo incolla tu con ⌘V |
| «la dettatura non è accesa su questo UGO»    | Sul server di UGO manca la trascrizione di casa              | Chi amministra il server deve accendere il servizio di percezione        |
| «la trascrizione di UGO non risponde adesso» | Il server è lento o irraggiungibile                          | Riprova fra poco                                                         |
| «troppo corto, non ho sentito niente»        | Hai parlato per meno di un secondo                           | Tieni premuto un po' di più                                              |

## Privacy

- L'audio esce dal Mac **solo** mentre tieni premuta la scorciatoia, e va solo al server di UGO.
- La trascrizione la fa UGO sul suo server: nessuna azienda esterna sente la tua voce.
- Il codice di abbinamento diventa un token custodito nel **Portachiavi** del Mac. Per scollegare
  il Mac: **Impostazioni → Scollega questo Mac**, oppure revoca il dispositivo dal pannello.
- Solo per **Chiedi a UGO**: la domanda va al modello di UGO e la risposta viene letta con la sua
  voce, come quando gli parli dal telefono.
