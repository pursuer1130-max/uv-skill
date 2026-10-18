param([Parameter(Mandatory=$true)][string]$ExePath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$expected=[IO.Path]::GetFullPath($ExePath)
$namedProcesses=@(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($expected)) -ErrorAction SilentlyContinue)
$candidateProcesses=@($namedProcesses | Where-Object { $_.Path -eq $expected -and $_.MainWindowHandle -ne [IntPtr]::Zero })
if($candidateProcesses.Count -ne 1){
  $reason=if($namedProcesses.Count -eq 0){'PROCESS_NOT_FOUND'}elseif(@($namedProcesses | Where-Object { -not $_.Path }).Count -gt 0){'PROCESS_IDENTITY_OR_DESKTOP_UNREADABLE'}else{'TARGET_WINDOW_NOT_UNIQUE_OR_UNAVAILABLE'}
  [pscustomobject]@{observedAt=[DateTime]::UtcNow.ToString('o');status='blocked';reason=$reason;processNameCount=$namedProcesses.Count;verifiedWindowCount=$candidateProcesses.Count;inputSent=$false;productionReady=$false;note='Cannot infer missing permission, elevation or session isolation from this observation alone.'}|ConvertTo-Json
  return
}
$targetProcess=$candidateProcesses[0]
$root=[System.Windows.Automation.AutomationElement]::FromHandle($targetProcess.MainWindowHandle)
$elements=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
$allowed=@('开始扫描','打印','导入','导入扫描图','设备就绪','扫描高度:','打印数量:','已识别:','扫描类型:','打印设置','扫描区域:')
$rows=@(foreach($element in $elements){
  $current=$element.Current
  if($allowed -ccontains $current.Name){
    $r=$current.BoundingRectangle
    $patterns=@($element.GetSupportedPatterns() | ForEach-Object {$_.ProgrammaticName})
    $value=$null
    if($patterns -contains 'ValuePatternIdentifiers.Pattern'){
      $candidate=$element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
      if($candidate -match '^[-+\d.,\s]*$'){$value=$candidate}else{$value='REDACTED_NONNUMERIC'}
    }
    [pscustomobject]@{name=$current.Name;automationId=$current.AutomationId;controlType=$current.ControlType.ProgrammaticName;enabled=$current.IsEnabled;offscreen=$current.IsOffscreen;focusable=$current.IsKeyboardFocusable;patterns=$patterns;numericValue=$value;bounds=[pscustomobject]@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}}
  }
})
$rect=$root.Current.BoundingRectangle
[pscustomobject]@{observedAt=[DateTime]::UtcNow.ToString('o');status='observed';method='Windows UI Automation read-only; user-requested fallback';exeVersion=(Get-Item -LiteralPath $expected).VersionInfo.FileVersion;windowBounds=[pscustomobject]@{x=$rect.X;y=$rect.Y;width=$rect.Width;height=$rect.Height};controls=$rows;inputSent=$false;productionReady=$false}|ConvertTo-Json -Depth 9
