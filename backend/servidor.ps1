# =========================================================
#  TorqueStock - Arranque del servidor (sin internet)
#  1. Abre el puerto en el Firewall de Windows (solo la primera vez).
#  2. Si la computadora tiene Python, arranca backend/servidor.py:
#     base de datos compartida por todos los equipos de la red.
#  3. Si no tiene Python, avisa cómo instalarlo.
# =========================================================

$Puerto = 8080
# Este archivo vive en backend/; el servidor entrega la carpeta principal del proyecto
$Carpeta = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$CarpetaConBarra = $Carpeta.TrimEnd("\") + "\"

# --- Se necesita permiso de administrador para aceptar conexiones del celular ---
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
    Write-Host "Pidiendo permiso de administrador..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    exit
}

# --- Abrir el puerto en el Firewall de Windows (solo la primera vez) ---
$regla = "TorqueStock $Puerto"
if (-not (Get-NetFirewallRule -DisplayName $regla -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $regla -Direction Inbound -Protocol TCP -LocalPort $Puerto -Action Allow -Profile Any | Out-Null
}

# --- Servidor completo con Python (base de datos compartida) ---
$python = $null
foreach ($candidato in @("python", "py")) {
    if (Get-Command $candidato -ErrorAction SilentlyContinue) {
        & $candidato -c "import sqlite3" 2>$null
        if ($LASTEXITCODE -eq 0) { $python = $candidato; break }
    }
}
if ($python) {
    & $python "$PSScriptRoot\servidor.py" $Puerto
    Read-Host "Presiona Enter para cerrar"
    exit
}
Write-Host ""
Write-Host "  No se encontró Python en esta computadora." -ForegroundColor Yellow
Write-Host "  TorqueStock guarda sus datos en una base SQLite que maneja un servidor en Python." -ForegroundColor Yellow
Write-Host "  Instala Python 3 desde python.org (marca 'Add python.exe to PATH') y vuelve a abrir este archivo." -ForegroundColor Yellow
Write-Host ""
Read-Host "Presiona Enter para cerrar"
