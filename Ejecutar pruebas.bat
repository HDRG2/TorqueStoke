@echo off
REM Doble clic para correr las pruebas de aceptacion (usan una base temporal: no tocan los datos reales)
where python >nul 2>nul
if %errorlevel%==0 (
    python "%~dp0backend\pruebas.py"
) else (
    py "%~dp0backend\pruebas.py"
)
pause
