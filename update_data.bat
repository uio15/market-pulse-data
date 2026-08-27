@echo off
chcp 65001 >nul
title 更新行情数据
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo 正在从公开行情接口更新数据（腾讯基金/ETF + 同花顺板块 + 腾讯指数 + 新浪北证50，需要联网）...
echo 预计耗时 1-3 分钟，请勿关闭窗口。
echo.
python fetch_data.py
echo.
echo 数据更新完成！重新刷新页面即可看到最新数据。
pause
