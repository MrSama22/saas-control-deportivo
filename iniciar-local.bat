@echo off
title TrainPass QR - Servidor Local (Backend + Frontend)
echo =========================================================
echo   Iniciando TrainPass QR SaaS (Multi-Tenant + Escáner)
echo =========================================================
echo.
echo [1/2] Iniciando Backend FastAPI en http://localhost:8000 ...
start "TrainPass Backend (FastAPI)" cmd /k "cd /d %~dp0backend && .venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Iniciando Frontend React (Vite) en http://localhost:5173 ...
start "TrainPass Frontend (React)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Listo! Abre en tu navegador:
echo   - Vista Entrenador (PIN 1234): http://localhost:5173/admin
echo   - Vista Pase Alumno Activo:    http://localhost:5173/pase/pase-valentina-activo
echo   - Vista Pase Alumno Deudor:    http://localhost:5173/pase/pase-mateo-sin-clases
pause
