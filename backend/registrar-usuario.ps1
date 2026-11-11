# =========================================================
#  TorqueStock - Registrar empleado o cambiar su contraseña
#  Pide los datos, cifra la contraseña (PBKDF2-SHA256 con sal
#  aleatoria) y la guarda en data/usuarios.json.
#  La contraseña nunca se escribe en el archivo, solo su hash.
# =========================================================

$ErrorActionPreference = "Stop"
$Archivo = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "data\usuarios.json"
$Utf8 = New-Object System.Text.UTF8Encoding $false
$Iteraciones = 100000
$Roles = [ordered]@{ "1" = "Administrador"; "2" = "Almacenista"; "3" = "Calidad" }
$NombresRol = @{ "Administrador" = "Jefe de almacén"; "Almacenista" = "Almacenista"; "Calidad" = "Ingeniero de calidad" }

function Pedir-Texto($mensaje, $regla, $error) {
    while ($true) {
        $v = (Read-Host $mensaje).Trim()
        if ($v -match $regla) { return $v }
        Write-Host "  $error" -ForegroundColor Red
    }
}

function Leer-Clave($mensaje) {
    $segura = Read-Host $mensaje -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Cifrar($clave, [byte[]]$sal) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($clave)
    $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($bytes, $sal, $Iteraciones,
        [System.Security.Cryptography.HashAlgorithmName]::SHA256)
    try { return (($pbkdf2.GetBytes(32) | ForEach-Object { $_.ToString("x2") }) -join "") }
    finally { $pbkdf2.Dispose() }
}

Write-Host ""
Write-Host "  TorqueStock - Registro de empleados" -ForegroundColor Cyan
Write-Host "  ------------------------------------"
Write-Host ""

$texto = [System.IO.File]::ReadAllText($Archivo, $Utf8)
$datos = $texto | ConvertFrom-Json

# --- Usuario (RF-01: máximo 15, solo letras y números) ---
$usuario = (Pedir-Texto "Usuario (máx. 15, solo letras y números)" '^[A-Za-z0-9]{1,15}$' "Solo letras y números, máximo 15.").ToLower()
$existente = $datos.usuarios | Where-Object { $_.usuario -eq $usuario }

if ($existente) {
    Write-Host ""
    Write-Host "  '$usuario' ya existe: $($existente.nombre) ($($NombresRol[$existente.rol]))." -ForegroundColor Yellow
    if ((Read-Host "¿Cambiar su contraseña? (s/n)") -notmatch '^[sS]') { Write-Host "  Sin cambios."; exit }
    $nombre = $existente.nombre
    $rol = $existente.rol
} else {
    $nombre = Pedir-Texto "Nombre completo" '^[^"\\]{3,60}$' "Escribe entre 3 y 60 caracteres (sin comillas)."
    Write-Host ""
    foreach ($k in $Roles.Keys) { Write-Host "  $k) $($NombresRol[$Roles[$k]])" }
    $op = Pedir-Texto "Rol (1, 2 o 3)" '^[123]$' "Escribe 1, 2 o 3."
    $rol = $Roles[$op]
}

# --- Contraseña (se pide dos veces y no se ve al escribirla) ---
Write-Host ""
while ($true) {
    $clave = Leer-Clave "Contraseña (máx. 15, solo letras y números)"
    if ($clave -notmatch '^[A-Za-z0-9]{1,15}$') { Write-Host "  Solo letras y números, máximo 15." -ForegroundColor Red; continue }
    if ((Leer-Clave "Repite la contraseña") -ne $clave) { Write-Host "  No coinciden, intenta de nuevo." -ForegroundColor Red; continue }
    break
}

# --- Cifrar con una sal nueva ---
$sal = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($sal); $rng.Dispose()
$salHex = ($sal | ForEach-Object { $_.ToString("x2") }) -join ""
$hash = Cifrar $clave $sal
$clave = $null

# --- Guardar en usuarios.json (se edita el texto para conservar el formato del archivo) ---
$fila = "{ ""usuario"": ""$usuario"", ""nombre"": ""$nombre"", ""rol"": ""$rol"",`n      ""sal"": ""$salHex"", ""hash"": ""$hash"" }"
$saltos = if ($texto.Contains("`r`n")) { "`r`n" } else { "`n" }
$texto = $texto -replace "`r`n", "`n"

if ($existente) {
    $patron = '\{ "usuario": "' + [regex]::Escape($usuario) + '",[^}]*\}'
    $texto = ([regex]$patron).Replace($texto, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $fila }, 1)
} else {
    # Agrega el renglón al final de la lista "usuarios"
    $patron = '(\})(\s*\n  \],\s*\n  "permisos")'
    $texto = ([regex]$patron).Replace($texto, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $m.Groups[1].Value + ",`n    " + $fila + $m.Groups[2].Value }, 1)
}
$null = $texto | ConvertFrom-Json   # revisa que el archivo siga siendo JSON válido antes de guardar
[System.IO.File]::WriteAllText($Archivo, ($texto -replace "`n", $saltos), $Utf8)

Write-Host ""
if ($existente) { Write-Host "  Contraseña de '$usuario' actualizada." -ForegroundColor Green }
else { Write-Host "  Empleado '$usuario' registrado como $($NombresRol[$rol])." -ForegroundColor Green }
Write-Host "  Para que lo vean las demás computadoras, sube el cambio (commit y push) o copia usuarios.json."
Write-Host ""
