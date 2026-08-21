# ADR-116 — Il verso ha un timbro, e viene dal corpo

**Stato: ACCETTATA** (2026-08-19). Gruppo 20, «fenotipo dal genoma», ultima voce: il timbro dei
grugniti.

## Contesto

Il muso consumava già tutti e otto i geni del corpo. Restavano le setole (ADR-109) e **il
timbro dei grugniti** — che però non era una mappa genoma→aspetto come le altre: il grugnito,
in questo sistema, **non esisteva come suono**. `grunt` era ed è un gesto *visivo*: bocca,
orecchie, una scossa. Silenzioso.

Dare un timbro a un verso che non c'è vuol dire aprire un **canale sensoriale nuovo**, ed è per
questo che la voce è rimasta aperta invece di essere spuntata insieme alle setole.

## Decisione

### 1. Il timbro viene dal genoma, e non è un gene nuovo

`chonk` e `snout` bastano: **un maiale grosso suona più basso**, **un grugno lungo suona più
scuro**. È la fisica di una cassa di risonanza, non un'impostazione — e costa **zero
migrazioni**, perché i due geni ci sono da ADR-026.

Due gosini della stessa cucciolata hanno versi diversi perché hanno corpi diversi. È come si
eredita tutto il resto (regola 13: si adotta, non si configura), e non c'è nessuna manopola da
girare.

Deterministico: **stesso genoma, stesso verso**. Se cambiasse a ogni ricarica non sarebbe un
tratto, sarebbe un effetto — la stessa regola delle chiazze e delle setole.

### 2. Il grugnito NON è la voce

UGO parla col sintetizzatore; il grugnito è un **verso**. I due non si sovrappongono mai:
mentre parla, non grugnisce. Un verso sopra una frase non è espressività — è una frase che non
si capisce.

### 3. Le tre regole del silenzio, che sono quelle della pioggia

Il precedente c'è già (gruppo 13, `RainSound`) e il problema è identico, quindi la regola è la
stessa e non una nuova:

- **parte solo dopo il gesto dell'utente**: l'`AudioContext` lo pretende, e comunque una pagina
  che suona da sola è una pagina che viene chiusa. Prima di quel gesto il grugnito resta il
  gesto visivo di sempre, cioè esattamente com'era;
- **di notte tace**: un verso attraverso il buio è una sveglia;
- **un interruttore solo**, quello dei sensi che c'è già. Non ne nasce un secondo: due
  interruttori per il suono sono il modo in cui uno dei due resta acceso per sbaglio.

### 4. Sintesi, non un campione

WebAudio procedurale, zero asset (ADR-026 §1): un dente di sega che scende di poco in meno di
un quinto di secondo, filtrato in basso, con un inviluppo corto — senza, si sente un «clic»,
che è il rumore dell'altoparlante e non del maiale. Non imita un maiale vero e non ci prova:
deve suonare come **quel** corpo, e due parametri bastano.

Volume sotto qualunque voce, come la pioggia.

## Conseguenze

- il **roster** porta ora i tratti fino al chiosco: senza, tutti i gosini di una stanza
  suonerebbero uguali — il contrario di come si eredita tutto il resto;
- chi non è nel roster (una casa a esemplare solo, dove `who` è vuoto) grugnisce col **corpo
  medio**: un verso c'è comunque, e non è un caso particolare da trattare a parte;
- il codice sta in `@ugo/face-body`, cioè **nel corpo**: la voce di una creatura è del suo
  corpo, e la reception che monta quel corpo la eredita senza fare niente.

## Cosa NON è stato fatto, e perché

**Il repertorio dei grugniti** — versi diversi per situazioni diverse — resta fuori. È la voce
«genoma strutturale», ancora aperta, e vuole che il genoma governi *quali* versi esistono e non
solo come suonano. Aggiungerne tre a caso qui dentro sarebbe contenuto travestito da codice,
la stessa ragione per cui ADR-112 non ha scritto dieci indovinelli.

## Verifica

- unità sul timbro: grosso più basso di magro, grugno lungo più scuro di corto, e
  deterministico;
- unità sulle **tre regole del silenzio**, che è la parte che si sbaglia: sensi spenti, notte,
  e — quella che conta di più — **mentre parla, mai**.
