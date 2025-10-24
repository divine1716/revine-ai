@echo off
echo Starting D.Bonid AI Chatbot Web Server...
echo.
echo Opening browser at http://127.0.0.1:8000
echo Press Ctrl+C to stop the server
echo.

cd /d "%~dp0"
call venv\Scripts\activate.bat
start http://127.0.0.1:8000
python app.py
