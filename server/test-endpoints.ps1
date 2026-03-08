# Test script for migrated Edge Functions -> Server endpoints
$base = "http://localhost:3001/api"
$passed = 0
$failed = 0

function Test-Endpoint {
    param($name, $method, $endpoint, $body, $headers = @{})
    Write-Host "`n--- $name ---" -ForegroundColor Cyan
    try {
        $params = @{
            Uri = "$base$endpoint"
            Method = $method
            UseBasicParsing = $true
            ContentType = "application/json"
        }
        if ($headers.Count -gt 0) { $params.Headers = $headers }
        if ($body -and $method -ne "GET") { $params.Body = ($body | ConvertTo-Json -Compress) }
        
        $r = Invoke-WebRequest @params
        Write-Host "OK $($r.StatusCode)" -ForegroundColor Green
        if ($r.Content.Length -lt 500) { Write-Host $r.Content }
        $script:passed++
        return $true
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
        $script:failed++
        return $false
    }
}

Write-Host "`n=== Testando endpoints do servidor ===" -ForegroundColor Yellow

# 1. Health
Test-Endpoint "Health" GET "/../health" | Out-Null
# Fix health URL
try {
    $r = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
    Write-Host "`n--- Health ---" -ForegroundColor Cyan
    Write-Host "OK $($r.StatusCode)" -ForegroundColor Green
    $passed++
} catch { Write-Host "Health FAIL"; $failed++ }

# 2. Prompts (GET - no auth)
Test-Endpoint "Admin Prompts GET" GET "/admin/prompts" | Out-Null
# Prompts is POST for getPromptConfig - check route
try {
    $r = Invoke-WebRequest -Uri "$base/admin/prompts" -Method GET -UseBasicParsing
    Write-Host "`n--- Admin Prompts ---" -ForegroundColor Cyan
    Write-Host "OK $($r.StatusCode)" -ForegroundColor Green
    $passed++
} catch { Write-Host "Prompts FAIL"; $failed++ }

# 3. FIPE (no auth)
Test-Endpoint "Tools FIPE" POST "/tools/fipe" @{ marca = "Fiat" } | Out-Null

# 4. Nearest Unit (CEP required)
Test-Endpoint "Tools Nearest Unit" POST "/tools/nearest-unit" @{ cep = "01310100" } | Out-Null

# 5. Webhooks (simulate Chatwoot)
Test-Endpoint "Webhooks" POST "/webhooks" @{ agent_id = "test"; event = "message_created" } | Out-Null

# 6. Inventory sync
Test-Endpoint "Inventory Sync" POST "/inventory/sync" @{} | Out-Null

# 7. Queue process (expect 400 - no message)
try {
    $r = Invoke-WebRequest -Uri "$base/queue/process" -Method POST -ContentType "application/json" -Body "{}" -UseBasicParsing
    Write-Host "`n--- Queue Process ---" -ForegroundColor Cyan
    Write-Host "OK $($r.StatusCode) - $($r.Content)" -ForegroundColor Green
    $passed++
} catch {
    if ($_.Exception.Response.StatusCode -eq 400) {
        Write-Host "`n--- Queue Process ---" -ForegroundColor Cyan
        Write-Host "OK 400 (expected - no message)" -ForegroundColor Green
        $passed++
    } else { Write-Host "Queue FAIL"; $failed++ }
}

# 8. Provider keys (expect 500 - no ENCRYPTION_KEY)
try {
    Invoke-WebRequest -Uri "$base/admin/provider-keys" -Method POST -ContentType "application/json" -Body "{}" -UseBasicParsing | Out-Null
} catch {
    if ($_.Exception.Response.StatusCode -eq 500 -and $_.ErrorDetails.Message -match "ENCRYPTION") {
        Write-Host "`n--- Provider Keys ---" -ForegroundColor Cyan
        Write-Host "OK 500 (expected - ENCRYPTION_KEY not set)" -ForegroundColor Green
        $passed++
    } else { $failed++ }
}

Write-Host "`n=== Resultado: $passed passou, $failed falhou ===" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })
