# UGO per iPhone, iPad e Mac (`apps/face-ios`)

Guscio Capacitor 7 col progetto Xcode a **Swift Package Manager** (niente CocoaPods). Gira su
iPhone e iPad, e sui **Mac con Apple Silicon come app iPad** («Designed for iPad»): una sola build
per tutti e tre.

| | |
|---|---|
| Bundle id | `ai.omeganodes.ugo` |
| Team | `8UH44UM49Z` |
| Server | `https://ugo.omeganodes.ai` (`server.url` in `capacitor.config.json`) |
| Capability | Push Notifications, Associated Domains (`applinks:ugo.omeganodes.ai`) |

## Come funziona

L'app **carica il muso direttamente dal soul** (`server.url`). L'origine della pagina è quindi
`https://ugo.omeganodes.ai`, la stessa che il muso ha nel browser: il socket `/v1/face`, i cookie
del login e i permessi funzionano come sul web, senza CORS e senza una chiave di build da tenere
allineata. Una modifica al muso arriva sul telefono al prossimo deploy del soul, **senza
ricompilare l'app**. Il rovescio: senza rete l'app non parte, esattamente come il muso nel browser.

Serve che il soul sia raggiungibile su `https://ugo.omeganodes.ai` e che il dispositivo sia
abbinato (codice dal pannello, contratto C1). Per provare un server diverso cambia `server.url` e
`server.allowNavigation` in `capacitor.config.json`, poi `pnpm run sync`.

## Sul Mac, la prima volta

Serve un Mac con Xcode 16 o successivo e l'account Apple Developer del team `8UH44UM49Z`.

1. Dalla radice del repository: `pnpm install`, poi `pnpm --filter face-ios run build:ios`.
   Costruisce il muso, sincronizza Capacitor e apre Xcode.
2. In Xcode: **Settings → Accounts** → aggiungi l'Apple ID del team. Il progetto ha già
   `DEVELOPMENT_TEAM = 8UH44UM49Z` e la firma automatica: Xcode crea da solo certificato e profilo
   con le due capability.
3. Xcode scarica il pacchetto `capacitor-swift-pm` alla prima apertura (File → Packages se si
   ferma).

## Su iPhone

1. Collega l'iPhone col cavo, sbloccalo, accetta «Autorizza questo computer».
2. Sull'iPhone attiva **Impostazioni → Privacy e sicurezza → Modalità sviluppatore** (si riavvia).
3. In Xcode scegli l'iPhone come destinazione e premi **Run** (⌘R).
4. Alla prima apertura concedi il **microfono** (obbligatorio) e, se vuoi lo sguardo, la
   **fotocamera**.

## Sul Mac (come app iPad)

In Xcode scegli la destinazione **My Mac (Designed for iPad)** e premi Run. Su TestFlight la
stessa build compare anche sul Mac.

## TestFlight

1. Su [App Store Connect](https://appstoreconnect.apple.com) → **App** → **+** → Nuova app:
   piattaforma iOS, bundle id `ai.omeganodes.ugo`, nome «UGO».
2. In Xcode: destinazione **Any iOS Device (arm64)** → **Product → Archive**.
3. Nell'Organizer: **Distribute App → App Store Connect → Upload**. La firma automatica cambia da
   sola `aps-environment` da `development` a `production` per la distribuzione.
4. Su App Store Connect → **TestFlight**: aggiungi te stesso fra i tester interni. L'app arriva
   nell'app TestFlight su iPhone e Mac. La crittografia è già dichiarata
   (`ITSAppUsesNonExemptEncryption = false`: solo HTTPS standard).

## Notifiche push

Il guscio ha già l'entitlement, ma **l'invio delle notifiche dal server non è in questo passo**.
Quando servirà, la chiave si genera così:

1. [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, IDs &
   Profiles → Keys → +**.
2. Nome «UGO APNs», spunta **Apple Push Notifications service (APNs)**, Continue, Register.
3. **Scarica il file `.p8`**: si può scaricare una volta sola. Annota il **Key ID** (10
   caratteri) e il Team ID `8UH44UM49Z`.
4. Il `.p8` va custodito come un segreto: diventerà una variabile del soul, mai un file nel repo.

## Cosa si verifica senza un Mac

`pnpm --filter face-ios run check` (e il job `ios shell` della CI) sincronizza davvero il
progetto SPM e legge dai file veri identità, firma, permessi, dominio e supporto Mac.
**Compilazione, firma, avvio e permessi a runtime si verificano solo sul Mac.**
