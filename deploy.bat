@echo off
REM Script de Deploy para ASTEC

echo [*] Enviando arquivos...
pscp -r -l root -pw "superrhsa@#2018!" "dist\*" 10.3.1.135:/home/astec/app/dist/

echo [*] Conectando na VM...
plink -l root -pw "superrhsa@#2018!" 10.3.1.135 ^
  "cd /home/astec/app && docker cp dist/. astec-app:/app/dist/ && docker restart astec-app"

echo [+] Deploy completo!
