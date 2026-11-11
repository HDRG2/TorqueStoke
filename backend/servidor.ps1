# =========================================================
#  TorqueStock - Arranque del servidor (sin internet)
#  1. Abre el puerto en el Firewall de Windows (solo la primera vez).
#  2. Si la computadora tiene Python, arranca backend/servidor.py:
#     base de datos compartida por todos los equipos de la red.
#  3. Si no tiene Python, sirve los archivos con PowerShell en
#     modo demostración (cada equipo guarda sus propios datos).
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
Write-Host "  Se abre en MODO DEMOSTRACIÓN: cada equipo guarda sus propios datos." -ForegroundColor Yellow
Write-Host "  Para compartir los datos entre equipos instala Python (python.org) y vuelve a abrir este archivo." -ForegroundColor Yellow

# --- Tipos de archivo ---
$tipos = @{
    ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"; ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"; ".svg" = "image/svg+xml"; ".ico" = "image/x-icon"; ".md" = "text/plain; charset=utf-8"
}

# --- Iniciar servidor ---
$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://+:$Puerto/")
try { $servidor.Start() } catch {
    Write-Host "No se pudo iniciar el servidor en el puerto $Puerto. ¿Ya hay otro abierto?" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"; exit
}

$ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress

Clear-Host
Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Cyan
Write-Host "   TorqueStock - Servidor local funcionando" -ForegroundColor Cyan
Write-Host "  ==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  En esta computadora abre:" -ForegroundColor White
Write-Host "     http://localhost:$Puerto" -ForegroundColor Green
Write-Host ""
Write-Host "  En el celular (mismo WiFi o hotspot) abre:" -ForegroundColor White
foreach ($ip in $ips) { Write-Host "     http://$($ip):$Puerto" -ForegroundColor Green }
Write-Host ""
Write-Host "  Deja esta ventana abierta. Para detenerlo: Ctrl + C o cierra la ventana." -ForegroundColor DarkGray
Write-Host ""

Start-Process "http://localhost:$Puerto"

try {
    while ($servidor.IsListening) {
        $ctx = $servidor.GetContext()
        $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
        if ($ruta -eq "" -or $ruta.EndsWith("/")) { $ruta = $ruta + "index.html" }
        $archivo = [IO.Path]::GetFullPath((Join-Path $Carpeta $ruta))
        $resp = $ctx.Response
        try {
            # Solo se entrega la app (frontend/), los datos (backend/data/) y la redirección de inicio.
            # Nada fuera de la carpeta del proyecto, ni .git, ni este script.
            $permitida = ($ruta -eq "index.html") -or ($ruta -like "frontend/*") -or ($ruta -like "backend/data/*")
            $dentro = $archivo.StartsWith($CarpetaConBarra, [StringComparison]::OrdinalIgnoreCase)
            if ($permitida -and $dentro -and (Test-Path $archivo -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($archivo)
                $ext = [IO.Path]::GetExtension($archivo).ToLower()
                $resp.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { "application/octet-stream" }
                $resp.Headers.Add("Cache-Control", "no-cache")
                $resp.ContentLength64 = $bytes.Length
                $resp.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "  $(Get-Date -Format HH:mm:ss)  $($ctx.Request.RemoteEndPoint.Address)  /$ruta" -ForegroundColor DarkGray
            } else {
                $resp.StatusCode = 404
                $msg = [Text.Encoding]::UTF8.GetBytes("No encontrado")
                $resp.OutputStream.Write($msg, 0, $msg.Length)
            }
        } catch { } finally { $resp.Close() }
    }
} finally {
    $servidor.Stop()
}
