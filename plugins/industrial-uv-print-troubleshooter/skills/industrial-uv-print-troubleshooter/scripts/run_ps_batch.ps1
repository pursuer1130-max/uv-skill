param([Parameter(Mandatory=$true)][string]$BatchScript)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $BatchScript).Path
if ([IO.Path]::GetExtension($resolved) -ne '.jsx') { throw 'Expected a reviewed JSX launcher' }
if ($PSVersionTable.PSEdition -eq 'Core') {
    & "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File $PSCommandPath -BatchScript $resolved
    exit $LASTEXITCODE
}
& (Join-Path $PSScriptRoot 'photoshop_session.ps1') -Action run -BatchScript $resolved
