# E2E visual: login -> Galeria -> abrir galeria "Institucional" (modal).
# PowerShell:
#   $env:E2E_EMAIL = "seu@email.com"
#   $env:E2E_PASSWORD = "sua_senha"
#   .\scripts\e2e-gallery-visual.ps1
#
# Precisa: npm run dev:all (8080 + 3001), npx agent-browser

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent

Set-Location $root
$out = Join-Path $root "e2e-screenshots"
New-Item -ItemType Directory -Force -Path $out | Out-Null

if (-not $env:E2E_EMAIL -or -not $env:E2E_PASSWORD) {
  Write-Host ""
  Write-Host "Para fluxo completo defina E2E_EMAIL e E2E_PASSWORD." -ForegroundColor Yellow
  Write-Host '  $env:E2E_EMAIL = "..."; $env:E2E_PASSWORD = "..."' -ForegroundColor Gray
  Write-Host "  .\scripts\e2e-gallery-visual.ps1" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Sem credenciais: so captura /galeria (vai para login)." -ForegroundColor DarkYellow
  npx agent-browser --session e2e-gallery-ui close --all 2>$null
  npx agent-browser --session e2e-gallery-ui open "http://127.0.0.1:8080/galeria"
  npx agent-browser --session e2e-gallery-ui wait 2500
  npx agent-browser --session e2e-gallery-ui screenshot (Join-Path $out "00-sem-login-redireciona.png")
  npx agent-browser --session e2e-gallery-ui screenshot --annotate (Join-Path $out "00-sem-login-annotate.png")
  npx agent-browser --session e2e-gallery-ui close --all
  Write-Host "Screenshots: $out" -ForegroundColor Green
  exit 0
}

$email = $env:E2E_EMAIL
$pass = $env:E2E_PASSWORD

npx agent-browser --session e2e-gallery-ui close --all 2>$null
npx agent-browser --session e2e-gallery-ui open "http://127.0.0.1:8080/login"
npx agent-browser --session e2e-gallery-ui wait 2000
npx agent-browser --session e2e-gallery-ui screenshot (Join-Path $out "01-login.png")

npx agent-browser --session e2e-gallery-ui find label "Email" fill $email
npx agent-browser --session e2e-gallery-ui find label "Senha" fill $pass
npx agent-browser --session e2e-gallery-ui find role button click --name "Entrar"
npx agent-browser --session e2e-gallery-ui wait 5000

$n = npx agent-browser --session e2e-gallery-ui get url 2>&1
Write-Host "URL apos login: $n"

npx agent-browser --session e2e-gallery-ui open "http://127.0.0.1:8080/galeria"
npx agent-browser --session e2e-gallery-ui wait 3000
npx agent-browser --session e2e-gallery-ui screenshot (Join-Path $out "02-lista-galeria.png")
npx agent-browser --session e2e-gallery-ui screenshot --annotate (Join-Path $out "02-lista-galeria-annotate.png")

npx agent-browser --session e2e-gallery-ui find text "Institucional" click 2>$null
if ($LASTEXITCODE -ne 0) {
  npx agent-browser --session e2e-gallery-ui snapshot -i -c -d 10 --max-output 6000
  Write-Host "Texto 'Institucional' nao encontrado; ajuste o script." -ForegroundColor Yellow
} else {
  npx agent-browser --session e2e-gallery-ui wait 2500
  npx agent-browser --session e2e-gallery-ui screenshot (Join-Path $out "03-modal-galeria.png")
  npx agent-browser --session e2e-gallery-ui screenshot --annotate (Join-Path $out "03-modal-annotate.png")
}

npx agent-browser --session e2e-gallery-ui close --all
Write-Host "OK. Imagens em: $out" -ForegroundColor Green
