---
title: "Entrare da fuori casa"
description: "Abbinare un telefono, un Mac o un browser a UGO quando sta sul web, con un codice o con il link via email."
version: "0.1.0"
last_updated: "2026-11-09"
author: "ThinkPink Studio"
---

# Entrare da fuori casa

UGO può stare su un indirizzo web (per esempio `https://ugo.omeganodes.ai`) invece che solo nella
rete di casa. Su Internet chiunque può bussare, quindi ogni dispositivo entra solo con una
**chiave sua**. Questa pagina spiega come dargliela.

## Abbinare un dispositivo con il codice

È la strada più semplice, e funziona per il telefono, il Mac, l'app e qualunque browser.

1. Apri il **pannello** da un dispositivo che è già dentro (o col token di servizio di chi
   amministra il server).
2. Vai alla voce **Abbina un dispositivo** e premi **Genera un codice**.
3. Compare un codice come `K7QM-4XTR`. Vale **dieci minuti** e **una volta sola**.
4. Sul dispositivo nuovo apri UGO: compare la schermata **Fammi entrare**. Scrivi il codice e
   premi **Entra**. Maiuscole, spazi e trattino non contano.
5. Fatto. Il dispositivo compare nel pannello, fra **Le chiavi di casa**, come «dispositivo:
   iPhone» (o Mac, Android…).

Se il codice è scaduto o già usato, UGO lo dice: chiedine uno nuovo dal pannello. Dopo cinque
tentativi sbagliati in un minuto bisogna aspettare un minuto: serve a stancare chi prova a
indovinare.

## Entrare con l'email

Se chi amministra il server ha acceso l'accesso via email, nella schermata **Fammi entrare** puoi
scrivere il tuo indirizzo e premere **Mandami il link**.

- Ti arriva un'email «Entra in UGO» con un link. Vale **quindici minuti** e **una volta sola**.
- Aperto nel browser, ti fa entrare e ti tiene dentro per un mese.
- Aperto sul telefono con l'app installata, apre l'app e la fa entrare.
- La schermata risponde sempre allo stesso modo, anche a un indirizzo sbagliato: così nessuno può
  usarla per scoprire quali indirizzi sono quelli giusti.

Oggi il link parte solo verso l'indirizzo del titolare della casa.

## Togliere un dispositivo

Un telefono perso o un browser che non usi più: nel pannello, fra **Le chiavi di casa**, premi
**Revoca** accanto al dispositivo. Dalla richiesta successiva quel dispositivo torna alla schermata
**Fammi entrare**. Puoi revocare anche la chiave con cui stai guardando il pannello: se il telefono
è stato rubato, è proprio quella da bruciare.

## Se UGO resta solo nella rete di casa

Se il server non ha un indirizzo web, niente di questo serve: UGO si raggiunge come prima dalla
rete di casa o dalla rete privata (Tailscale), e la schermata **Fammi entrare** non compare.
