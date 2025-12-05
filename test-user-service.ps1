# Script de prueba para user-service
# Ejecutar desde PowerShell en Windows

Write-Host "🧪 PRUEBAS DE USER-SERVICE" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:8086"
$token = ""

# Test 1: Health Check
Write-Host "1️⃣  Test: Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/health" -Method GET -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Health check OK" -ForegroundColor Green
        $response.Content | ConvertFrom-Json | ConvertTo-Json
    }
} catch {
    Write-Host "⚠️  Health check endpoint no disponible (esperado si no está implementado)" -ForegroundColor Yellow
}
Write-Host ""

# Test 2: Login con admin
Write-Host "2️⃣  Test: Login con admin@logitrack.com" -ForegroundColor Yellow
try {
    $body = @{
        email = "admin@logitrack.com"
        password = "admin123"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/login" -Method POST -Body $body -ContentType "application/json"
    $token = $response.token
    Write-Host "✅ Login exitoso" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, [Math]::Min(50, $token.Length)))..." -ForegroundColor Gray
    Write-Host "Usuario: $($response.user.name) - Rol: $($response.user.role) - Branch: $($response.user.branch)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Login FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Respuesta: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
Write-Host ""

# Test 3: Obtener lista de usuarios
Write-Host "3️⃣  Test: GET /users (lista de usuarios)" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/users" -Method GET -Headers $headers
    Write-Host "✅ Usuarios obtenidos: $($response.Count)" -ForegroundColor Green
    $response | ForEach-Object {
        Write-Host "  - $($_.name) ($($_.email)) - Rol: $($_.role) - Branch: $($_.branch)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ GET /users FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: Crear nuevo usuario
Write-Host "4️⃣  Test: POST /users (crear usuario)" -ForegroundColor Yellow
try {
    $newUser = @{
        name = "Test User"
        email = "test.user@logitrack.com"
        password = "test123"
        role = "operator"
        branch = "central"
    } | ConvertTo-Json

    $headers = @{
        "Authorization" = "Bearer $token"
    }
    $response = Invoke-RestMethod -Uri "$baseUrl/users" -Method POST -Body $newUser -ContentType "application/json" -Headers $headers
    Write-Host "✅ Usuario creado con ID: $($response.id)" -ForegroundColor Green
    Write-Host "  Nombre: $($response.name)" -ForegroundColor Gray
    Write-Host "  Email: $($response.email)" -ForegroundColor Gray
    Write-Host "  Rol: $($response.role)" -ForegroundColor Gray
    Write-Host "  Branch: $($response.branch)" -ForegroundColor Gray
    $testUserId = $response.id
} catch {
    Write-Host "❌ POST /users FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Respuesta: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
Write-Host ""

# Test 5: Login con supervisor
Write-Host "5️⃣  Test: Login con supervisor.central@logitrack.com" -ForegroundColor Yellow
try {
    $body = @{
        email = "supervisor.central@logitrack.com"
        password = "super123"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/login" -Method POST -Body $body -ContentType "application/json"
    Write-Host "✅ Login supervisor exitoso" -ForegroundColor Green
    Write-Host "Usuario: $($response.user.name) - Branch: $($response.user.branch)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Login supervisor FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Login con driver
Write-Host "6️⃣  Test: Login con driver1@logitrack.com" -ForegroundColor Yellow
try {
    $body = @{
        email = "driver1@logitrack.com"
        password = "driver123"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/login" -Method POST -Body $body -ContentType "application/json"
    Write-Host "✅ Login driver exitoso" -ForegroundColor Green
    Write-Host "Usuario: $($response.user.name) - Branch: $($response.user.branch)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Login driver FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Login con credenciales incorrectas
Write-Host "7️⃣  Test: Login con credenciales incorrectas (debe fallar)" -ForegroundColor Yellow
try {
    $body = @{
        email = "admin@logitrack.com"
        password = "wrongpassword"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/login" -Method POST -Body $body -ContentType "application/json"
    Write-Host "❌ PROBLEMA: Login debería haber fallado pero no lo hizo" -ForegroundColor Red
} catch {
    Write-Host "✅ Login rechazado correctamente (401)" -ForegroundColor Green
}
Write-Host ""

# Resumen
Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "🏁 PRUEBAS COMPLETADAS" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "`nPróximos pasos:" -ForegroundColor Yellow
Write-Host "1. Probar desde web-app (UsersManagement)" -ForegroundColor White
Write-Host "2. Verificar que SupervisorDashboard filtra por branch" -ForegroundColor White
Write-Host "3. Probar creación de pedidos con branch" -ForegroundColor White
