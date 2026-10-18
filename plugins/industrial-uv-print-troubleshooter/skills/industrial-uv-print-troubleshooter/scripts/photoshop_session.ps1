param(
    [ValidateSet('status', 'open', 'run')][string]$Action = 'open',
    [string]$PhotoshopPath = '',
    [string]$BatchScript = '',
    [ValidateRange(5, 120)][int]$TimeoutSeconds = 40
)
$ErrorActionPreference = 'Stop'

if ($Action -eq 'run') {
    $BatchScript = (Resolve-Path -LiteralPath $BatchScript).Path
    if ([IO.Path]::GetExtension($BatchScript) -ne '.jsx') { throw 'Expected a reviewed JSX file.' }
}
if ($PSVersionTable.PSEdition -eq 'Core') {
    $forward = @('-NoProfile', '-File', $PSCommandPath, '-Action', $Action, '-TimeoutSeconds', $TimeoutSeconds)
    if ($PhotoshopPath) { $forward += @('-PhotoshopPath', $PhotoshopPath) }
    if ($BatchScript) { $forward += @('-BatchScript', $BatchScript) }
    & "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" @forward
    exit $LASTEXITCODE
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($identity -match '(?i)\\CodexSandbox') {
    throw 'PS_USER_CONTEXT_REQUIRED: run this exact command through the approved require_escalated tool route as the interactive Windows user. Do not change Adobe ACLs or retry COM activation in the sandbox.'
}

function Get-ReadyPhotoshop {
    try {
        $application = [Runtime.InteropServices.Marshal]::GetActiveObject('Photoshop.Application')
        $null = $application.Version
        return $application
    } catch { return $null }
}

$application = Get-ReadyPhotoshop
if (-not $application -and $Action -ne 'status') {
    if (-not (Get-Process -Name Photoshop -ErrorAction SilentlyContinue)) {
        if (-not $PhotoshopPath) {
            $discovery = (& (Join-Path $PSScriptRoot 'uv_discover.ps1') | ConvertFrom-Json)
            $PhotoshopPath = $discovery.registry.Photoshop.selected.path
        }
        if (-not $PhotoshopPath -or -not (Test-Path -LiteralPath $PhotoshopPath -PathType Leaf)) { throw 'PS_NOT_INSTALLED: supply -PhotoshopPath.' }
        throw ('PS_DESKTOP_LAUNCH_REQUIRED: use the computer-use sky.launch_app API with {0}, then rerun this command as the interactive user. Background Start-Process did not produce a usable desktop session on this machine.' -f $PhotoshopPath)
    }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while (-not $application -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $application = Get-ReadyPhotoshop
    }
}
if (-not $application) {
    throw 'PS_NOT_READY: no COM connection. Inspect the actual desktop window through computer-use; a process alone is not success. Preserve existing documents and do not force-stop unknown sessions.'
}
if ($Action -ne 'status') { $null = $application.DoJavaScript('app.bringToFront();') }
$windows = @(Get-Process -Name Photoshop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if (-not $windows.Count) { throw 'PS_WINDOW_NOT_VISIBLE: COM is ready but no main window was found; inspect the desktop before proceeding.' }
Write-Output ('PS_READY version={0} documents={1} user={2} window={3}' -f $application.Version, $application.Documents.Count, $identity, $windows[0].MainWindowHandle)
if ($Action -eq 'run') {
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $result = $application.DoJavaScriptFile($BatchScript)
    $timer.Stop()
    Write-Output ('PS_SCRIPT_OK elapsed_ms={0} result={1}' -f $timer.ElapsedMilliseconds, $result)
}
