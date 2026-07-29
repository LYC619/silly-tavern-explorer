@echo off
setlocal EnableExtensions
chcp 65001 >nul

echo ========================================
echo   ST-Explore - 客户端开发模式（Tauri）
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

echo [启动] Tauri 客户端开发模式启动中（前端热更新，Rust 侧改动会自动重编译）...
echo 首次运行需要编译 Rust，耗时较长属正常现象
echo 测试期间请保持本窗口开启，按 Ctrl+C 停止
echo.

npm run tauri:dev
