# UGO a casa tua - lanciatore per Windows (ADR-132, MKT-10.7).
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Stop-Ugo([string]$Why) {
  Write-Host ""
  Write-Host "UGO non è partito: $Why"
  exit 1
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Stop-Ugo "manca Docker Desktop. Installalo da https://docs.docker.com/desktop/setup/install/windows-install/ e rilancia."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { Stop-Ugo "Docker Desktop è installato ma non è acceso. Aprilo, aspetta che sia pronto, e rilancia." }

if (-not (Test-Path .env)) {
  Write-Host "Prima volta: preparo la password del database (resta su questo computer)."
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $pw = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
  [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), "POSTGRES_PASSWORD=$pw`n")
}

Write-Host "Avvio UGO (la prima volta può volerci qualche minuto)..."
$image = if ($env:UGO_SOUL_IMAGE) { $env:UGO_SOUL_IMAGE } else { "ugo-soul:local" }
docker image inspect $image *> $null
$haveImage = ($LASTEXITCODE -eq 0)
if ((Test-Path ..\docker\soul.Dockerfile) -and -not $haveImage) {
  docker build -f ..\docker\soul.Dockerfile -t $image ..\..
  if ($LASTEXITCODE -ne 0) { Stop-Ugo "la costruzione non è riuscita." }
}
docker compose up -d
if ($LASTEXITCODE -ne 0) { Stop-Ugo "l'avvio non è riuscito." }

$url = $null
for ($i = 0; $i -lt 90 -and -not $url; $i++) {
  $logs = (docker compose logs soul 2>$null) -join "`n"
  $m = [regex]::Matches($logs, "http://localhost:\d+/setup#t=[A-Za-z0-9_-]+")
  if ($m.Count -gt 0) { $url = $m[$m.Count - 1].Value; break }
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/health -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $url = "http://localhost:3000/"; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $url) { Stop-Ugo "soul non ha risposto in tre minuti. Guarda: docker compose logs soul" }
Write-Host "Apro $url"
Start-Process $url
