param([Parameter(Mandatory=$true)][string]$OutputParent)
$ErrorActionPreference='Stop'
$source=[IO.Path]::GetFullPath($PSScriptRoot)
$parent=[IO.Path]::GetFullPath($OutputParent)
if(-not(Test-Path -LiteralPath $parent -PathType Container)){throw 'ISOLATED_OUTPUT_PARENT_MISSING'}
if($parent.StartsWith($source,[StringComparison]::OrdinalIgnoreCase)){throw 'DO_NOT_RUN_IN_USB_SOURCE'}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $source 'runtime-manifest.json') -Encoding UTF8|ConvertFrom-Json
$destination=Join-Path $parent ('uv-desktop-'+[Guid]::NewGuid().ToString('N'))
New-Item -Path $destination -ItemType Directory|Out-Null
foreach($entry in $manifest.files){
 if($entry.name -notin @('MenuCompat.cs','UVMenuCompat.exe','prepare-command.cjs','Build-DesktopCompat.ps1')){throw 'RUNTIME_MANIFEST_ENTRY_REJECTED'}
 $from=Join-Path $source $entry.name
 if((Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash -ne $entry.sha256){throw 'SOURCE_HASH_MISMATCH'}
 $to=Join-Path $destination $entry.name
 Copy-Item -LiteralPath $from -Destination $to
 if((Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash -ne $entry.sha256){throw 'STAGED_HASH_MISMATCH'}
}
# Historical height records stay in the maintenance source as archives.
# They are never copied into a runtime or interpreted as motion locks.
[pscustomobject]@{historicalHeightLockRetired=$true;runtimeDirectory=$destination;filesVerified=@($manifest.files).Count;appLaunched=$false;defaultAction='read-only';targetConfigured=$false}|ConvertTo-Json
