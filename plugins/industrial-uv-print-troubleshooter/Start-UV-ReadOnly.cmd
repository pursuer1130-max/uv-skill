@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0skills\industrial-uv-print-troubleshooter\scripts\uv_site_readonly.ps1" -Action LoadCheck
exit /b %ERRORLEVEL%
