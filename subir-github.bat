@echo off
title Subir TrainPass QR a GitHub Privado
set "PATH=%PATH%;C:\Program Files\GitHub CLI"

echo =========================================================
echo   Paso 1: Verificando sesion en GitHub CLI (gh)...
echo =========================================================
gh auth status
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Iniciando sesion en GitHub (se abrira tu navegador)...
    gh auth login --web -h github.com -p https
)

echo.
echo =========================================================
echo   Paso 2: Creando repositorio PRIVADO y subiendo codigo...
echo =========================================================
gh repo create saas-control-deportivo --private --source=. --remote=origin --push

echo.
echo =========================================================
echo   Listo! Tu codigo limpio (sin .db ni .env) ya esta en GitHub.
echo =========================================================
pause
