#!/bin/bash
set -e

echo "==================================================="
echo " 🔷 AI Strategy Hub - Startup Script "
echo "==================================================="

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed or not in PATH."
    exit 1
fi

# Check for Node.js
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed or not in PATH."
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "[WARNING] .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "Please edit the .env file and add your API keys."
fi

echo ""
echo "[1/3] Building Frontend (Vite/Node)..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "[2/3] Installing Backend Dependencies (Python)..."
cd backend
pip install -r requirements.txt

echo ""
echo "[3/3] Starting AI Strategy Hub..."
echo "The application will be available at http://localhost:8000"
echo "Press Ctrl+C to stop."
echo ""

python3 -m uvicorn main:app --port 8000 --host 0.0.0.0
