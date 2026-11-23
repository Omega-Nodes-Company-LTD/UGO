@echo off
rem doppio clic su Windows: lancia start.ps1 solo per questa volta (nessuna impostazione di sistema cambia)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
pause
