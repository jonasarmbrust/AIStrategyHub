@echo off
echo ===================================================
echo 🔷 AI Strategy Hub - Startup Script
echo ===================================================

:: Check for Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3 is not installed or not in PATH.
    pause
    exit /b
)

:: Check for Node.js
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    pause
    exit /b
)

:: Check if .env exists
if not exist .env (
    echo [WARNING] .env file not found. Creating from .env.example...
    copy .env.example .env
    echo Please edit the .env file and add your API keys.
)

echo.
echo [1/3] Building Frontend (Vite/Node)...
cd frontend
call npm install
call npm run build
cd ..

echo.
echo [2/3] Installing Backend Dependencies (Python)...
cd backend
call pip install -r requirements.txt

echo.
echo [3/3] Starting AI Strategy Hub...
echo The application will be available at http://localhost:8000
echo Press Ctrl+C to stop.
echo.

python -m uvicorn main:app --port 8000

cd ..
pause
