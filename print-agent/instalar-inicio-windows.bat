@echo off
set "AGENT_DIR=%~dp0"
set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\POS-Print-Agent.vbs"

echo Creando inicio automatico silencioso en Windows...
(
  echo Set WshShell = CreateObject("WScript.Shell"^)
  echo WshShell.CurrentDirectory = "%AGENT_DIR:~0,-1%"
  echo WshShell.Run "node src\server.js", 0, False
) > "%STARTUP_VBS%"

echo Listo. El agente de impresoras arrancara automaticamente al encender Windows.
echo Iniciando el agente ahora en segundo plano...
wscript "%STARTUP_VBS%"
pause
