# scripts/make_venv.ps1
# ---------------------
# Create or update a local Python virtual environment for Orbit backend development.
# Usage:
#   .\scripts\make_venv.ps1

$VenvDir = ".venv"

Write-Output "🔧 Setting up virtual environment in $VenvDir"

# Create venv if missing
if (-Not (Test-Path $VenvDir)) {
    python -m venv $VenvDir
    Write-Output "✅ Created venv at $VenvDir"
}

# Activate and upgrade pip
& "$VenvDir\Scripts\python.exe" -m pip install --upgrade pip wheel

# Install backend requirements
& "$VenvDir\Scripts\python.exe" -m pip install -r apps/backend/requirements.txt

Write-Output "✅ Virtual environment ready. Activate with:"
Write-Output "   .\$VenvDir\Scripts\activate"