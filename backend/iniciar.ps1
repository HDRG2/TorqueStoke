# =========================================================
#  TorqueStock - Arranque del servidor del almacén (sin internet)
#  Lo abre "Iniciar servidor.bat" (en la carpeta principal).
#  1. Abre el puerto 8080 en el Firewall de Windows (solo la
#     primera vez) para que entren las tablets de la red.
#  2. Arranca backend/servidor.py con Python.
# =========================================================

$Puerto = 8080

# --- Se necesita permiso de administrador para abrir el puerto en el Firewall ---
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

# --- Buscar Python y arrancar el servidor ---
$python = $null
foreach ($candidato in @("python", "py")) {
    if (Get-Command $candidato -ErrorAction SilentlyContinue) {
        & $candidato -c "import sqlite3" 2>$null
        if ($LASTEXITCODE -eq 0) { $python = $candidato; break }
    }
}

if ($python) {
    & $python "$PSScriptRoot\servidor.py" $Puerto
} else {
    Write-Host ""
    Write-Host "  No se encontró Python en esta computadora." -ForegroundColor Yellow
    Write-Host "  TorqueStock guarda sus datos en una base SQLite que maneja un servidor en Python." -ForegroundColor Yellow
    Write-Host "  Instala Python 3 desde python.org (marca 'Add python.exe to PATH') y vuelve a abrir este archivo." -ForegroundColor Yellow
    Write-Host ""
}
Read-Host "Presiona Enter para cerrar"
