# Script para probar la creación de un documento SUNAT
# Requiere estar autenticado como SUPERADMIN

$body = @{
    storeId = "cml6196gm00001734mluw5pkr"
    docType = "BOLETA"
    customer = @{
        docType = "DNI"
        docNumber = "12345678"
        name = "Juan Pérez García"
    }
    totals = @{
        taxable = 84.75
        igv = 15.25
        total = 100.00
    }
} | ConvertTo-Json -Depth 5

Write-Host "📤 Enviando solicitud para crear BOLETA..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-WebRequest `
        -Uri "http://localhost:3000/api/sunat/test-draft" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing `
        -SessionVariable session

    Write-Host "✅ Respuesta exitosa:" -ForegroundColor Green
    Write-Host ""
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "📊 Para verificar el documento creado:" -ForegroundColor Yellow
    Write-Host "   node scripts/verify-sunat.js" -ForegroundColor Gray

} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $errorBody = $_.ErrorDetails.Message
    
    Write-Host "❌ Error ($statusCode):" -ForegroundColor Red
    Write-Host ""
    
    if ($errorBody) {
        try {
            $errorBody | ConvertFrom-Json | ConvertTo-Json -Depth 5
        } catch {
            Write-Host $errorBody
        }
    } else {
        Write-Host $_.Exception.Message
    }
    
    Write-Host ""
    Write-Host "💡 Asegúrate de:" -ForegroundColor Yellow
    Write-Host "   1. Estar autenticado en el navegador (http://localhost:3000)" -ForegroundColor Gray
    Write-Host "   2. Ser usuario SUPERADMIN (superadmin@mail.com)" -ForegroundColor Gray
    Write-Host "   3. El servidor está corriendo (npm run dev)" -ForegroundColor Gray
}
