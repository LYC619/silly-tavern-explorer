#!/bin/bash

echo "========================================"
echo "  ST 对话美化器 v0.2"
echo "========================================"
echo

# 检查 node 是否安装
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "[提示] 首次运行，正在安装依赖..."
    npm install
    echo
fi

# 检查是否已构建
if [ ! -d "dist" ]; then
    echo "[提示] 正在构建项目..."
    npm run build
    echo
fi

echo "[启动] 正在启动本地服务器..."
echo "浏览器将自动打开，如未打开请访问: http://localhost:4173"
echo "按 Ctrl+C 停止服务器"
echo

# 启动预览服务器
npm run preview
