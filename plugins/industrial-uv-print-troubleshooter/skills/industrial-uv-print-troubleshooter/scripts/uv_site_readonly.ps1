param([ValidateSet('LoadCheck','Inventory')][string]$Action='LoadCheck')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$skill=Split-Path -Parent $PSScriptRoot
$plugin=Split-Path -Parent (Split-Path -Parent $skill)
function CleanPath([string]$value) {
    if(-not $value){return $null}
    return ($value -replace '(?i)([A-Z]:\\Users\\)[^\\]+','$1<USER>')
}
if($Action -eq 'LoadCheck') {
    $indexPath=Join-Path $plugin 'maintenance\site-20260916\integrity.json'
    if(-not (Test-Path -LiteralPath $indexPath)){throw 'INTEGRITY_INDEX_MISSING'}
    $index=Get-Content -Raw -LiteralPath $indexPath -Encoding UTF8|ConvertFrom-Json
    $rootFull=[IO.Path]::GetFullPath($plugin)+'\'
    foreach($entry in $index.files){
        $target=[IO.Path]::GetFullPath((Join-Path $plugin $entry.path))
        if(-not $target.StartsWith($rootFull,[StringComparison]::OrdinalIgnoreCase)){throw 'INDEX_PATH_ESCAPE'}
        if(-not (Test-Path -LiteralPath $target -PathType Leaf)){throw 'FILE_MISSING'}
        if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256){throw 'HASH_MISMATCH'}
    }
    $manifest=Get-Content -Raw -LiteralPath (Join-Path $plugin '.codex-plugin\plugin.json') -Encoding UTF8|ConvertFrom-Json
    $text=Get-Content -Raw -LiteralPath (Join-Path $skill 'SKILL.md') -Encoding UTF8
    if($text -notmatch '(?s)^---\s*\r?\n.*?name: industrial-uv-print-troubleshooter.*?\r?\n---'){throw 'SKILL_FRONTMATTER_INVALID'}
    [pscustomobject]@{action='LoadCheck';status='passed';filesChecked=@($index.files).Count;version=$manifest.version;source='package';sourceRoot=$plugin;productionReady=$false;appControlPerformed=$false;note='File integrity and instruction readback only; no device connection or Codex session launched.'}|ConvertTo-Json -Depth 4
    return
}
# Reuse the audited original read-only discovery. Capture raw identifiers only in memory.
$raw=& (Join-Path $PSScriptRoot 'uv_discover.ps1')
$discovery=($raw -join [Environment]::NewLine)|ConvertFrom-Json
$apps=@(foreach($name in @('Photoshop','PrintExp','RIIN','IKapCViewer')) {
    $app=$discovery.registry.$name
    $candidates=@(foreach($candidate in $app.candidates){
        $binary=Get-Item -LiteralPath $candidate.path
        $interfaces=@(Get-ChildItem -LiteralPath $binary.DirectoryName -File -ErrorAction SilentlyContinue|Where-Object {$_.Name -match '^(IKap.*\.(dll|h)|RIP\.dll|NWReceive\.exe|.*(SDK|API).*\.(dll|h|pdf|chm))$'}|ForEach-Object {$_.Name})
        [pscustomobject]@{path=(CleanPath $candidate.path);productVersion=$candidate.version;fileVersion=$candidate.fileVersion;runningObserved=$candidate.running;interfaceCandidates=$interfaces;interfaceSemantics='unverified; file presence only'}
    })
    [pscustomobject]@{name=$name;detection=$app.status;runningState=$app.runningState;requiresSelection=$app.requiresSelection;candidates=$candidates;runtimeVersionVerified=$false;integrationVerified=$false;adapterPresent=(Test-Path -LiteralPath (Join-Path $skill ('adapters\'+(@{Photoshop='photoshop';PrintExp='printexp';RIIN='riin';IKapCViewer='ikap'}[$name])+'\index.cjs')))}
})
$com=@(Get-ChildItem -LiteralPath 'Registry::HKEY_CLASSES_ROOT' -ErrorAction SilentlyContinue|Where-Object {$_.PSChildName -match '^Photoshop\.Application(\.\d+)?$'}|ForEach-Object {$_.PSChildName})
$warnings=@($discovery.warnings|ForEach-Object {($_ -split ':')[0]}|Select-Object -Unique)
[pscustomobject]@{schemaVersion=1;observedAt=[DateTime]::UtcNow.ToString('o');scope='current host read-only inventory; rediscover after any host/device change';apps=$apps;photoshopCOMRegistration=$com;warnings=$warnings;boardState='unknown';cameraState='unknown';productionQueueState='unknown';networkProbePerformed=$false;appLaunchPerformed=$false;productionReady=$false;recordsRedacted=$true}|ConvertTo-Json -Depth 12
