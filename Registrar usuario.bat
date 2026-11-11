@echo off
REM Doble clic para registrar un empleado o cambiar su contrasena (se guarda cifrada)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\registrar-usuario.ps1"
pause
