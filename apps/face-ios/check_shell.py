"""Il guscio iOS si verifica anche senza un Mac: legge i file veri del progetto.

Xcode non gira su Linux, quindi la compilazione resta da fare sul Mac. Quello
che si può sbagliare senza accorgersene — l'identità, la firma, i permessi, il
dominio, il Mac — sta tutto in file di testo, e qui si legge.
"""

from __future__ import annotations

import json
import plistlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / "ios" / "App"
TEAM = "8UH44UM49Z"
BUNDLE = "ai.omeganodes.ugo"
DOMAIN = "ugo.omeganodes.ai"

problems: list[str] = []


def need(condition: bool, message: str) -> None:
    if not condition:
        problems.append(message)


config = json.loads((ROOT / "capacitor.config.json").read_text())
need(config.get("appId") == BUNDLE, f"appId deve essere {BUNDLE}")
need(config.get("server", {}).get("url") == f"https://{DOMAIN}", f"server.url deve essere https://{DOMAIN}")

info = plistlib.loads((APP / "App" / "Info.plist").read_bytes())
for key in ("NSMicrophoneUsageDescription", "NSCameraUsageDescription", "NSSpeechRecognitionUsageDescription"):
    need(len(str(info.get(key, ""))) > 20, f"{key} mancante o troppo corta")
need("NSAppTransportSecurity" not in info, "ATS senza eccezioni: niente NSAppTransportSecurity")
need("UIBackgroundModes" not in info, "nessuna modalità in background dichiarata senza codice che la usi")
need(info.get("UIRequiredDeviceCapabilities") == ["arm64"], "arm64, o i Mac Apple Silicon non la installano")
need(info.get("ITSAppUsesNonExemptEncryption") is False, "dichiarazione di crittografia per TestFlight")

entitlements = plistlib.loads((APP / "App" / "App.entitlements").read_bytes())
need("aps-environment" in entitlements, "manca l'entitlement delle notifiche push")
need(
    entitlements.get("com.apple.developer.associated-domains") == [f"applinks:{DOMAIN}"],
    f"associated domains deve essere applinks:{DOMAIN}",
)

project = (APP / "App.xcodeproj" / "project.pbxproj").read_text()
need(project.count(f"DEVELOPMENT_TEAM = {TEAM};") == 2, "team in Debug e Release")
need(project.count("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;") == 2, "entitlements in Debug e Release")
need(project.count("SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = YES;") == 2, "app iPad sui Mac in Debug e Release")
need(project.count(f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE};") == 2, "bundle id in Debug e Release")

need((APP / "CapApp-SPM" / "Package.swift").exists(), "Swift Package Manager: manca CapApp-SPM/Package.swift")
need(not (APP / "Podfile").exists(), "niente CocoaPods: c'è un Podfile")

if problems:
    print("guscio iOS non pronto:\n- " + "\n- ".join(problems))
    sys.exit(1)
print("guscio iOS pronto: identità, firma, permessi, dominio e Mac sono dove devono essere")
