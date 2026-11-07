@echo off
rem Starts the scan server and the web app in two windows, then open http://localhost:5173
cd /d "%~dp0"
start "Scan server" cmd /k python -m uvicorn server.app:app --port 8000
cd web
start "Web app" cmd /k npm run dev -- --port 5173
