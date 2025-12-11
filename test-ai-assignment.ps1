# =====================================================
# SCRIPT DE PRUEBA: Asignación Inteligente de Pedidos
# =====================================================
# Escenario de prueba:
# - 1 Sucursal: Central (Guatemala Ciudad)
# - 3 Motos con ubicaciones diferentes
# - 1 Moto ya tiene 1 pedido asignado (en ruta)
# - 2 Motos disponibles esperando asignación
# - 3 Pedidos nuevos cercanos a la zona
# =====================================================

$API_BASE = "http://localhost:8085"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  LOGITRACK - TEST DE ASIGNACIÓN IA" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# PASO 1: Verificar sucursales existentes
# =====================================================
Write-Host "📍 PASO 1: Verificando sucursales..." -ForegroundColor Yellow
try {
    $branches = Invoke-RestMethod -Uri "$API_BASE/branches" -Method GET
    Write-Host "   Sucursales encontradas: $($branches.Count)" -ForegroundColor Green
    $branches | ForEach-Object { Write-Host "   - $($_.name) ($($_.code)): $($_.latitude), $($_.longitude)" }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 2: Crear/Verificar motos de prueba
# =====================================================
Write-Host "🏍️ PASO 2: Configurando motos de prueba..." -ForegroundColor Yellow

# Moto 1: En el centro, ya con pedido asignado
$moto1 = @{
    license_plate = "TEST-001"
    status = "in_route"
    latitude = 14.6349
    longitude = -90.5069
    branch_id = 1
    max_orders_capacity = 5
} | ConvertTo-Json

# Moto 2: Al norte, disponible
$moto2 = @{
    license_plate = "TEST-002"
    status = "available"
    latitude = 14.6500
    longitude = -90.4900
    branch_id = 1
    max_orders_capacity = 5
} | ConvertTo-Json

# Moto 3: Al sur, disponible
$moto3 = @{
    license_plate = "TEST-003"
    status = "available"
    latitude = 14.6200
    longitude = -90.5200
    branch_id = 1
    max_orders_capacity = 5
} | ConvertTo-Json

try {
    # Crear motos (ignorar si ya existen)
    try { Invoke-RestMethod -Uri "$API_BASE/motos" -Method POST -Body $moto1 -ContentType "application/json" } catch {}
    try { Invoke-RestMethod -Uri "$API_BASE/motos" -Method POST -Body $moto2 -ContentType "application/json" } catch {}
    try { Invoke-RestMethod -Uri "$API_BASE/motos" -Method POST -Body $moto3 -ContentType "application/json" } catch {}
    
    $motos = Invoke-RestMethod -Uri "$API_BASE/motos" -Method GET
    Write-Host "   Motos registradas: $($motos.Count)" -ForegroundColor Green
    $motos | ForEach-Object { 
        $loc = if ($_.latitude) { "$($_.latitude), $($_.longitude)" } else { "Sin ubicación" }
        Write-Host "   - $($_.license_plate) [$($_.status)] @ $loc" 
    }
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 3: Crear pedidos de prueba
# =====================================================
Write-Host "📦 PASO 3: Creando pedidos de prueba..." -ForegroundColor Yellow

# Pedido 1: Cerca del norte (debería ir a TEST-002)
$order1 = @{
    client_name = "Cliente Norte"
    client_email = "norte@test.com"
    address = "Zona 18, Guatemala"
    latitude = 14.6550
    longitude = -90.4850
    branch = "central"
} | ConvertTo-Json

# Pedido 2: Cerca del sur (debería ir a TEST-003)
$order2 = @{
    client_name = "Cliente Sur"
    client_email = "sur@test.com"
    address = "Zona 12, Guatemala"
    latitude = 14.6150
    longitude = -90.5250
    branch = "central"
} | ConvertTo-Json

# Pedido 3: En el centro (podría ir a cualquiera)
$order3 = @{
    client_name = "Cliente Centro"
    client_email = "centro@test.com"
    address = "Zona 1, Guatemala"
    latitude = 14.6370
    longitude = -90.5100
    branch = "central"
} | ConvertTo-Json

try {
    $createdOrders = @()
    $createdOrders += Invoke-RestMethod -Uri "$API_BASE/orders" -Method POST -Body $order1 -ContentType "application/json"
    $createdOrders += Invoke-RestMethod -Uri "$API_BASE/orders" -Method POST -Body $order2 -ContentType "application/json"
    $createdOrders += Invoke-RestMethod -Uri "$API_BASE/orders" -Method POST -Body $order3 -ContentType "application/json"
    
    Write-Host "   Pedidos creados: $($createdOrders.Count)" -ForegroundColor Green
    $createdOrders | ForEach-Object { 
        Write-Host "   - #$($_.id) $($_.client_name) @ $($_.latitude), $($_.longitude)" 
    }
} catch {
    Write-Host "   Error creando pedidos: $_" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 4: Ejecutar optimización IA
# =====================================================
Write-Host "🤖 PASO 4: Ejecutando algoritmo de optimización..." -ForegroundColor Yellow
Write-Host "   (Round-Robin balanceado con ubicación real)" -ForegroundColor DarkGray

try {
    $optimization = Invoke-RestMethod -Uri "$API_BASE/optimization/assignments" -Method GET
    
    if ($optimization.assignments -and $optimization.assignments.Count -gt 0) {
        Write-Host "   ✅ Sugerencias generadas: $($optimization.assignments.Count)" -ForegroundColor Green
        Write-Host ""
        Write-Host "   ASIGNACIONES SUGERIDAS:" -ForegroundColor Cyan
        Write-Host "   ========================" -ForegroundColor Cyan
        
        $optimization.assignments | ForEach-Object {
            Write-Host "   Pedido #$($_.order_id) → Moto $($_.moto_plate)" -ForegroundColor White
            Write-Host "      Distancia: $($_.distance_km) km | ETA: $($_.eta_min) min" -ForegroundColor DarkGray
        }
        
        if ($optimization.stats) {
            Write-Host ""
            Write-Host "   ESTADÍSTICAS:" -ForegroundColor Cyan
            Write-Host "   - Pedidos asignados: $($optimization.stats.total_orders_assigned)"
            Write-Host "   - Motos utilizadas: $($optimization.stats.motos_used)"
            Write-Host "   - Distancia total: $($optimization.stats.total_distance_km) km"
            Write-Host "   - Promedio por pedido: $($optimization.stats.avg_distance_per_order) km"
        }
    } else {
        Write-Host "   ⚠️ No hay sugerencias: $($optimization.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Error en optimización: $_" -ForegroundColor Red
    Write-Host "   Tip: Asegúrate de que el servicio ai-service esté corriendo" -ForegroundColor DarkGray
}

Write-Host ""

# =====================================================
# PASO 5: ¿Aplicar asignaciones?
# =====================================================
Write-Host "==========================================" -ForegroundColor Cyan
$apply = Read-Host "¿Aplicar estas asignaciones? (s/n)"

if ($apply -eq "s" -or $apply -eq "S") {
    try {
        $result = Invoke-RestMethod -Uri "$API_BASE/optimization/apply" -Method POST -Body ($optimization | ConvertTo-Json -Depth 5) -ContentType "application/json"
        Write-Host ""
        Write-Host "✅ ASIGNACIONES APLICADAS" -ForegroundColor Green
        Write-Host "   Pedidos asignados: $($result.orders_assigned)"
        Write-Host "   Rutas creadas: $($result.routes_created)"
    } catch {
        Write-Host "   Error aplicando: $_" -ForegroundColor Red
    }
} else {
    Write-Host ""
    Write-Host "   Asignaciones NO aplicadas (solo simulación)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PRUEBA COMPLETADA" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
