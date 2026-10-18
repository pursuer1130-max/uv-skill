param([string[]]$SearchRoots=@(), [string]$OutputFile='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$warnings=New-Object System.Collections.Generic.List[string]
$found=New-Object System.Collections.Generic.List[object]
$unresolved=New-Object System.Collections.Generic.List[object]
$patterns=@{Photoshop='^Photoshop\.exe$';PrintExp='^PrintExp(_X64)?\.exe$';RIIN='^RIIN.*\.exe$';IKapCViewer='^IKapCViewer\.exe$'}
$processes=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.ProcessName -match 'Photoshop|PrintExp|RIIN|IKapCViewer'})
function Add-Candidate([string]$Path,[string]$Source) {
    if (-not $Path) {return}
    $Path=[Environment]::ExpandEnvironmentVariables($Path.Trim('"'))
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {return}
    $name=[IO.Path]::GetFileName($Path)
    foreach($key in $patterns.Keys) {
        if($name -notmatch $patterns[$key]) {continue}
        $item=Get-Item -LiteralPath $Path
        if(@($found | Where-Object {$_.name -eq $key -and $_.path -eq $item.FullName}).Count) {return}
        $running=@($processes | Where-Object {try {$_.Path -eq $item.FullName} catch {$false}})
        $found.Add([pscustomobject]@{name=$key;path=$item.FullName;version=$item.VersionInfo.ProductVersion;fileVersion=$item.VersionInfo.FileVersion;source=$Source;running=($running.Count -gt 0);pids=@($running | ForEach-Object {$_.Id});workingDirectory=$item.DirectoryName})
    }
}
function Scan-Directory([string]$Dir,[int]$Depth,[string]$Source) {
    if(-not $Dir -or -not (Test-Path -LiteralPath $Dir -PathType Container)) {return}
    $queue=New-Object System.Collections.Queue
    $queue.Enqueue(@($Dir,0)); $count=0
    while($queue.Count -and $count -lt 4000) {
        $entry=$queue.Dequeue(); $count++
        foreach($item in @(Get-ChildItem -LiteralPath $entry[0] -ErrorAction SilentlyContinue)) {
            if($item.PSIsContainer) {
                if($entry[1] -lt $Depth -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {$queue.Enqueue(@($item.FullName,($entry[1]+1)))}
            } elseif($item.Extension -eq '.exe') {Add-Candidate $item.FullName $Source}
        }
    }
    if($queue.Count) {$warnings.Add('SEARCH_BOUNDED: '+$Dir)}
}
foreach($p in $processes) {
    $processPath=$null
    try {$processPath=$p.Path} catch {}
    if($processPath){Add-Candidate $processPath 'running-process'} else {
        foreach($name in $patterns.Keys){
            if(($p.ProcessName+'.exe') -match $patterns[$name]){$unresolved.Add([pscustomobject]@{software=$name;pid=$p.Id;processName=$p.ProcessName;reason='path_unreadable'})}
        }
        $warnings.Add('PROCESS_PATH_UNREADABLE: '+$p.Id)
    }
}
$regRoots=@('HKCU:\Software\Microsoft\Windows\CurrentVersion','HKLM:\Software\Microsoft\Windows\CurrentVersion','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion')
foreach($reg in $regRoots) {
    foreach($appKey in @(Get-ChildItem -LiteralPath ($reg+'\App Paths') -ErrorAction SilentlyContinue)) {
        if($appKey.PSChildName -match 'Photoshop|PrintExp|RIIN|IKap') {Add-Candidate $appKey.GetValue('') 'registry-app-paths'}
    }
    foreach($appKey in @(Get-ChildItem -LiteralPath ($reg+'\Uninstall') -ErrorAction SilentlyContinue)) {
        $app=Get-ItemProperty -LiteralPath $appKey.PSPath -ErrorAction SilentlyContinue
        if($app.DisplayName -match 'Photoshop|PrintExp|RIIN|IKap|I-TEK') {
            if($app.DisplayIcon) {Add-Candidate (($app.DisplayIcon -replace ',\s*-?\d+$','').Trim('"')) 'registry-icon'}
            Scan-Directory $app.InstallLocation 3 'registry-install-location'
        }
    }
}
$shell=New-Object -ComObject WScript.Shell
try {
    $shortcutRoots=@([Environment]::GetFolderPath('StartMenu'),[Environment]::GetFolderPath('CommonStartMenu'),[Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'))
    foreach($root in $shortcutRoots | Select-Object -Unique) {
        foreach($link in @(Get-ChildItem -LiteralPath $root -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue)) {
            try {Add-Candidate ($shell.CreateShortcut($link.FullName).TargetPath) ('shortcut: '+$link.FullName)} catch {$warnings.Add('SHORTCUT_UNREADABLE: '+$link.Name)}
        }
    }
} finally {[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
foreach($root in @($env:ProgramFiles,${env:ProgramFiles(x86)}) | Select-Object -Unique) {Scan-Directory $root 4 'program-files'}
foreach($drive in Get-PSDrive -PSProvider FileSystem) {
    foreach($dir in @(Get-ChildItem -LiteralPath $drive.Root -Directory -ErrorAction SilentlyContinue | Where-Object {$_.Name -match 'Adobe|PrintExp|RIIN|IKap|I-TEK'})) {Scan-Directory $dir.FullName 3 'drive-software-directory'}
}
foreach($root in $SearchRoots) {Scan-Directory $root 6 'explicit-search-root'}
$registry=[ordered]@{}
foreach($name in @('Photoshop','PrintExp','RIIN','IKapCViewer')) {
    $candidates=@($found | Where-Object name -eq $name | Sort-Object @{Expression='running';Descending=$true},path)
    $active=@($candidates | Where-Object running)
    $selected=if($active.Count -eq 1) {$active[0]} elseif($candidates.Count -eq 1) {$candidates[0]} else {$null}
    $registry[$name]=[ordered]@{status=if($candidates.Count){'available'}else{'unavailable'};selected=$selected;candidates=$candidates;requiresSelection=($candidates.Count -gt 1 -and -not $selected);runtimeVersionVerified=$false;runningState=if(@($unresolved|Where-Object software -eq $name).Count){'unknown'}elseif($active.Count){'running'}else{'stopped'}}
}
$listeners=@(); $connections=@()
try {
    $tcp=@(Get-NetTCPConnection -ErrorAction Stop)
    $listeners=@($tcp | Where-Object {$_.State -eq 'Listen' -and $_.LocalPort -eq 9100} | Select-Object LocalAddress,LocalPort,OwningProcess)
    $ids=@($processes | Where-Object ProcessName -match 'PrintExp' | ForEach-Object {$_.Id})
    $connections=@($tcp | Where-Object {$_.OwningProcess -in $ids -and $_.State -eq 'Established'} | Select-Object RemoteAddress,RemotePort,OwningProcess)
} catch {$warnings.Add('TCP_TABLE_UNAVAILABLE')}
$registry['PrinterBoard']=@{status='unknown';evidence='No verified application/device state; TCP presence alone is insufficient';connections=$connections}
$registry['IKapCViewer']['devices']=@()
try {$registry['IKapCViewer']['devices']=@(Get-CimInstance Win32_PnPEntity -ErrorAction Stop | Where-Object {$_.Name -match 'IKap|I-TEK|OptoElectronics'} | Select-Object Name,Status,ConfigManagerErrorCode)} catch {$warnings.Add('PNP_UNAVAILABLE')}
$report=[ordered]@{schemaVersion=1;computer=$env:COMPUTERNAME;timestamp=[DateTime]::UtcNow.ToString('o');mode='OBSERVE_MODE';registry=$registry;unresolvedProcesses=$unresolved.ToArray();listeners=$listeners;warnings=@($warnings);networkProbePerformed=$false}
$json=$report | ConvertTo-Json -Depth 10
if($OutputFile) {$json | Out-File -LiteralPath $OutputFile -Encoding utf8} else {$json}
