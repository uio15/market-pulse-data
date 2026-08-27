@echo off
chcp 65001 >nul
title 大盘脉搏 - 本地运行
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3（勾选 Add to PATH）:
    echo        https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

python -c "import socket;s=socket.socket();s.bind(('127.0.0.1',8765));s.close()" >nul 2>nul
if errorlevel 1 (
    echo [提示] 端口 8765 已被占用，可能已有一个实例在运行。
    echo        请直接访问 http://127.0.0.1:8765/#funds
    echo.
    pause
    exit /b 1
)

echo ============================================
echo   大盘脉搏（复刻版）本地服务器已启动
echo   地址: http://127.0.0.1:8765/#funds
echo   关闭本窗口即停止服务
echo ============================================
echo.
start "" "http://127.0.0.1:8765/#funds"
python -m http.server 8765 --bind 127.0.0.1
