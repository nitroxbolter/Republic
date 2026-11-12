$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

$env:VITE_LOCAL_ACCOUNTS = 'on'
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$localBun = Join-Path $projectDir 'node_modules\bun\bin\bun.exe'
if (Test-Path $localBun) {
  $bun = $localBun
} else {
  $bun = (Get-Command bun -ErrorAction SilentlyContinue).Source
}
if (-not $bun) {
  throw 'Bun não encontrado. Instale Bun 1.4+ ou execute: npm install --no-save --package-lock=false bun@1.4.0'
}

& $bun build --compile --asset ./dist ./scripts/local-launcher.mjs --outfile ./Jogar-Republica-PT-Atualizado.exe --windows-title 'Republica em português' --windows-description 'Republica local em português, sem internet'
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host 'Executável criado: Jogar-Republica-PT-Atualizado.exe'
