param([Parameter(Mandatory=$true)][string]$RegistryFile)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class UVManifestReader {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr FindResource(IntPtr module,IntPtr name,IntPtr type);
  [DllImport("kernel32.dll")] static extern IntPtr LoadResource(IntPtr module,IntPtr resource);
  [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr resource);
  [DllImport("kernel32.dll")] static extern uint SizeofResource(IntPtr module,IntPtr resource);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
  public static string Read(string path) {
    // DATAFILE + IMAGE_RESOURCE maps resources without running executable code.
    IntPtr module=LoadLibraryEx(path,IntPtr.Zero,0x22);
    if(module==IntPtr.Zero)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try {
      IntPtr resource=FindResource(module,(IntPtr)1,(IntPtr)24);
      if(resource==IntPtr.Zero)return null;
      uint count=SizeofResource(module,resource);
      if(count==0||count>1048576)throw new Exception("MANIFEST_SIZE_INVALID");
      var bytes=new byte[(int)count];
      Marshal.Copy(LockResource(LoadResource(module,resource)),bytes,0,(int)count);
      var encoding=bytes.Length>1&&bytes[0]==0xff&&bytes[1]==0xfe?Encoding.Unicode:Encoding.UTF8;
      return encoding.GetString(bytes).Trim('\0','\ufeff');
    } finally {FreeLibrary(module);}
  }
}
'@
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$elevated=([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$registry=Get-Content -LiteralPath $RegistryFile -Raw -Encoding UTF8 | ConvertFrom-Json
$apps=[ordered]@{}
foreach($name in @('Photoshop','PrintExp','RIIN','IKapCViewer')) {
    $app=$registry.registry.$name
    $item=[ordered]@{path=$app.selected.path;requestedExecutionLevel=$null;status='unavailable_or_selection_required';guiControl='not_verified'}
    if($app.selected.path) {
        try {
            $manifest=[UVManifestReader]::Read($app.selected.path)
            if($manifest){$xml=[xml]$manifest;$node=$xml.SelectSingleNode("//*[local-name()='requestedExecutionLevel']");if($node){$item.requestedExecutionLevel=$node.GetAttribute('level')}}
            $item.status=if($app.runningState -eq 'unknown'){'running_path_unreadable_do_not_relaunch'}elseif($app.selected.running){'running_observe_returned_window'}elseif($item.requestedExecutionLevel -in @('requireAdministrator','highestAvailable') -and -not $elevated){'manual_elevation_may_be_required'}else{'not_running'}
            $stream=[IO.File]::OpenRead($app.selected.path);$sha=[Security.Cryptography.SHA256]::Create()
            try{$item['sha256']=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
        } catch {$item.status='probe_error';$item['error']=$_.Exception.Message}
    }
    $apps[$name]=$item
}
[ordered]@{timestamp=[DateTime]::UtcNow.ToString('o');probeSessionElevated=$elevated;apps=$apps;launchPerformed=$false;securitySettingsChanged=$false;note='Probe token is not proof of desktop-provider privilege. Operator handles UAC; verify actual returned GUI window separately.'}|ConvertTo-Json -Depth 6
