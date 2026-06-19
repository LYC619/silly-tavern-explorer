@echo off
setlocal EnableExtensions
chcp 65001 >nul

echo ========================================
echo   ST 对话美化器 - 开发模式（热更新）
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

echo [启动] 开发服务器启动中（修改代码会自动热更新）...
echo 浏览器请访问: http://localhost:8080
echo 测试期间请保持本窗口开启，按 Ctrl+C 停止
echo.

:: 启动 Vite 开发服务器（带 HMR 热更新）
npm run dev
