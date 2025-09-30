# scripts/make_venv.sh
# --------------------
# Create or update a local Python virtual environment for Orbit backend development.
# Usage:
#   bash scripts/make_venv.sh

set -euo pipefail

VENV_DIR=".venv"

echo "🔧 Setting up virtual environment in ${VENV_DIR}"

# Create venv if missing
if [ ! -d "${VENV_DIR}" ]; then
  python3 -m venv "${VENV_DIR}"
  echo "✅ Created venv at ${VENV_DIR}"
fi

# Activate and upgrade pip
. "${VENV_DIR}/bin/activate"
pip install --upgrade pip wheel

# Install backend requirements
pip install -r apps/backend/requirements.txt

echo "✅ Virtual environment ready. Activate with:"
echo "   source ${VENV_DIR}/bin/activate"