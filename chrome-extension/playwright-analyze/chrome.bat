@echo off
echo ============================================================
echo  MATILDE CRM - Abrir Chrome com Debug CDP
echo ============================================================
echo.

echo Encerrando Chrome em execucao...
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 2 >nul

echo Procurando Chrome...

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    echo Encontrado em Program Files
    set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
    goto :abrir
)

if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    echo Encontrado em Program Files x86
    set CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
    goto :abrir
)

if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    echo Encontrado em AppData Local
    set CHROME_PATH=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
    goto :abrir
)

echo ERRO: Chrome nao encontrado!
echo Verifique onde o Chrome esta instalado no seu PC.
pause
exit /b 1

:abrir
echo Abrindo: %CHROME_PATH%
echo.
"%CHROME_PATH%" --remote-debugging-port=9222 --user-data-dir="%TEMP%\matilde-chrome-debug"

echo.
echo Chrome encerrado.
pause
