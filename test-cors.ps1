# Test CORS headers
$headers = @{
    'Content-Type' = 'application/json'
    'Origin' = 'http://localhost:3001'
}

$body = @{
    email = 'admin@logitrack.com'
    password = 'admin123'
} | ConvertTo-Json

Write-Host "`n🧪 Probando login con CORS headers..." -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri 'http://localhost:8085/auth/login' -Method POST -Headers $headers -Body $body
    
    Write-Host "`n✅ Status Code: $($response.StatusCode)" -ForegroundColor Green
    
    Write-Host "`n📋 CORS Headers:" -ForegroundColor Yellow
    $corsHeaders = $response.Headers.GetEnumerator() | Where-Object { $_.Key -like "*Access-Control*" }
    
    if ($corsHeaders) {
        foreach ($header in $corsHeaders) {
            Write-Host "  $($header.Key): $($header.Value)" -ForegroundColor White
        }
    } else {
        Write-Host "  ❌ No se encontraron headers CORS" -ForegroundColor Red
    }
    
    # Verificar si hay duplicados
    $allowOrigin = $response.Headers['Access-Control-Allow-Origin']
    if ($allowOrigin) {
        if ($allowOrigin -is [array] -and $allowOrigin.Count -gt 1) {
            Write-Host "`n❌ ERROR: Header duplicado!" -ForegroundColor Red
            Write-Host "  Valores: $($allowOrigin -join ', ')" -ForegroundColor Red
        } else {
            Write-Host "`n✅ Header único: $allowOrigin" -ForegroundColor Green
        }
    }
    
} catch {
    Write-Host "`n❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
