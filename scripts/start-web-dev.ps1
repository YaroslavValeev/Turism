$ErrorActionPreference = "Stop"

$webDir = Join-Path $PSScriptRoot "..\apps\web"
$nextCmd = Join-Path $webDir "node_modules\.bin\next.cmd"

Set-Location $webDir
& $nextCmd dev -p 3000
