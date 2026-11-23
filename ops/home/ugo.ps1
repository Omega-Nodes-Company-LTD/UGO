# UGO a casa tua - copia di sicurezza, ripristino, aggiornamento, stop (Windows).
#   .\ugo.ps1 backup | restore <file> | update | stop
param([Parameter(Position = 0)][string]$Action, [Parameter(Position = 1)][string]$File)
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$Vol = "ugo-home-secrets"
$Helper = "pgvector/pgvector:pg16"

function Stop-Ugo([string]$Why) { Write-Host ""; Write-Host $Why; exit 1 }
function Run([scriptblock]$Cmd, [string]$Why) { & $Cmd; if ($LASTEXITCODE -ne 0) { Stop-Ugo $Why } }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Stop-Ugo "Docker non è acceso." }
if (-not (Test-Path .env)) { Stop-Ugo "UGO non è mai stato avviato da questa cartella (manca .env)." }

function Save-Backup([string]$Prefix) {
  $base = "backups/$Prefix-" + (Get-Date -Format "yyyyMMdd-HHmmss")
  New-Item -ItemType Directory -Force backups | Out-Null
  # il dump binario passa da un file nel contenitore: il redirect di PowerShell 5.1 lo corromperebbe
  Run { docker compose exec -T postgres sh -c "pg_dump -U ugo -d ugo -Fc -f /tmp/ugo.dump" } "il salvataggio del database non è riuscito."
  Run { docker compose cp postgres:/tmp/ugo.dump "$base.dump" } "non riesco a copiare il salvataggio."
  $key = (docker run --rm -v "${Vol}:/data:ro" $Helper cat /data/data.key) -join ""
  if ($LASTEXITCODE -ne 0 -or -not $key) { Remove-Item "$base.dump" -ErrorAction SilentlyContinue; Stop-Ugo "non riesco a leggere la chiave maestra." }
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "$base.key"), $key)
  if ((Get-Item "$base.dump").Length -eq 0) { Remove-Item "$base.dump", "$base.key"; Stop-Ugo "il salvataggio è vuoto: scartato." }
  Write-Host "Salvato: $base.dump + $base.key"
  Write-Host "Tienili INSIEME e al sicuro: chi ha entrambi legge tutto. La chiave OpenRouter non è inclusa: si reinserisce dal /setup."
  return $base
}

switch ($Action) {
  "backup" { Save-Backup "ugo" | Out-Null }
  "restore" {
    if (-not $File -or -not (Test-Path $File)) { Stop-Ugo "uso: .\ugo.ps1 restore backups\ugo-AAAAMMGG-HHMMSS.dump" }
    $keyFile = [System.IO.Path]::ChangeExtension((Resolve-Path $File).Path, ".key")
    if (-not (Test-Path $keyFile)) { Stop-Ugo "manca la chiave accanto al salvataggio: $keyFile" }
    $answer = Read-Host "Questo SOSTITUISCE la casa attuale con quella del salvataggio. Scrivi SI per continuare"
    if ($answer -cne "SI") { Stop-Ugo "annullato, non ho toccato niente." }
    $before = Save-Backup "prima-del-ripristino"
    docker compose stop soul
    Run { docker compose exec -T postgres psql -U ugo -d postgres -v ON_ERROR_STOP=1 -c "drop database ugo with (force)" -c "create database ugo" } "non riesco a svuotare il database."
    Run { docker compose cp (Resolve-Path $File).Path postgres:/tmp/restore.dump } "non riesco a copiare il salvataggio."
    Run { docker compose exec -T postgres pg_restore -U ugo -d ugo --exit-on-error /tmp/restore.dump } "il ripristino non è riuscito. Il salvataggio di prima è in $before.dump"
    $key = (Get-Content -Raw $keyFile).Trim()
    Run { docker run --rm -e "KEY=$key" -v "${Vol}:/data" $Helper sh -c 'printf %s "$KEY" > /data/data.key && chown 1000:1000 /data/data.key && chmod 600 /data/data.key' } "non riesco a rimettere la chiave."
    docker compose up -d soul
    Write-Host "Ripristinato."
  }
  "update" {
    $before = Save-Backup "prima-dell-aggiornamento"
    if ((Test-Path ..\docker\soul.Dockerfile) -and -not $env:UGO_SOUL_IMAGE) {
      Run { docker build -f ..\docker\soul.Dockerfile -t ugo-soul:local ..\.. } "la costruzione non è riuscita: UGO resta com'era."
    } else {
      Run { docker compose pull soul } "non riesco a scaricare l'immagine: UGO resta com'era."
    }
    docker compose up -d
    Write-Host "Aggiornato. Se qualcosa non va: .\ugo.ps1 restore $before.dump"
  }
  "stop" { docker compose stop }
  default { Stop-Ugo "uso: .\ugo.ps1 backup | restore <file> | update | stop" }
}
