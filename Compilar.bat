@echo off
setlocal
cd /d "%~dp0"
if errorlevel 1 exit /b 1

set "VITE_LOCAL_ACCOUNTS=on"
set "BUN_EXE=%CD%\node_modules\bun\bin\bun.exe"
if not exist "%BUN_EXE%" (
  where bun >nul 2>nul
  if errorlevel 1 (
    echo Bun nao encontrado. Instale as dependencias do projeto antes de compilar.
    exit /b 1
  )
  set "BUN_EXE=bun"
)

echo Compilando o jogo...
"%BUN_EXE%" run build
if errorlevel 1 (
  echo Falha na compilacao web. Iniciar.exe anterior foi preservado.
  exit /b 1
)

echo Atualizando Iniciar.exe...
"%BUN_EXE%" build --compile --asset ./dist ./scripts/local-launcher.mjs --outfile ./Iniciar.exe
if errorlevel 1 (
  echo Falha ao atualizar Iniciar.exe. Feche o jogo se ele estiver aberto e tente novamente.
  exit /b 1
)

echo Pronto: %CD%\Iniciar.exe
exit /b 0
