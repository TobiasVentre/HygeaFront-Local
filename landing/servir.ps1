# Servidor local de la landing de Hygea Go
# Uso:  .\servir.ps1     (o doble clic en servir.cmd)

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Landing de Hygea Go en http://localhost:8090" -ForegroundColor Cyan
Write-Host "Ctrl+C para detener." -ForegroundColor Yellow
python -m http.server 8090 --directory $raiz
