@echo off
REM Doble clic para registrar un empleado o cambiar su contrasena (se guarda cifrada en la base de datos)
where python >nul 2>nul
if %errorlevel%==0 (
    python "%~dp0backend\registrar_usuario.py"
) else (
    py "%~dp0backend\registrar_usuario.py"
)
pause
