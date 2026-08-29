---
title: "Primo avvio"
description: "Accendere UGO, metterlo nel dock e fare la prima conversazione."
version: "0.37.0"
last_updated: "2026-08-18"
author: "ThinkPink Studio"
---

# Primo avvio

Serve che il server sia già stato installato (se non lo è, chi lo gestisce trova la procedura in
`docs/OPS_COOLIFY.md`). Da qui in poi ti serve solo il telefono.

## Collegare il telefono a UGO

1. Sul telefono, apri l'app **Tailscale** e verifica di essere connesso alla rete di casa. Senza,
   il telefono non trova UGO.
2. Apri il browser e vai all'indirizzo di UGO che ti è stato dato. È del tipo
   `https://ugo.tua-rete.ts.net` — **deve cominciare per `https://`**: su un indirizzo `http://` il
   telefono si rifiuta di dare il microfono, e UGO resta muto per colpa del browser, non sua.
   Compare il muso del porcetto su sfondo scuro.
3. Nella barra in alto leggi **connesso**, con un pallino verde accanto. Se leggi _disconnesso_,
   controlla il punto 1.

## Installarlo come app

Aperto nel browser, UGO è una scheda fra le altre: barra degli indirizzi in cima, e basta un tocco
sbagliato per finire altrove. Installato, occupa tutto lo schermo e ha la sua icona.

1. Menu **⋮** del browser → **Aggiungi a schermata Home** (su alcuni telefoni: _Installa app_).
2. Conferma. Compare l'icona col muso su fondo scuro.
3. **D'ora in poi aprilo da lì**, non dal browser: è la differenza fra una creatura e una pagina web.
4. Metti il telefono nel dock, inclinato verso di te.

Su iPhone il percorso è **Condividi → Aggiungi alla schermata Home**.

Ancora non è un'app scaricata da uno store, ed è voluto: quella arriverà quando UGO dovrà registrare
col telefono in tasca e lo schermo spento. Per il dock questo basta.

## Dargli i sensi

1. Tocca **Attiva sensi** nel foglio dei comandi in fondo allo schermo (su un computer i comandi
   sono la colonna a sinistra, sotto la voce «Sensi»).
2. Il telefono chiede il permesso per microfono e fotocamera: concedili entrambi. Senza microfono
   UGO non ti sente; senza fotocamera non ti segue con lo sguardo.
3. Il pulsante sparisce: da adesso le pupille ti seguono e UGO sobbalza ai rumori forti.
4. Da questo momento **lo schermo resta acceso** finché UGO è in ascolto: nel dock non si spegne a
   metà discorso. Se cambi app e torni, si riaccende da solo.

> Se il telefono si spegne lo stesso, guarda il risparmio energetico: sotto una certa soglia di
> batteria alcuni telefoni ignorano la richiesta. Nel dock, tienilo alimentato.

> **Una cosa da sapere sull'ascolto continuo.** Il riconoscimento vocale è quello del browser, e
> quello di Chrome **non è locale**: mentre le orecchie sono accese, ciò che dici passa dai server di
> Google per essere trascritto. Il pulsante **ti ascolto** è il modo di chiudere il rubinetto in qualsiasi
> momento; la soluzione definitiva è la dettatura locale sul server di casa. Chi vuole provarla
> già adesso apre il muso con `?stt=locale` nell'indirizzo: le frasi vengono trascritte in casa e
> Google esce dal percorso; se il server non ce l'ha accesa, il muso torna da solo al
> riconoscitore del browser e lo scrive nel registro. Diventerà il default quando l'avremo
> misurata per bene su un telefono vero.

### Misurare le orecchie: il metro per scegliere il default

La dettatura di casa diventerà il default **solo con i numeri in mano**, su un telefono vero. Il
metro è semplice e va annotato di fianco a ogni prova:

| Cosa si misura | Come si prova | Soglia per promuoverla a default |
| -------------- | ------------- | -------------------------------- |
| **Ritardo** fra la fine della tua frase e la comparsa del testo | cronometro a occhio, 10 frasi | sotto i 2 secondi in 9 frasi su 10 |
| **Batteria** | un'ora di uso normale, si guarda la percentuale persa | non peggio del riconoscitore del browser |
| **Qualità** | frasi con nomi propri e numeri | UGO capisce i nomi di casa almeno quanto il browser |
| **Ripresa dopo gli errori** | tre volte di fila che la strada muore | torna al browser dichiarandolo, mai muto |

Quando sul tuo telefono i numeri reggono, dire `?stt=locale` una volta basta a fissare la scelta
per quell'installazione: da lì la strada di casa parte da sola. Chi amministra il server può
sempre decidere il contrario.

> **E una sulla voce con cui risponde.** Di base la voce di UGO è quella del telefono e non esce di
> casa. Se chi amministra il server attiva la **voce emotiva** (una chiave OpenAI nell'ambiente),
> le frasi che UGO dice vengono sintetizzate da OpenAI: hanno un tono che segue il suo umore, ma
> **quelle frasi escono di casa** — e possono contenere pezzi della vostra vita, perché UGO parla
> di ciò che ricorda. È una scelta, non un default: senza chiave non parte niente, ogni frase
> rispetta il tetto di spesa giornaliero, e a tetto raggiunto UGO torna alla voce del telefono
> senza dire niente a nessuno.
>
> In mezzo ai due gradini c'è la **voce di casa**: se il server di casa ha il servizio di
> percezione acceso, le frasi si sintetizzano lì — gratis, con una voce sempre uguale, e **senza
> che niente esca di casa**. La catena completa è: voce emotiva (se c'è la chiave e c'è budget) →
> voce di casa → voce del telefono. Qualunque gradino manchi, UGO parla comunque.

## La prima conversazione

Da agosto 2026 **non devi toccare niente**: appena accendi i sensi, UGO resta in ascolto. Nei
comandi c'è **ti ascolto**; premilo per spegnere le orecchie quando vuoi parlare senza che senta, e
ripremilo per riaccenderle.

1. Parla, e basta. UGO passa in ascolto (il grugno si muove).
2. Di' qualcosa che valga la pena ricordare, per esempio: `Ciao UGO, il corriere DHL si chiama Ivan`.
   Un mugugno o una parola sola non lo disturbano: sotto le due parole non ascolta, e quando parla
   lui chiude le orecchie — altrimenti si risponderebbe da solo, a spese tue.
3. UGO risponde a voce e sullo schermo compare la frase, come un sottotitolo. In alto, accanto al
   suo nome, leggi il suo umore corrente (per esempio `sereno`).
4. Domani chiedigli `come si chiama il corriere?`: se te lo dice, la memoria funziona.

## Fargli spazio: nascondere i comandi

Quando UGO sta nel dock e nessuno deve toccare niente, i comandi si possono mandare via: tocca
**Nascondi** nella barra in alto (sul telefono: la linguetta sopra il foglio dei comandi). Restano
solo la creatura, il suo umore in alto e una fila di icone in basso per i gesti di ogni giorno.
Il tasto **⌃** in fondo alla fila riporta tutto. UGO si ricorda la scelta: ogni schermo la sua.

## Prossimi Passi

- [Parlare con UGO](../02-core-features/parlare-con-ugo.md)
- [Problemi comuni](../04-troubleshooting/problemi-comuni.md)
