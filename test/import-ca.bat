@echo off
rem Install the locally generated CA into CurrentUser trusted root (no admin needed)
certutil.exe -user -addstore Root "%~dp0..\cert\ca.crt"
exit /b %ERRORLEVEL%
