# =====================================================
# SCRIPT DE PRUEBA: Asignación Inteligente de Pedidos
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
    $branches = Invoke-RestMethod -Uri "$API_BASE/branches" -Method GET -ErrorAction Stop
    Write-Host "   Sucursales encontradas: $($branches.Count)" -ForegroundColor Green
    foreach ($b in $branches) {
        Write-Host "   - $($b.name) ($($b.code)): $($b.latitude), $($b.longitude)"
    }
}
catch {
    Write-Host "   Sin sucursales o error de conexión" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 2: Crear/Verificar motos de prueba
# =====================================================
Write-Host "🏍️ PASO 2: Configurando motos de prueba..." -ForegroundColor Yellow

$motos = @(
    @{ license_plate = "TEST-001"; status = "in_route"; latitude = 14.6349; longitude = -90.5069; branch_id = 1; max_orders_capacity = 5 },
    @{ license_plate = "TEST-002"; status = "available"; latitude = 14.6500; longitude = -90.4900; branch_id = 1; max_orders_capacity = 5 },
    @{ license_plate = "TEST-003"; status = "available"; latitude = 14.6200; longitude = -90.5200; branch_id = 1; max_orders_capacity = 5 }
)

foreach ($m in $motos) {
    try {
        $body = $m | ConvertTo-Json
        Invoke-RestMethod -Uri "$API_BASE/motos" -Method POST -Body $body -ContentType "application/json" -ErrorAction SilentlyContinue | Out-Null
    }
    catch { }
}

try {
    $allMotos = Invoke-RestMethod -Uri "$API_BASE/motos" -Method GET -ErrorAction Stop
    Write-Host "   Motos registradas: $($allMotos.Count)" -ForegroundColor Green
    foreach ($moto in $allMotos) {
        $loc = if ($moto.latitude) { "$($moto.latitude), $($moto.longitude)" } else { "Sin ubicacion" }
        Write-Host "   - $($moto.license_plate) [$($moto.status)] @ $loc"
    }
}
catch {
    Write-Host "   Error obteniendo motos: $_" -ForegroundColor Red
}

Write-Host ""

# =====================================================
# PASO 3: Crear pedidos de prueba
# =====================================================
Write-Host "📦 PASO 3: Creando pedidos de prueba..." -ForegroundColor Yellow

$orders = @(
    @{ client_name = "Cliente Norte"; client_email = "norte@test.com"; address = "Zona 18, Guatemala"; latitude = 14.6550; longitude = -90.4850; branch = "central" },
    @{ client_name = "Cliente Sur"; client_email = "sur@test.com"; address = "Zona 12, Guatemala"; latitude = 14.6150; longitude = -90.5250; branch = "central" },
    @{ client_name = "Cliente Centro"; client_email = "centro@test.com"; address = "Zona 1, Guatemala"; latitude = 14.6370; longitude = -90.5100; branch = "central" }
)

$createdCount = 0
foreach ($o in $orders) {
    try {
        $body = $o | ConvertTo-Json
        $result = Invoke-RestMethod -Uri "$API_BASE/orders" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop
        Write-Host "   - Creado #$($result.id) $($result.client_name)" -ForegroundColor Green
        $createdCount++
    }
    catch {
        Write-Host "   - Error creando pedido: $_" -ForegroundColor Red
    }
}
Write-Host "   Total pedidos creados: $createdCount" -ForegroundColor Cyan

Write-Host ""

# =====================================================
# PASO 4: Ejecutar optimización IA
# =====================================================
Write-Host "🤖 PASO 4: Ejecutando algoritmo de optimización..." -ForegroundColor Yellow
Write-Host "   (Round-Robin balanceado con ubicación real)" -ForegroundColor DarkGray

try {
    $optimization = Invoke-RestMethod -Uri "$API_BASE/optimization/assignments" -Method GET -ErrorAction Stop
    
    if ($optimization.assignments -and $optimization.assignments.Count -gt 0) {
        Write-Host "   ✅ Sugerencias generadas: $($optimization.assignments.Count)" -ForegroundColor Green
        Write-Host ""
        Write-Host "   ASIGNACIONES SUGERIDAS:" -ForegroundColor Cyan
        Write-Host "   ========================" -ForegroundColor Cyan
        
        foreach ($sug in $optimization.assignments) {
            Write-Host "   Pedido #$($sug.order_id) → Moto $($sug.moto_plate)" -ForegroundColor White
            Write-Host "      Distancia: $($sug.distance_km) km | ETA: $($sug.eta_min) min" -ForegroundColor DarkGray
        }
        
        if ($optimization.stats) {
            Write-Host ""
            Write-Host "   ESTADÍSTICAS:" -ForegroundColor Cyan
            Write-Host "   - Pedidos asignados: $($optimization.stats.total_orders_assigned)"
            Write-Host "   - Motos utilizadas: $($optimization.stats.motos_used)"
            Write-Host "   - Distancia total: $($optimization.stats.total_distance_km) km"
        }
        
        # Guardar para posible aplicación
        $script:optimizationData = $optimization
    }
    else {
        Write-Host "   ⚠️ No hay sugerencias: $($optimization.message)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "   Error en optimización: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  PRUEBA COMPLETADA" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Abre http://localhost:3001 para ver la app" -ForegroundColor Magenta
