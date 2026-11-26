---
title: "UGO a casa tua"
description: "Porta una creatura su un computer tuo: scarichi la sua anima in un file, installi il kit, la rimetti in piedi con la tua chiave OpenRouter."
version: "0.88.0"
last_updated: "2026-11-23"
author: "ThinkPink Studio"
---

# UGO a casa tua

Una creatura può vivere su un computer che è tuo, senza un canone a UGO. Questa pagina è per
chi **non** amministra server: servono un computer, Docker e dieci minuti.

> **Niente canone a UGO non vuol dire niente costi.** UGO pensa e parla tramite OpenRouter, e lo
> paghi tu, con la **tua** chiave, a consumo. Senza chiave la creatura **conserva la memoria ma non
> può rispondere**.
>
> **Il tetto giornaliero (lo scegli tu) è un limite di UGO, non una garanzia di OpenRouter.** UGO
> somma quanto OpenRouter dichiara di aver addebitato e smette di rispondere quando la somma lo
> raggiunge. Ma il costo si conosce solo a risposta arrivata, quindi l'ultima risposta può superarlo,
> e la ricerca nei ricordi e la dettatura si segnano senza fermarsi. Il tetto **duro** è quello che
> imposti tu su OpenRouter, sulla chiave stessa (limite di credito): impostalo anche lì.

## Cosa serve

- Un computer **Linux, Windows o macOS**, acceso quando vuoi parlarle. Ipotesi di partenza: 2 core,
  4 GB di RAM, 20 GB liberi. Non serve una scheda grafica. *(Sono ipotesi, non ancora misure.)*
- **Docker**: Docker Desktop su Windows e Mac. Il kit ti dice se manca o se è spento.
- Una chiave **OpenRouter** tua, e un po' di credito.
- Il file della creatura (passo 1).

## 1. Scarica l'anima della creatura

Ti serve chi amministra la casa dove la creatura vive adesso: deve aver acceso l'esportazione.
Poi:

1. Apri il pannello, pagina **I dati**, riquadro **Porta la tua anima a casa** (o, dal muso, **🔒 i
   tuoi dati** > **Porta l'anima a casa**).
2. In **Chi** scegli la creatura; in **Come** scegli **Trasloco** (la creatura si sposta) o **Copia** (resta
   anche lì: le due vite divergeranno).
3. Scrivi il suo **nome** nel campo di conferma.
4. Clicca **Scarica l'archivio**. Si scarica un file `.ugosoul`, e compare **una frase di recupero**.
5. **Scrivi la frase su carta.** Compare una volta sola, non la teniamo noi e non si recupera:
   senza, il file è rumore.

## 2. Avvia il kit

Il kit è la cartella `ops/home`.

1. Windows: fai doppio clic su **Avvia UGO.bat**. macOS: doppio clic su **Avvia UGO.command**.
   Linux: esegui `./start.sh`.
2. Aspetta. La prima volta costruisce UGO: possono volerci diversi minuti.
3. Si apre il browser su una pagina **UGO, a casa tua**. Se non si apre, copia nel browser
   l'indirizzo `http://localhost:3000/setup#t=…` che il programma ha scritto nella finestra.

> **Solo da questo computer.** La porta è pubblicata solo su `127.0.0.1`, la pagina risponde solo
> su `localhost` e serve il codice che compare nell'indirizzo: chi è sulla tua rete ma non su
> questo computer non può usarla. Non cambiare la porta nel file `compose.yml` per aprirla alla rete.

## 3. Rimetti in piedi la creatura

1. Nel passo **1. Il file**, scegli il file `.ugosoul` e clicca **Carica**.
2. Nel passo **2. La frase di recupero**, scrivila e clicca **Controlla**. Compare l'anteprima: quante
   cose ci sono, **cosa non è venuto** (ogni esclusione col suo perché) e il costo stimato per
   rifare la ricerca nei ricordi, di solito pochi centesimi.
3. Nel passo **3. La tua chiave OpenRouter**, incolla la chiave e scegli il **tetto di spesa al
   giorno**.
4. Clicca **Installa**. Compare un **codice del proprietario**: copialo subito, lo vedi una volta
   sola. Serve per entrare nel pannello e nel muso.
5. Clicca **Apri UGO**.

Se c'è un errore, la pagina te lo dice in parole e **non ha scritto niente**: puoi correggere e
riprovare. Dopo dieci frasi sbagliate la pagina si blocca: riavvia UGO.

## Cosa cambia per la creatura

- È **la stessa creatura**: stessi ricordi, stesso carattere, stesso branco.
- **Non può fondare né allevare** su questo computer: far nascere resta di chi alleva.
- **Non può incontrare altre creature**: la sua chiave privata di firma non viaggia.
- La ricerca nei ricordi viene **ricalcolata** qui, con la tua chiave.

## Ogni giorno

- **Riaprire UGO**: lo stesso doppio clic. Se la casa è già installata, apre direttamente UGO.
- **Cambiare il tetto di spesa**: dal pannello, pagina dell'account, riquadro **Come si chiama, e che ore sono lì** (ultimo campo, in dollari). Il valore resta salvato e vale anche dopo il riavvio.
- **Fermarlo**: `./ugo.sh stop` (Windows: `.\ugo.ps1 stop`). I dati restano.

## Salvataggi e aggiornamenti

Dalla cartella del kit:

1. Esegui `./ugo.sh backup` (Windows: `.\ugo.ps1 backup`). Nasce una coppia di file in `backups/`.
2. **Metti i due file al sicuro, insieme, fuori da questo computer.** Chi li ha entrambi legge
   tutto. La chiave OpenRouter non c'è: si reinserisce.
3. Per tornare a un salvataggio: `./ugo.sh restore backups/ugo-…dump`, poi scrivi **SI**.
   Sostituisce la casa attuale, dopo averne fatto un salvataggio di sicurezza.
4. Per aggiornare: `./ugo.sh update`. Salva da solo prima di cambiare qualcosa.

Per **spostare** la creatura su un altro computer non serve il backup completo: ripeti il passo 1.

## Prossimi Passi

- [Il confidente inviolabile](../02-core-features/il-confidente-inviolabile.md) — cosa esce di casa e cosa no, senza giri di parole.
- [I tuoi dati](../02-core-features/i-tuoi-dati.md) — l'esportazione dell'anima, nel dettaglio.
- [Problemi comuni](../04-troubleshooting/problemi-comuni.md#a-casa-tua-non-parte-o-non-installa) — se qualcosa non parte.
