@echo off
cd /d "%~dp0"
firebase deploy --only firestore
pause
