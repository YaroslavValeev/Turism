# Start PostgreSQL via Docker Compose. Run from project root.
# Requires Docker in PATH (restart terminal/Cursor after installing Docker Desktop).
Set-Location $PSScriptRoot\..
$err = $null
try {
    & docker compose up -d 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { $err = "docker compose failed" }
} catch {
    $err = "Docker not found. Install Docker Desktop and ensure 'docker' is in PATH (restart terminal)."
}
if ($err) {
    Write-Host "Error: $err" -ForegroundColor Red
    exit 1
}
Write-Host "PostgreSQL should be running on localhost:5432. Next: npx pnpm@9.0.0 db:migrate" -ForegroundColor Green
exit 0
