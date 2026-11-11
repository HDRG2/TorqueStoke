@echo off
REM Doble clic para arrancar el servidor del almacen (no necesita internet, solo la red local)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0backend\servidor.ps1"
