# Script para iniciar Logitrack en modo LAN (Red Local)
# Permite probar la app desde celulares conectados al mismo Wi-Fi

Write-Host "🚀 Iniciando Logitrack en modo LAN..." -ForegroundColor Cyan
$IP = "10.23.150.40"
Write-Host "📡 Tu IP Local es: $IP" -ForegroundColor Yellow

# 1. Iniciar Backend (Docker)
Write-Host "🐳 Iniciando servicios Backend..." -ForegroundColor Green
docker-compose up -d --build api-gateway
docker-compose up -d

# 2. Iniciar Frontend
Write-Host "💻 Iniciando Web App en puerto 3001..." -ForegroundColor Green
Write-Host "📱 Abre en tu celular: http://$IP:3001" -ForegroundColor Magenta

# Establecer variable HOST para que React acepte conexiones externas
$env:HOST = "0.0.0.0"
Set-Location web-app
npm start
