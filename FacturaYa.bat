@echo off
title Max Limpio OS
color 0B

echo =========================================================
echo                    MAX LIMPIO OS
echo =========================================================
echo.
echo   El servidor se esta iniciando...
echo   Se abrira una ventana de aplicacion en unos segundos.
echo.
echo   IMPORTANTE: Manten esta ventana abierta mientras
echo   utilices el sistema. Cierrala para apagar.
echo =========================================================
echo.

:: Determinar el ejecutable de Node a usar (Portable vs Global)
if exist "%~dp0bin\node.exe" (
    "%~dp0bin\node.exe" "%~dp0server.js"
) else (
    node "%~dp0server.js"
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: El servidor se ha cerrado inesperadamente o no se encontro Node.js.
    pause
)
