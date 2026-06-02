@echo off
cd /d "%~dp0"
REM Detect current git branch
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if "%BRANCH%"=="" set BRANCH=main

echo Using branch: %BRANCH%

git add -A
ngit commit -m "Auto-sync: %DATE% %TIME%" || echo No changes to commit.
git push origin %BRANCH%

echo Deploying to Firebase (hosting + firestore)...
firebase deploy --only hosting:kino,firestore

necho Done.
pause
