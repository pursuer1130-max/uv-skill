param([string]$OutputDirectory=$PSScriptRoot)
$ErrorActionPreference='Stop'
$framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler=Join-Path $framework 'csc.exe'
if(-not(Test-Path -LiteralPath $compiler)){throw 'FRAMEWORK_X64_COMPILER_MISSING'}
$output=[IO.Path]::GetFullPath($OutputDirectory)
if(-not(Test-Path -LiteralPath $output -PathType Container)){throw 'OUTPUT_DIRECTORY_MISSING'}
$argsList=@('/nologo','/target:winexe','/platform:x64',('/out:'+(Join-Path $output 'UVMenuCompat.exe')),'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',('/reference:'+(Join-Path $framework 'WPF\UIAutomationClient.dll')),('/reference:'+(Join-Path $framework 'WPF\UIAutomationTypes.dll')),('/reference:'+(Join-Path $framework 'WPF\WindowsBase.dll')),(Join-Path $PSScriptRoot 'MenuCompat.cs'))
& $compiler @argsList
if($LASTEXITCODE -ne 0){throw 'BUILD_FAILED'}
Get-FileHash -LiteralPath (Join-Path $output 'UVMenuCompat.exe') -Algorithm SHA256
