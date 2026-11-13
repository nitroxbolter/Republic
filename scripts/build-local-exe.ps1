$ErrorActionPreference = 'Stop'
$compiler = Join-Path (Split-Path -Parent $PSScriptRoot) 'Compilar.bat'
& $compiler
exit $LASTEXITCODE
