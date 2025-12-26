@echo off
setlocal EnableExtensions

:: Prefer PowerShell launcher (handles UTF-8 output more reliably)
where powershell >nul 2>nul
if %errorlevel% equ 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
  exit /b %errorlevel%
)

chcp 65001 >nul
echo ========================================
echo   ST 对话美化器 v0.2
echo ========================================
echo.

:: 检查 node 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 检查是否已安装依赖
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    echo.
)

:: 检查是否已构建
if not exist "dist" (
    echo [提示] 正在构建项目...
    call npm run build
    echo.
)

echo [启动] 正在启动本地服务器...
echo 浏览器将自动打开，如未打开请访问: http://localhost:4173
echo 按 Ctrl+C 停止服务器
echo.

:: 启动预览服务器
npm run preview
