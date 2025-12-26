#requires -Version 5.1
$ErrorActionPreference = 'Stop'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ST Chat Beautifier (One-click Start)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

function Ensure-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) { return }

  # Try common Node.js install paths (Windows)
  $candidates = @(
    "$env:ProgramFiles\\nodejs",
    "$env:ProgramFiles(x86)\\nodejs"
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($dir in $candidates) {
    $nodeExe = Join-Path $dir 'node.exe'
    if (Test-Path $nodeExe) {
      $env:Path = "$dir;$env:Path"
      if (Get-Command node -ErrorAction SilentlyContinue) { return }
    }
  }

  Write-Host "[ERROR] Node.js not found in PATH." -ForegroundColor Red
  Write-Host "Please install Node.js (LTS): https://nodejs.org/" -ForegroundColor Yellow
  Read-Host "Press Enter to exit" | Out-Null
  exit 1
}

function Ensure-Npm {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm not found. Reinstall Node.js (LTS) to include npm." -ForegroundColor Red
    Read-Host "Press Enter to exit" | Out-Null
    exit 1
  }
}

try {
  Ensure-Node
  Ensure-Npm

  if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] First run: installing dependencies..." -ForegroundColor Green
    npm install
    Write-Host ""
  }

  if (-not (Test-Path "dist")) {
    Write-Host "[INFO] Building project..." -ForegroundColor Green
    npm run build
    Write-Host ""
  }

  $url = "http://localhost:4173"
  Write-Host "[START] Launching preview server..." -ForegroundColor Green
  Write-Host "Open in browser: $url" -ForegroundColor Gray

  # Try to open browser (non-fatal)
  try { Start-Process $url } catch {}

  # Run Vite preview
  npm run preview
}
catch {
  Write-Host "";
  Write-Host "[FAILED] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "";
  Read-Host "Press Enter to exit" | Out-Null
  exit 1
}
