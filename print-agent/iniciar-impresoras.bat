@echo off
title POS Restaurante GT - Agente de Impresoras (Caja y Cocina)
cd /d "%~dp0"
echo Iniciando agente local de impresoras en http://127.0.0.1:9180 ...
node src\server.js
pause
