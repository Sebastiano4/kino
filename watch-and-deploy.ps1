# Watch the repository folder and run deploy-git-firestore.bat on changes
$path = Split-Path -Parent $MyInvocation.MyCommand.Path
$filter = '*.*'
$watcher = New-Object System.IO.FileSystemWatcher $path, $filter
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true

$global:lastRun = Get-Date 0
$debounceSeconds = 2

$action = {
    $now = Get-Date
    if (($now - $global:lastRun).TotalSeconds -lt $debounceSeconds) { return }
    $global:lastRun = $now
    Start-Sleep -Milliseconds 500
    Write-Host "Change detected: $($Event.SourceEventArgs.ChangeType) $($Event.SourceEventArgs.FullPath) - running deploy..." -ForegroundColor Yellow
    & "$PSScriptRoot\deploy-git-firestore.bat"
}

Register-ObjectEvent $watcher Changed -Action $action | Out-Null
Register-ObjectEvent $watcher Created -Action $action | Out-Null
Register-ObjectEvent $watcher Deleted -Action $action | Out-Null
Register-ObjectEvent $watcher Renamed -Action $action | Out-Null

Write-Host "Watching $path for changes. Press Enter to stop." -ForegroundColor Green
Read-Host | Out-Null

Get-EventSubscriber | Unregister-Event
$watcher.Dispose()
Write-Host "Watcher stopped." -ForegroundColor Cyan
