param([string]$BunExe, [switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$target = Join-Path $workspace 'Iniciar.exe'
$backup = Join-Path $workspace 'Iniciar.exe.codex-backup'
$prefix = $workspace + '\'
if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not $backup.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Caminho fora do projeto.'
}
$running = @(Get-Process -Name Iniciar -ErrorAction SilentlyContinue | Where-Object {
  [string]::Equals($_.Path, $target, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) {
  throw 'Iniciar.exe esta aberto. Salve sua cidade, feche o jogo e execute Compilar.bat novamente.'
}
if (Test-Path -LiteralPath $backup) { throw 'Backup temporario pendente; remova-o antes de compilar novamente.' }
if ($CheckOnly) { exit 0 }
if (-not $BunExe) { throw 'Caminho do Bun nao informado.' }

$hadPrevious = Test-Path -LiteralPath $target
if ($hadPrevious) { Move-Item -LiteralPath $target -Destination $backup }
try {
  Push-Location $workspace
  try {
    & $BunExe build --compile --asset ./dist ./scripts/local-launcher.mjs --outfile ./Iniciar.exe
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o executavel.' }
  } finally { Pop-Location }

  if ($hadPrevious) {
    $removed = $false
    $lastRemovalError = $null
    for ($attempt = 0; $attempt -lt 10 -and -not $removed; $attempt++) {
      try { Remove-Item -LiteralPath $backup; $removed = $true }
      catch { $lastRemovalError = $_; Start-Sleep -Milliseconds 500 }
    }
    if (-not $removed) { throw "Nao foi possivel remover o executavel antigo. Feche o jogo e tente novamente. Detalhes: $lastRemovalError" }
  }
  Write-Output "Pronto: $target"
} catch {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
  if ($hadPrevious -and (Test-Path -LiteralPath $backup)) { Move-Item -LiteralPath $backup -Destination $target }
  throw
}
