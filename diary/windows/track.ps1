<#
.SYNOPSIS
    Background active-window tracker. Samples the focused window every 30 seconds
    and appends a JSON line to %USERPROFILE%\.activity_log\windows_events.jsonl

.NOTES
    Started automatically by setup.ps1 via a Scheduled Task at logon.
    To start manually: powershell -WindowStyle Hidden -File track.ps1
#>

# Load Win32 API for reading the foreground window
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinTracker {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@

$logDir  = "$env:USERPROFILE\.activity_log"
$logFile = "$logDir\windows_events.jsonl"

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

Write-Host "Activity tracker started. Logging to: $logFile"
Write-Host "Press Ctrl+C to stop."

while ($true) {
    try {
        $hwnd = [WinTracker]::GetForegroundWindow()

        # Get window title
        $sb = New-Object System.Text.StringBuilder 512
        [WinTracker]::GetWindowText($hwnd, $sb, 512) | Out-Null
        $windowTitle = $sb.ToString().Trim()

        # Get process name from PID
        $pid = [uint32]0
        [WinTracker]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
        $processName = ""
        if ($pid -gt 0) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) { $processName = $proc.ProcessName }
        }

        # Only log if there's something meaningful
        if ($processName -and $processName -notmatch "^(Idle|System|dwm|csrss|winlogon)$") {
            $event = [ordered]@{
                timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
                type      = "active_window"
                process   = $processName
                window    = $windowTitle
            }
            $json = $event | ConvertTo-Json -Compress
            Add-Content -Path $logFile -Value $json -Encoding UTF8
        }
    }
    catch {
        # Silently ignore transient errors (e.g. process exited between calls)
    }

    Start-Sleep -Seconds 30
}
