# UGO Dettatura (macOS)

Detta in qualunque app del Mac. Tieni premuta la scorciatoia, parla, lasciala: il testo compare
dove stava il cursore. L'audio va al faster-whisper di UGO (`POST /v1/stt`), mai a un servizio di
terzi. Una seconda scorciatoia fa la domanda a UGO e ti risponde a voce. Decisioni in
[ADR-129](../../docs/ADR/129-la-dettatura-da-scrivania.md).

| Cosa                   | Dove                                                                  |
| ---------------------- | --------------------------------------------------------------------- |
| Scorciatoie di default | ⌃⌥D detta · ⌃⌥R chiedi a UGO (cambiabili in Impostazioni)             |
| Modalità               | tieni premuto (default) oppure premi/ripremi                          |
| Server                 | `https://ugo.omeganodes.ai` (cambiabile in Impostazioni)              |
| Token del dispositivo  | Portachiavi di macOS, servizio `ai.omeganodes.dictation`              |
| Impostazioni           | `~/Library/Application Support/ai.omeganodes.dictation/settings.json` |
| Bundle id              | `ai.omeganodes.dictation`, team `8UH44UM49Z`                          |

## Usarla

1. Avviala: compare l'icona nella barra dei menu, non nel Dock.
2. Nel pannello di UGO (`/admin` → Dispositivi) chiedi un codice di abbinamento e scrivilo nella
   finestra che si apre. Il codice vale dieci minuti; il token che ne nasce si revoca dal pannello.
3. Concedi **Accessibilità** (Impostazioni di Sistema → Privacy e sicurezza → Accessibilità) e
   **Microfono** quando macOS li chiede. Senza Accessibilità il testo va negli appunti e lo incolli
   tu con ⌘V.

## Compilare e firmare

Serve un Mac con Xcode Command Line Tools e Rust (`rustup`).

```bash
cargo install tauri-cli --version "^2" --locked
```

```bash
cd apps/dictation-mac/src-tauri && cargo tauri icon icons/icon.png
```

Il secondo comando genera `icon.icns` dalle immagini già nel repository (l'icona attuale è
provvisoria: sostituisci `icons/icon.png`, 1024×1024, e rilancialo).

### Firma e notarizzazione (fuori dall'App Store)

L'app preme ⌘V per conto tuo in altre app: la sandbox dell'App Store non lo permette, quindi si
distribuisce come app **Developer ID** firmata e notarizzata.

1. In [developer.apple.com](https://developer.apple.com/account/resources/certificates/list) crea
   un certificato **Developer ID Application** per il team `8UH44UM49Z` e installalo nel
   Portachiavi del Mac che compila.
2. In [appleid.apple.com](https://appleid.apple.com) → Accesso e sicurezza → Password per le app,
   crea una password per la notarizzazione.
3. Esporta le variabili e compila: Tauri firma, notarizza e graffa il ticket da solo.

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: OMEGA NODES COMPANY LIMITED (8UH44UM49Z)"
export APPLE_ID="<l'Apple ID del team>"
export APPLE_PASSWORD="<la password per le app del punto 2>"
export APPLE_TEAM_ID="8UH44UM49Z"
cargo tauri build
```

Il risultato è in `src-tauri/target/release/bundle/dmg/`. Il nome esatto dell'identità di firma si
legge con `security find-identity -v -p codesigning`.

## Sviluppare

```bash
cd apps/dictation-mac/src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Le parti pure (audio verso PCM16 16 kHz, tagli nei silenzi, richieste e risposte di soul,
impostazioni) hanno i loro test. Microfono, Portachiavi, appunti e Accessibilità si provano a mano
sul Mac: sono il sistema operativo, non logica nostra. Su Linux si compila (serve WebKitGTK) ma è
macOS il bersaglio; la CI `dictation-mac.yml` la costruisce su un runner macOS.
