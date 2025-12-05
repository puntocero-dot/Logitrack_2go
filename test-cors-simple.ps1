# Test CORS headers simple
$headers = @{
    'Content-Type' = 'application/json'
    'Origin' = 'http://localhost:3001'
}

$body = @{
    email = 'admin@logitrack.com'
    password = 'admin123'
} | ConvertTo-Json

Write-Host "Probando login con CORS headers..."

$response = Invoke-WebRequest -Uri 'http://localhost:8085/auth/login' -Method POST -Headers $headers -Body $body

Write-Host "Status Code: $($response.StatusCode)"

Write-Host "CORS Headers:"
$response.Headers.GetEnumerator() | Where-Object { $_.Key -like "*Access-Control*" } | ForEach-Object {
    Write-Host "  $($_.Key): $($_.Value)"
}
