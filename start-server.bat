@echo off
chcp 65001 >nul
title CN RANK - Local Preview (http://localhost:8189)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
