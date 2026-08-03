@echo off
setlocal
cd /d "%~dp0"

set "SERVER_FILE=%TEMP%\servidor_sin_cache_chrome_misma_ventana.py"

> "%SERVER_FILE%" echo import http.server
>> "%SERVER_FILE%" echo import socketserver
>> "%SERVER_FILE%" echo import time
>> "%SERVER_FILE%" echo import os
>> "%SERVER_FILE%" echo import subprocess
>> "%SERVER_FILE%" echo import webbrowser
>> "%SERVER_FILE%" echo from functools import partial
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo ROOT = os.getcwd()
>> "%SERVER_FILE%" echo START_PORT = 7068
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
>> "%SERVER_FILE%" echo     def end_headers(self):
>> "%SERVER_FILE%" echo         self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
>> "%SERVER_FILE%" echo         self.send_header("Pragma", "no-cache")
>> "%SERVER_FILE%" echo         self.send_header("Expires", "0")
>> "%SERVER_FILE%" echo         super().end_headers()
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo class Server(socketserver.ThreadingTCPServer):
>> "%SERVER_FILE%" echo     allow_reuse_address = True
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo handler = partial(NoCacheHandler, directory=ROOT)
>> "%SERVER_FILE%" echo httpd = None
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo for port in range(START_PORT, START_PORT + 100):
>> "%SERVER_FILE%" echo     try:
>> "%SERVER_FILE%" echo         httpd = Server(("127.0.0.1", port), handler)
>> "%SERVER_FILE%" echo         break
>> "%SERVER_FILE%" echo     except OSError:
>> "%SERVER_FILE%" echo         continue
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo if httpd is None:
>> "%SERVER_FILE%" echo     raise RuntimeError("No se encontro un puerto libre desde 7060 hasta 7159.")
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo url = "http://127.0.0.1:" + str(port) + "/?v=" + str(int(time.time()))
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo chrome_candidates = [
>> "%SERVER_FILE%" echo     os.path.join(os.environ.get("ProgramFiles", ""), "Google", "Chrome", "Application", "chrome.exe"),
>> "%SERVER_FILE%" echo     os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
>> "%SERVER_FILE%" echo     os.path.join(os.environ.get("LocalAppData", ""), "Google", "Chrome", "Application", "chrome.exe")
>> "%SERVER_FILE%" echo ]
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo chrome = next((x for x in chrome_candidates if x and os.path.exists(x)), None)
>> "%SERVER_FILE%" echo print("Servidor iniciado en: " + url)
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo if chrome:
>> "%SERVER_FILE%" echo     subprocess.Popen([chrome, url])
>> "%SERVER_FILE%" echo else:
>> "%SERVER_FILE%" echo     webbrowser.open(url)
>> "%SERVER_FILE%" echo.
>> "%SERVER_FILE%" echo with httpd:
>> "%SERVER_FILE%" echo     httpd.serve_forever()

python "%SERVER_FILE%"
del "%SERVER_FILE%" >nul 2>nul
pause