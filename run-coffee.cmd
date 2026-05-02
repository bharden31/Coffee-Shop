@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE="

where python >nul 2>nul
if not errorlevel 1 set "PYTHON_EXE=python"

if not defined PYTHON_EXE (
  echo Python was not found on this computer.
  echo.
  echo Checked:
  echo - python on PATH
  echo.
  echo Install Python from https://www.python.org/ and double-click this file again.
  echo.
  pause
  exit /b 1
)

echo Starting House Coffee with:
echo "%PYTHON_EXE%"
echo.
if not defined ADMIN_PASSWORD set "ADMIN_PASSWORD=coffeeadmin"
"%PYTHON_EXE%" coffee_server.py
pause
