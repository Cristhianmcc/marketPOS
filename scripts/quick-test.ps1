# Test rapido de checkout - PowerShell
# Ejecutar: .\scripts\quick-test.ps1

Write-Host "===== PRUEBAS DE CHECKOUT =====" -ForegroundColor Cyan

# Test 1: Carrito vacio
Write-Host "`nTest 1: Carrito vacio (debe devolver 400)" -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "http://localhost:3000/api/sales/checkout" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"items":[]}' `
    -UseBasicParsing `
    -ErrorAction SilentlyContinue

if ($?) {
    $data = $response.Content | ConvertFrom-Json
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor $(if ($response.StatusCode -eq 400) { "Green" } else { "Red" })
    Write-Host "Code: $($data.code)" -ForegroundColor Blue
} else {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 400) { "Green" } else { "Red" })
    Write-Host "Code: $($errorBody.code)" -ForegroundColor Blue
    Write-Host "Message: $($errorBody.message)" -ForegroundColor Blue
}

# Test 2: Producto inexistente
Write-Host "`nTest 2: Producto inexistente (debe devolver 400)" -ForegroundColor Yellow
$body = @{
    items = @(
        @{
            storeProductId = "producto-falso-xxx"
            quantity = 1
            unitPrice = 10
        }
    )
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/sales/checkout" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body `
    -UseBasicParsing `
    -ErrorAction SilentlyContinue | Out-Null

$statusCode = $_.Exception.Response.StatusCode.value__
$errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
Write-Host "Status: $statusCode" -ForegroundColor $(if ($statusCode -eq 400) { "Green" } else { "Red" })
Write-Host "Code: $($errorBody.code)" -ForegroundColor Blue
Write-Host "Message: $($errorBody.message)" -ForegroundColor Blue

Write-Host "`nPruebas completadas!" -ForegroundColor Green
