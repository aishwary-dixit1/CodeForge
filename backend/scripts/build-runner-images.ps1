$ErrorActionPreference = 'Stop'

Write-Host "Building CodeForge runner images..." -ForegroundColor Cyan

$root = Split-Path -Parent $PSScriptRoot

$images = @(
    @{ Name = "codeforge/runner-python3:latest"; Context = "$root\runners\python3" },
    @{ Name = "codeforge/runner-nodejs20:latest"; Context = "$root\runners\nodejs20" },
    @{ Name = "codeforge/runner-java17:latest"; Context = "$root\runners\java17" },
    @{ Name = "codeforge/runner-cpp20:latest"; Context = "$root\runners\cpp20" }
)

foreach ($image in $images) {
    Write-Host "Building $($image.Name) from $($image.Context)" -ForegroundColor Yellow
    docker build -t $image.Name $image.Context
}

Write-Host "All runner images built successfully." -ForegroundColor Green
