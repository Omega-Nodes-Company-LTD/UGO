# ADR-053 — La voce del cliente resta nel suo browser

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: assistente ticket clienti
**Estende**: il perimetro di [ADR-016](./016-percezione-multimodale-e-biometria.md) e
[ADR-045](./045-riconoscere-davvero.md)

## Il problema

La reception è voice-first: il cliente parla, il gosino risponde a voce. Ma ADR-016 ha tracciato
un perimetro netto — l'enrollment e il riconoscimento biometrico vivono **solo** nel corpo di
casa — e ADR-045 lo ha ribadito aggiungendo che gli embedding vocali sono dati ex art. 9 GDPR,
con base giuridica nel consenso esplicito della persona. ADR-016 aveva perfino previsto questo
momento: «se in futuro si volesse riconoscere qualcuno tramite il wearable o il meeting bot,
quel giorno servono base giuridica esplicita, informativa e DPIA».

Quel giorno non è oggi, e questa ADR esiste per dirlo prima che qualcuno lo chieda.

## La decisione

Sulla reception la voce è **interamente on-device**, nel browser del cliente:

- lo speech-to-text è `SpeechRecognition` del browser; il text-to-speech è `speechSynthesis`,
  con la voce deterministica per gosino (lo stesso pattern `voiceOf` del corpo di casa). Al
  server arriva **solo testo già trascritto** — lo stesso principio di ADR-006 per il corpo;
- **non esiste un percorso di upload audio**: il contratto delle rotte `/v1/reception/*` non ha
  un campo audio, e non lo avrà. Non è una policy da rispettare, è un'assenza strutturale —
  il modo più affidabile di non fare una cosa è non costruire il tubo;
- sul canale reception **non si crea, non si aggiorna e non si interroga** alcun
  `recognition_profile`. Il cliente è identificato dal suo token (ADR-052), mai dalla voce;
- browser senza `SpeechRecognition`: la suite lo dichiara e degrada a tastiera. La voce è il
  canale primario, non un requisito.

## Conseguenze

- niente DPIA per la voce della reception: nessun dato biometrico viene trattato, perché
  nessun audio lascia il dispositivo del cliente. Il giorno in cui qualcuno volesse
  «riconoscere il cliente dalla voce», questa ADR è il muro da abbattere consapevolmente —
  con base giuridica, informativa e DPIA, come ADR-016 pretende;
- la qualità dello STT dipende dal browser del cliente, e va accettato: è il prezzo del
  perimetro, ed è lo stesso compromesso già fatto per il corpo di casa;
- l'informativa della reception dice al cliente, in italiano piano, che l'audio non lascia il
  suo browser — perché la privacy che non si dichiara non rassicura nessuno.
