param(
    [string]$PrintExpPath = '',
    [string]$OutputDir = '',
    [switch]$ProbeNetwork
)
$ErrorActionPreference = 'Stop'
if (-not $OutputDir) { $OutputDir = Join-Path (Get-Location) 'outputs\printexp-preflight' }
$null = New-Item -ItemType Directory -Path $OutputDir -Force
if (-not $PrintExpPath) { $discovery=(& (Join-Path $PSScriptRoot 'uv_discover.ps1') | ConvertFrom-Json); $PrintExpPath=$discovery.registry.PrintExp.selected.path }
if (-not $PrintExpPath -or -not (Test-Path -LiteralPath $PrintExpPath -PathType Leaf)) { Write-Output '{"PrintExp":"unavailable_or_selection_required"}'; return }
$root = Split-Path -Parent (Resolve-Path -LiteralPath $PrintExpPath).Path
$encoding = [Text.Encoding]::GetEncoding(936)

function Read-IniEntries([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $section = ''; $number = 0
    foreach ($line in [IO.File]::ReadAllLines($Path, $encoding)) {
        $number++
        $trimmed = $line.Trim()
        if ($trimmed -match '^\[(.+)\]$') { $section = $Matches[1]; continue }
        if ($trimmed -match '^(;|#|//|$)') { continue }
        $separator = $line.IndexOf('=')
        if ($separator -lt 1) { continue }
        [pscustomobject]@{ Section=$section; Key=$line.Substring(0,$separator).Trim(); Value=$line.Substring($separator+1).Trim(); Line=$number }
    }
}

# Read integrity only; no input injection or permission changes.
if (-not ('UvProcessToken' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class UvProcessToken {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr p, uint flags, StringBuilder path, ref int size);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr p, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int cls,IntPtr data,int size,out int needed);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
  public static string ImagePath(int pid) {
    IntPtr p=OpenProcess(0x1000,false,pid);
    if(p==IntPtr.Zero) throw new Win32Exception();
    try {int n=32768;var text=new StringBuilder(n);if(!QueryFullProcessImageName(p,0,text,ref n))throw new Win32Exception();return text.ToString();}
    finally {CloseHandle(p);}
  }
  public static int Integrity(int pid) {
    IntPtr p=OpenProcess(0x1000,false,pid), t=IntPtr.Zero, b=IntPtr.Zero;
    if(p==IntPtr.Zero) throw new Win32Exception();
    try {
      if(!OpenProcessToken(p,8,out t)) throw new Win32Exception();
      int n; GetTokenInformation(t,25,IntPtr.Zero,0,out n);
      b=Marshal.AllocHGlobal(n);
      if(!GetTokenInformation(t,25,b,n,out n)) throw new Win32Exception();
      IntPtr sid=Marshal.ReadIntPtr(b);
      byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
      return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));
    } finally { if(b!=IntPtr.Zero) Marshal.FreeHGlobal(b); if(t!=IntPtr.Zero) CloseHandle(t); CloseHandle(p); }
  }
}
'@
}
$selfIntegrity = [UvProcessToken]::Integrity($PID)
$processes = @(Get-Process -Name PrintExp_X64 -ErrorAction SilentlyContinue | ForEach-Object {
    $integrity = $null; $errorText = $null
    try { $integrity = [UvProcessToken]::Integrity($_.Id) } catch { $errorText = $_.Exception.Message }
    [pscustomobject]@{ Id=$_.Id; Title=$_.MainWindowTitle; Responding=$_.Responding; Integrity=$integrity; QueryError=$errorText; HigherThanProbe=($null -ne $integrity -and $integrity -gt $selfIntegrity) }
})
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 9100 -ErrorAction SilentlyContinue | ForEach-Object {
    $listener=$_; $owner=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
    $imagePath=$null; $queryError=$null
    try {$imagePath=[UvProcessToken]::ImagePath([int]$listener.OwningProcess)} catch {$queryError=$_.Exception.Message}
    [pscustomobject]@{LocalAddress=$listener.LocalAddress;Port=$listener.LocalPort;OwnerPid=$listener.OwningProcess;OwnerName=$owner.Name;OwnerPath=$imagePath;ParentPid=$owner.ParentProcessId;ParentIsObservedPrintExp=($null -ne $owner -and $owner.ParentProcessId -in $processes.Id);QueryError=$queryError;PayloadAcceptanceVerified=$false}
})
$modules = @('Device.dll','DeviceManager.dll','DevDriver.dll','ExpBoard.dll','HSLControllerDll.dll','hs_usb3.dll','platforms\qwindows.dll','RIP_SDK2\RIP.dll','RIP_SDK2\HSCRipProc.dll','RIP_SDK2\HSModuleAuthorize.hsmaf') | ForEach-Object {
    [pscustomobject]@{RelativePath=$_; Present=(Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf)}
}
$config = @(Read-IniEntries (Join-Path $root 'Project.ini'))
$comm = @($config | Where-Object Section -eq 'COMM_CONFIG')
$server = ($comm | Where-Object Key -eq 'ServerIP' | Select-Object -Last 1).Value
$port = ($comm | Where-Object Key -eq 'ServerPort' | Select-Object -Last 1).Value
$commType = ($comm | Where-Object Key -eq 'DEFAULT_COMM_TYPE' | Select-Object -Last 1).Value
$network = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | ForEach-Object {
    $nic = $_
    foreach ($addr in $nic.GetIPProperties().UnicastAddresses) {
        if ($addr.Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
            [pscustomobject]@{Adapter=$nic.Name; Status=[string]$nic.OperationalStatus; IPv4=[string]$addr.Address; Mask=[string]$addr.IPv4Mask; SpeedMbps=($nic.Speed/1000000)}
        }
    }
})
$tcp = [ordered]@{ Attempted=$false; Server=$server; Port=$port; Reachable=$null; Error=$null }
if ($ProbeNetwork -and $commType -eq '1' -and $server -and $port) {
    $tcp.Attempted=$true
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending=$client.ConnectAsync($server,[int]$port)
        if (-not $pending.Wait(2000)) { throw 'TCP connect timed out (2 s)' }
        $tcp.Reachable=$client.Connected
    } catch { $tcp.Reachable=$false; $tcp.Error=$_.Exception.Message }
    finally { $client.Dispose() }
}
$logRoot=Join-Path $root 'Log\main'
$latest=Get-ChildItem -LiteralPath $logRoot -Filter 'Log*.txt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$log=[ordered]@{Path=$null; AgeSeconds=$null; TailDisconnected=$false; Evidence='unknown'}
if ($latest) {
    $log.Path=$latest.FullName
    $log.AgeSeconds=[math]::Round(((Get-Date)-$latest.LastWriteTime).TotalSeconds)
    $tail=@(Get-Content -LiteralPath $latest.FullName -Tail 150 -Encoding Default)
    $log.TailDisconnected=(@($tail | Where-Object {$_ -match 'm_bIsConnect!=TRUE'}).Count -gt 0)
    $log.Evidence=if($log.TailDisconnected -and $log.AgeSeconds -lt 120){'recent_disconnect_messages'}elseif($log.TailDisconnected){'historical_disconnect_messages'}else{'no_disconnect_in_tail_not_proof_of_connection'}
}
$labels=@(Read-IniEntries (Join-Path $root 'Lang\chs\PrintExpHS.ini') | ForEach-Object {
    [pscustomobject]@{ Section=$_.Section; Key=$_.Key; Label=$_.Value; Line=$_.Line; Evidence='resource_only_not_execution_verified' }
})
$labels | Export-Csv -LiteralPath (Join-Path $OutputDir 'function-index.csv') -NoTypeInformation -Encoding UTF8
$report=[ordered]@{
    CollectedAt=(Get-Date).ToString('o'); Executable=$PrintExpPath
    ProductVersion=(Get-Item -LiteralPath $PrintExpPath).VersionInfo.ProductVersion
    ExecutableSHA256=(Get-FileHash -LiteralPath $PrintExpPath -Algorithm SHA256).Hash
    ProbeIntegrity=$selfIntegrity; Processes=$processes; Modules=@($modules); Listeners9100=$listeners
    CommunicationDefaults=$comm; NetworkInterfaces=$network; TcpProbe=$tcp; Log=$log
    FunctionEntries=$labels.Count
    Limits=@('Component presence does not prove module licensing, driver binding or machine compatibility.','A TCP handshake sends no print data and does not prove Hoson protocol connection.','Probe process integrity is a comparison clue; verify the actual UI automation process separately.','No print, motion, firmware or configuration write is performed.')
}
$report | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $OutputDir 'connection-report.json') -Encoding UTF8
[pscustomobject]@{OutputDir=$OutputDir; ProductVersion=$report.ProductVersion; FunctionEntries=$labels.Count; TcpReachable=$tcp.Reachable; LogEvidence=$log.Evidence; HigherIntegrityProcesses=@($processes|Where-Object HigherThanProbe).Count} | ConvertTo-Json
