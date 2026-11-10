---
title: "Informativa sulla privacy"
description: "Quali dati tratta UGO quando è raggiungibile dal web, perché, dove, per quanto tempo, e quali diritti hai."
version: "1.1.0"
last_updated: "2026-11-10"
author: "ThinkPink Studio"
---

# Informativa sulla privacy

Questa informativa vale per UGO quando è raggiungibile da un indirizzo web (per esempio
`https://ugo.omeganodes.ai`), ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679
(GDPR). Oggi UGO ha **un solo utente**: il titolare della casa. Le persone, gli animali e i
visitatori che UGO incontra in casa sono trattati secondo le regole descritte in
[I tuoi dati](../02-core-features/i-tuoi-dati.md).

## Chi è il titolare del trattamento

- Titolare: **[ ragione sociale o nome del titolare ]**
- Indirizzo: **[ indirizzo ]**
- Contatto per la privacy: **[ email ]**

## Quali dati, e perché

| Dato | Perché | Base giuridica |
|---|---|---|
| Le conversazioni con UGO, i ricordi, il diario | far funzionare il compagno: è il servizio stesso | esecuzione del servizio richiesto (art. 6.1.b) |
| La voce e il volto di chi vive in casa, se li insegni | riconoscere chi parla | consenso esplicito (art. 9.2.a), revocabile; mai per i minori |
| L'indirizzo email del titolare | mandare il link per entrare | esecuzione del servizio (art. 6.1.b) |
| Le chiavi dei dispositivi abbinati (solo come impronta SHA-256) e l'ultimo uso | sapere chi entra e poterlo revocare | legittimo interesse alla sicurezza (art. 6.1.f) |
| L'indirizzo IP di chi prova a entrare | limitare i tentativi (5 al minuto) | legittimo interesse alla sicurezza (art. 6.1.f) |
| Il registro delle azioni (chi ha fatto cosa, mai il contenuto) | rendere conto di accessi, esportazioni e cancellazioni | obbligo di accountability (art. 5.2) |

## Come sono protetti

- Testi delle conversazioni e trascrizioni sono **cifrati a riposo** (AES-256-GCM), con una chiave
  custodita separata dal database.
- Codici di abbinamento, link via email e chiavi dei dispositivi sono salvati **solo come
  impronta**: chi legge il database non trova niente che apra la casa.
- Ogni pagina viaggia solo su HTTPS, con intestazioni che impediscono di incorporarla in altri siti.
- I log non contengono testi, email né chiavi.

## A chi vanno i dati

UGO gira su server dedicati. Per alcune funzioni chiama fornitori esterni, sempre in qualità di
responsabili del trattamento:

| Fornitore | Cosa riceve | Perché | Dove |
|---|---|---|---|
| **OpenRouter** e i fornitori del modello che sceglie fra quelli ammessi (DeepInfra, Azure, Parasail, DigitalOcean) | il testo necessario a una risposta, le frasi da dire a voce, il testo dei ricordi da indicizzare e le foto che mandi o che lui guarda | comporre le risposte, ritrovare i ricordi, descrivere le foto, sintetizzare la voce | USA/UE; mai fornitori con sede in Cina; richieste con «nessuna conservazione» (zero data retention) e senza uso per addestramento |
| **OpenAI** (tramite OpenRouter) | l'audio di quello che dici, quando UGO ti ascolta col riconoscimento del server | trascriverlo in testo | USA; richieste **senza uso per addestramento**, ma su questo servizio la «nessuna conservazione» **non è disponibile**: se non vuoi che l'audio esca, usa il riconoscimento del browser |
| **ElevenLabs** (tramite OpenRouter) | le frasi che UGO dice ad alta voce | la voce | come sopra |
| **Resend** | l'email del titolare e il link per entrare | l'email «Entra in UGO» | USA |
| **Hetzner** (archivio S3) | audio, foto e backup, cifrati | conservarli | UE |

Il trasferimento verso gli USA avviene sulla base delle clausole contrattuali standard o del Data
Privacy Framework dei singoli fornitori.

## Per quanto tempo

| Dato | Per quanto |
|---|---|
| Codice di abbinamento | 10 minuti, poi inutilizzabile |
| Link via email | 15 minuti, poi inutilizzabile |
| Accesso dal web via email | 30 giorni, poi si rientra |
| Chiave di un dispositivo abbinato | finché non la revochi |
| Audio originali | 90 giorni |
| Backup | 30 giorni |
| Conversazioni e ricordi | finché esiste la casa, o finché non chiedi di dimenticarli |

## I tuoi diritti

Puoi chiedere in qualunque momento di accedere ai dati, portarli via in un file, correggerli,
farli cancellare, limitarne il trattamento od opporti, e revocare il consenso alla biometria. Due
di questi diritti sono già pulsanti nel pannello e sul muso: **esporta** e **dimentica** (vedi
[I tuoi dati](../02-core-features/i-tuoi-dati.md)). Per gli altri scrivi al contatto qui sopra.

Puoi anche presentare reclamo al **Garante per la protezione dei dati personali**
(www.garanteprivacy.it).

## Modifiche

Se cambiano i dati trattati o i fornitori, questa pagina cambia versione e data in testa.
