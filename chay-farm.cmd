@echo off
rem Chay Reward Farm o che do BUILD (khong co vite watcher -> on dinh hon khi chay dai).
rem Log: %TEMP%\brf-app.log   | Nhip tim + crash: %APPDATA%\bing-reward-farm\heartbeat.txt, crash.log
cd /d "%~dp0"
if not exist "out\main\index.js" (
  echo [farm] chua co ban build - dang build...
  call npm run build || goto :loi
)
echo [farm] dang mo Reward Farm (ban build)...
start "" /b cmd /c "npx electron . > ""%TEMP%\brf-app.log"" 2>&1"
exit /b 0

:loi
echo [farm] build loi - xem thong bao ben tren.
pause
exit /b 1
