<#
.SYNOPSIS
    One-time setup. Registers track.ps1 as a Scheduled Task that starts
    automatically at logon (runs hidden in the background).

.NOTES
    Run this once from PowerShell (no admin rights needed for current-user tasks):
        powershell -ExecutionPolicy Bypass -File setup.ps1

    To uninstall:
        Unregister-ScheduledTask -TaskName "ActivityTracker" -Confirm:$false
#>

$taskName   = "ActivityTracker"
$scriptPath = Join-Path $PSScriptRoot "track.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Error "track.ps1 not found at: $scriptPath"
    exit 1
}

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Removing existing task..."
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Build the scheduled task
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit 0          # Run indefinitely

Register-ScheduledTask `
    -TaskName $taskName `
    -Action   $action `
    -Trigger  $trigger `
    -Settings $settings `
    -Description "Logs the active window every 30s for activity diary" | Out-Null

Write-Host "Scheduled task '$taskName' registered. Starting now..."
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Setup complete! The tracker is now running in the background."
Write-Host "It will restart automatically every time you log in."
Write-Host ""
Write-Host "Log file: $env:USERPROFILE\.activity_log\windows_events.jsonl"
Write-Host ""
Write-Host "To generate a diary:"
Write-Host "  python diary.py yesterday"
Write-Host "  python diary.py last-week"
