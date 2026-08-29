#!/bin/bash

# Run backend and frontend for the project on macOS.
# Usage:
#   chmod +x start-zorta.sh
#   ./start.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Setting up backend..."
cd "$ROOT_DIR/backend"

if [ ! -d ".venv" ]; then
    echo "==> Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "==> Activating virtual environment..."
source .venv/bin/activate

echo "==> Installing backend dependencies..."
python -m pip install -r requirements.txt

if [ ! -f ".env" ]; then
    echo "==> Creating backend .env..."
    cp .env.example .env
fi

echo "==> Seeding database..."
python seed.py

echo "==> Starting backend..."
python run.py &
BACKEND_PID=$!

echo "==> Setting up frontend..."
cd "$ROOT_DIR/frontend"

echo "==> Installing frontend dependencies..."
npm install

if [ ! -f ".env" ]; then
    echo "==> Creating frontend .env..."
    cp .env.example .env
fi

echo "==> Starting frontend..."
npm run dev &
FRONTEND_PID=$!

cleanup() {
    echo ""
    echo "==> Stopping servers..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo ""
echo "========================================"
echo " Backend + Frontend are running!"
echo " Press Ctrl+C to stop both."
echo "========================================"
echo ""

wait
