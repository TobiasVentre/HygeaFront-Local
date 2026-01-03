@echo off
REM Script para iniciar servidor HTTP local del frontend
REM Uso: start-server.bat

echo ========================================
echo   Iniciando servidor local de CuidarMed+
echo ========================================
echo.

REM Verificar si Python está instalado
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Python detectado
    echo.
    echo Servidor iniciado en: http://localhost:8000
    echo Presiona Ctrl+C para detener el servidor
    echo.
    
    REM Iniciar servidor HTTP de Python
    python -m http.server 8000
) else (
    echo [ERROR] Python no esta instalado
    echo.
    echo Alternativas:
    echo 1. Instalar Python desde https://www.python.org/
    echo 2. Usar Node.js: npx http-server -p 8000
    echo 3. Usar Live Server en VS Code (extension)
    pause
    exit /b 1
)

