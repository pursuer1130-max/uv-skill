param(
    [ValidateSet("status", "open-photoshop", "open-printexp", "collect", "learn-printexp", "factory-dry-run", "connection-check")]
    [string]$Action = "status",
    [string]$PrintExpPath = "",
    [string]$PhotoshopPath = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Continue"

function Write-Section {
    param([string]$Title)
    Write-Output ""
    Write-Output "## $Title"
}

function Get-ProcessSummary {
    $names = "PrintExp", "PrintExp_X64", "Photoshop"
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object {
            $processName = $_.ProcessName
            $names | Where-Object { $processName -like "*$_*" }
        } |
        Select-Object ProcessName, Id, MainWindowTitle, Path
}

function Get-ExistingFile {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

function Get-PrintExpCandidate {
    param([string]$Preferred)
    if (-not $script:UvDiscovery) { $script:UvDiscovery = (& (Join-Path $PSScriptRoot 'uv_discover.ps1') | ConvertFrom-Json) }
    $candidates = @($Preferred, $script:UvDiscovery.registry.PrintExp.selected.path)
    return Get-ExistingFile -Candidates $candidates
}

function Get-PhotoshopCandidate {
    param([string]$Preferred)
    if (-not $script:UvDiscovery) { $script:UvDiscovery = (& (Join-Path $PSScriptRoot 'uv_discover.ps1') | ConvertFrom-Json) }
    $candidates = @($Preferred, $script:UvDiscovery.registry.Photoshop.selected.path)
    return Get-ExistingFile -Candidates $candidates
}

function Start-AppFile {
    param([string]$Path)
    throw 'SAFETY_GATEWAY_REQUIRED: use the confirmed PrintExp.launch adapter.'
    if (-not $Path) {
        Write-Error "Executable not found. Supply a path with -PrintExpPath or -PhotoshopPath."
        return
    }
    $dir = [System.IO.Path]::GetDirectoryName($Path)
    $proc = Start-Process -FilePath $Path -WorkingDirectory $dir -PassThru
    Start-Sleep -Seconds 2
    $proc.Refresh()
    [pscustomobject]@{
        Started = $true
        ProcessName = $proc.ProcessName
        Id = $proc.Id
        HasExited = $proc.HasExited
        ExitCode = if ($proc.HasExited) { $proc.ExitCode } else { $null }
        Path = $Path
        WorkingDirectory = $dir
    }
}

function Get-PrintExpLogs {
    param([string]$ExePath)
    if (-not $ExePath) { return @() }
    $dir = [System.IO.Path]::GetDirectoryName($ExePath)
    if (-not $dir -or -not (Test-Path -LiteralPath $dir -PathType Container)) { return @() }
    Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -eq ".log" -or
            $_.DirectoryName -match "\\(logfile|Log)(\\|$)" -or
            $_.Name -match "log|runlog"
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 30 FullName, LastWriteTime, Length
}

function Get-RecentAppEvents {
    Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = (Get-Date).AddDays(-2) } -ErrorAction SilentlyContinue |
        Where-Object { $_.ProviderName -match "Application Error|SideBySide|Windows Error Reporting|.NET Runtime" -or $_.Message -match "PrintExp|Photoshop" } |
        Select-Object -First 20 TimeCreated, ProviderName, Id, LevelDisplayName, Message
}

function Learn-PrintExpUi {
    $root = Split-Path -Parent (Get-PrintExpCandidate -Preferred $PrintExpPath)
    if (-not $root) { Write-Output 'PRINTEXP_UNAVAILABLE'; return }
    $lang = Join-Path $root "Lang\chs\PrintExpHS.ini"
    if (-not (Test-Path -LiteralPath $lang -PathType Leaf)) {
        Write-Error "PrintExpHS.ini not found under $root"
        return
    }
    $keywords = "Open PRN Files|Add Printing|Print Immediately|Start Printing|Task attribute|Task Property|Task Param|Print Param|Print Scheme|Material|Print mode|Pass Num|Task Dpi|Task Size|White Ink|White Ink Set|Varnish|Print preview|Print Verify|Open log directory|Cancel Print|Pause|Mirror Print|Bidirect Print|Left Print|Forward Print|Reverse Print"
    [IO.File]::ReadAllLines($lang, [Text.Encoding]::GetEncoding(936)) |
        Where-Object { $_ -match $keywords } |
        ForEach-Object {
            $parts = $_ -split "=", 2
            if ($parts.Count -eq 2) {
                [pscustomobject]@{
                    Key = $parts[0].Trim()
                    Label = $parts[1].Trim()
                }
            }
        } |
        Sort-Object Key -Unique |
        Format-Table -AutoSize |
        Out-String -Width 240
}

function Show-Status {
    $printExp = Get-PrintExpCandidate -Preferred $PrintExpPath
    $photoshop = Get-PhotoshopCandidate -Preferred $PhotoshopPath
    Write-Section "Processes"
    Get-ProcessSummary | Format-List | Out-String -Width 240
    Write-Section "Executable Candidates"
    [pscustomobject]@{
        PrintExp_X64 = $printExp
        Photoshop = $photoshop
    } | Format-List | Out-String -Width 240
    Write-Section "PrintExp Logs"
    Get-PrintExpLogs -ExePath $printExp | Format-Table -AutoSize | Out-String -Width 240
    Write-Section "Recent Application Events"
    Get-RecentAppEvents | Select-Object TimeCreated, ProviderName, Id, LevelDisplayName | Format-Table -AutoSize | Out-String -Width 240
}

function Collect-Diagnostics {
    if (-not $OutputDir) {
        $OutputDir = Join-Path (Get-Location) ("uv-diagnostics-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Show-Status | Out-File -FilePath (Join-Path $OutputDir "status.txt") -Encoding UTF8
    Get-RecentAppEvents | ConvertTo-Json -Depth 4 | Out-File -FilePath (Join-Path $OutputDir "application-events.json") -Encoding UTF8
    Write-Output "COLLECTED $OutputDir"
}

function New-FactoryDryRun {
    if (-not $OutputDir) {
        $OutputDir = Join-Path (Get-Location) ("uv-factory-dry-run-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
    }
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

    $artwork = Join-Path (Get-Location) "outputs\uv-circle-demo.tif"
    $preview = Join-Path (Get-Location) "outputs\uv-circle-demo.png"
    $psd = Join-Path (Get-Location) "outputs\uv-circle-demo.psd"
    $printExp = Get-PrintExpCandidate -Preferred $PrintExpPath

    Show-Status | Out-File -FilePath (Join-Path $OutputDir "01-software-status.txt") -Encoding UTF8
    Learn-PrintExpUi | Out-File -FilePath (Join-Path $OutputDir "02-printexp-function-map.txt") -Encoding UTF8
    & (Join-Path $PSScriptRoot 'printexp_probe.ps1') -PrintExpPath $printExp -OutputDir (Join-Path $OutputDir 'preflight') | Out-Null

    $handoff = @"
# UV Factory Dry Run Handoff

Purpose: simulate a real factory handoff from Photoshop artwork preparation to PrintExp pre-print inspection without starting real output.

## Artwork

- PSD source: $psd
- RIP input artwork (not yet a machine raster job): $artwork
- Preview: $preview
- Demo size: 100 mm x 100 mm
- Color mode: CMYK for PSD/TIFF, RGB duplicate for PNG preview

## PrintExp

- Executable: $printExp
- Expected import path: use PrintExp UI `文件`, `打开PRN文件`, or `添加打印`.
- Do not rely on command-line file arguments for this local version.

## Operator Steps

1. Confirm printer/controller is powered, emergency stop is released, and material is loaded only if this will become a real print.
2. Open PrintExp_X64.
3. RIP the TIFF using the matching machine, ink, channel order and material profile. Open the resulting supported task through the UI. Direct TIFF import requires a verified integrated RIP workflow; never rename TIFF to PRN.
4. Confirm task size, material, print scheme, pass count, resolution, direction, mirror setting, white ink, varnish, lamp power, and copy count.
5. Stop before `打印`, `开始打印`, or `立即打印` unless the operator confirms the real machine is safe.

## Risk Gate

Final print is blocked until a human confirms: controller connected, platform clear, head height safe, test material loaded, UV safety covers normal, ink/nozzle state acceptable, and the selected task is the intended test.
"@
    $handoff | Out-File -FilePath (Join-Path $OutputDir "03-factory-handoff.md") -Encoding UTF8
    Write-Output "FACTORY_DRY_RUN $OutputDir"
}

switch ($Action) {
    "status" { Show-Status }
    "open-photoshop" { & (Join-Path $PSScriptRoot 'photoshop_session.ps1') -Action open -PhotoshopPath (Get-PhotoshopCandidate -Preferred $PhotoshopPath) }
    "open-printexp" { throw 'SAFETY_GATEWAY_REQUIRED: create a PrintExp.launch plan with uv_master.cjs; launching may resume queued production. Use the confirmed GUI adapter.' }
    "collect" { Collect-Diagnostics }
    "learn-printexp" { Learn-PrintExpUi }
    "factory-dry-run" { New-FactoryDryRun }
    "connection-check" { & (Join-Path $PSScriptRoot 'printexp_probe.ps1') -PrintExpPath (Get-PrintExpCandidate -Preferred $PrintExpPath) -OutputDir $OutputDir -ProbeNetwork }
}
