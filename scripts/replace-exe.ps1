param([Parameter(Mandatory = $true)][string]$BunExe)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
$target = Join-Path $workspace 'Iniciar.exe'
$backup = Join-Path $workspace 'Iniciar.exe.codex-backup'
$prefix = $workspace + '\'
if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not $backup.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Caminho fora do projeto.'
}
if (Test-Path -LiteralPath $backup) { throw 'Backup temporario pendente; remova-o antes de compilar novamente.' }

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
    for ($attempt = 0; $attempt -lt 10 -and -not $removed; $attempt++) {
      try { Remove-Item -LiteralPath $backup; $removed = $true }
      catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $removed) { throw 'O executavel antigo ainda esta em uso.' }
  }
  Write-Output "Pronto: $target"
} catch {
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
  if ($hadPrevious -and (Test-Path -LiteralPath $backup)) { Move-Item -LiteralPath $backup -Destination $target }
  throw
}
