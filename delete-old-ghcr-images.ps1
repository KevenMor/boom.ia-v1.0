# Script para deletar versões antigas de imagens do GHCR
# Requer um GitHub Personal Access Token com permissões: read:packages, delete:packages

$GITHUB_TOKEN = $env:GITHUB_TOKEN
$PACKAGE_NAME = "boom-ia-server"
$USERNAME = "kevenmor"

if (-not $GITHUB_TOKEN) {
    Write-Host "ERRO: Defina a variável GITHUB_TOKEN primeiro:" -ForegroundColor Red
    Write-Host '$env:GITHUB_TOKEN = "seu_token_aqui"' -ForegroundColor Yellow
    exit 1
}

Write-Host "🔍 Listando versões do pacote $PACKAGE_NAME..." -ForegroundColor Cyan

# Listar todas as versões
$headers = @{
    "Authorization" = "Bearer $GITHUB_TOKEN"
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$versions = Invoke-RestMethod -Uri "https://api.github.com/users/$USERNAME/packages/container/$PACKAGE_NAME/versions" -Headers $headers

Write-Host "`n📦 Versões encontradas:" -ForegroundColor Green
foreach ($version in $versions) {
    $tags = $version.metadata.container.tags -join ", "
    Write-Host "  ID: $($version.id) | Tags: $tags | Criado: $($version.created_at)" -ForegroundColor White
}

# Deletar versões específicas (v2 e v3)
$tagsToDelete = @("v2", "v3")

Write-Host "`n🗑️  Deletando versões antigas ($($tagsToDelete -join ', '))..." -ForegroundColor Yellow

foreach ($version in $versions) {
    $tags = $version.metadata.container.tags
    $shouldDelete = $false
    
    foreach ($tag in $tags) {
        if ($tagsToDelete -contains $tag) {
            $shouldDelete = $true
            break
        }
    }
    
    if ($shouldDelete) {
        Write-Host "  Deletando versão ID $($version.id) (tags: $($tags -join ', '))..." -ForegroundColor Red
        try {
            Invoke-RestMethod -Uri "https://api.github.com/users/$USERNAME/packages/container/$PACKAGE_NAME/versions/$($version.id)" -Method Delete -Headers $headers
            Write-Host "    ✅ Deletado com sucesso!" -ForegroundColor Green
        } catch {
            Write-Host "    ❌ Erro ao deletar: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n✅ Limpeza concluída! Mantidas apenas: latest e v4-debug" -ForegroundColor Green
