# Script para iniciar servidor HTTP local del frontend
# Uso: .\start-server.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Iniciando servidor local de CuidarMed+" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar si Python está instalado
$pythonVersion = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Python detectado: $pythonVersion" -ForegroundColor Green
    Write-Host ""
    Write-Host "Servidor iniciado en: http://localhost:8000" -ForegroundColor Yellow
    Write-Host "Presiona Ctrl+C para detener el servidor" -ForegroundColor Yellow
    Write-Host ""
    
    # Iniciar servidor HTTP de Python
    python -m http.server 8000
} else {
    Write-Host "✗ Python no está instalado" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternativas:" -ForegroundColor Yellow
    Write-Host "1. Instalar Python desde https://www.python.org/" -ForegroundColor White
    Write-Host "2. Usar Node.js: npx http-server -p 8000" -ForegroundColor White
    Write-Host "3. Usar Live Server en VS Code (extensión)" -ForegroundColor White
    exit 1
}

