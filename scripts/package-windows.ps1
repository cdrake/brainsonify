# Builds dist\package\brainsonify.zip on Windows, installing Bun first if it is missing.
#   powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Bun..."
  Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
  $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
}

bun install --frozen-lockfile
if ($LASTEXITCODE) { exit $LASTEXITCODE }
bun run package
if ($LASTEXITCODE) { exit $LASTEXITCODE }

Write-Host "`nBuilt $(Resolve-Path dist\package\brainsonify.zip)"
