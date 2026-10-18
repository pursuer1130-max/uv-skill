using System;
using System.IO;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Windows.Automation;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Security.Cryptography;

// Bounded navigation, file import, explicitly authorized positioning and print. No calibration execution,
// process creation, network, registry, driver, or device commands are implemented.
public sealed class MenuCompat : Form {
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc callback,IntPtr extra);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder text,int max);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetComboBoxInfo(IntPtr h,ref COMBOBOXINFO info);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h,ref POINT point);
 [DllImport("user32.dll",EntryPoint="SendMessageW")] static extern IntPtr ReadListRect(IntPtr h,uint message,IntPtr index,ref RECT rectangle);
 [DllImport("user32.dll",EntryPoint="SendMessageW")] static extern IntPtr ReadControlNumber(IntPtr h,uint message,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n,INPUT[] inputs,int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int id);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h,int flags,StringBuilder text,ref int length);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [StructLayout(LayoutKind.Sequential)]struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)]struct POINT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)]struct COMBOBOXINFO{public int cbSize;public RECT rcItem,rcButton;public uint stateButton;public IntPtr hwndCombo,hwndItem,hwndList;}
 [StructLayout(LayoutKind.Sequential)]struct MOUSEINPUT{public int dx,dy;public uint mouseData,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit)]struct INPUTUNION{[FieldOffset(0)]public MOUSEINPUT mouse;}
 [StructLayout(LayoutKind.Sequential)]struct INPUT{public uint type;public INPUTUNION union;}
 delegate bool EnumWindowsProc(IntPtr h,IntPtr extra);
 readonly string folder=AppDomain.CurrentDomain.BaseDirectory;
 readonly JavaScriptSerializer json=new JavaScriptSerializer();
 readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 readonly Button test=new Button();readonly Label label=new Label();
 Dictionary<string,object> command;
 string action,runDir;int ticks=0,clicks=0;bool sent=false;IntPtr targetHandle;
 string beforeHash;uint sentEvents=0;string inputRoute="none";
 readonly string[] pageNames={"文件","常规打印","设置","校准","电压","高级","视觉打印"};
 protected override bool ShowWithoutActivation { get { return action!="selftest"; } }
 MenuCompat(){
  Text="UV Desktop Compatibility — bounded actions";ClientSize=new Size(540,155);
  StartPosition=FormStartPosition.Manual;Location=new Point(20,Screen.PrimaryScreen.WorkingArea.Bottom-220);
  label.SetBounds(15,15,510,65);label.Text="One-shot diagnostic/navigation adapter.\nExplicit scan-only command may move hardware. Close to cancel waiting helper.";
  test.Text="Self-test only";test.AccessibleName="Self-test only";test.SetBounds(15,95,200,35);test.Click+=delegate{clicks++;label.Text="Test clicks: "+clicks;};Controls.Add(label);Controls.Add(test);
  if(File.Exists(Path.Combine(folder,".prepare-command.lock")))throw new Exception("COMMAND_PREPARATION_IN_PROGRESS");
  string commandPath=Path.Combine(folder,"command.json");
  command=File.Exists(commandPath)?json.Deserialize<Dictionary<string,object>>(File.ReadAllText(commandPath,Encoding.UTF8)):new Dictionary<string,object>();
  action=Get("action","read-only");if(Array.IndexOf(new[]{"read-only","selftest","capture","capture-footer","capture-view","capture-controls","capture-print-evidence","capture-import-dialog","fill-import-file","submit-import-once","capture-z-panel","set-z-target","position-z-once","close-z-panel","open-z-panel","open-template-import","open-template-editor","open-new-template","capture-new-template","create-registration-template","capture-template-editor","capture-draft-editor","restore-draft-window","draft-editor-control","select-draft-features","open-texture-import","verify-product","print-once","select-products","scan-region-control","set-scan-height","scan-once","navigate"},action)<0)throw new Exception("ACTION_NOT_ALLOWED");
  string id=Get("id",Guid.NewGuid().ToString("N"));Guid parsed;if(!Guid.TryParseExact(id,"N",out parsed))throw new Exception("INVALID_COMMAND_ID");
  runDir=Path.Combine(folder,"runs",id);if(Directory.Exists(runDir))throw new Exception("COMMAND_ALREADY_CONSUMED");Directory.CreateDirectory(runDir);
  if(command.Count>0){var created=DateTime.Parse(Get("createdAt","")).ToUniversalTime();if((DateTime.UtcNow-created).TotalSeconds>120||(DateTime.UtcNow-created).TotalSeconds< -5)throw new Exception("STALE_COMMAND");}
  Save("started.json",new{action=action,at=DateTime.UtcNow.ToString("o"),targetInputSent=false});
  test.Visible=action=="selftest";timer.Interval=500;timer.Tick+=Tick;Shown+=delegate{timer.Start();};
 }
 string Get(string key,string fallback){object v;return command.TryGetValue(key,out v)?Convert.ToString(v):fallback;}
 int Number(string key){return Convert.ToInt32(command[key]);}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 void Save(string name,object value){File.WriteAllText(Path.Combine(runDir,name),json.Serialize(value),new UTF8Encoding(false));}
 static string ImagePath(int id){IntPtr h=OpenProcess(0x1000,false,id);if(h==IntPtr.Zero)return null;try{var b=new StringBuilder(32768);int n=b.Capacity;return QueryFullProcessImageName(h,0,b,ref n)?b.ToString():null;}finally{CloseHandle(h);}}
 string CaptureHeader(IntPtr hwnd,string name,int heightLimit=185){
  RECT r;if(GetForegroundWindow()!=hwnd||IsIconic(hwnd)||!GetWindowRect(hwnd,out r))throw new Exception("TARGET_NOT_FOREGROUND_VISIBLE");
  int width=r.Right-r.Left,height=Math.Min(heightLimit,r.Bottom-r.Top);if(width<100||width>10000||height<20)throw new Exception("INVALID_BOUNDS");
  using(var bitmap=new Bitmap(width,height))using(var g=Graphics.FromImage(bitmap))using(var stream=new MemoryStream()){
   g.CopyFromScreen(r.Left,r.Top,0,0,bitmap.Size,CopyPixelOperation.SourceCopy);
   if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");
   bitmap.Save(stream,ImageFormat.Png);byte[] bytes=stream.ToArray();File.WriteAllBytes(Path.Combine(runDir,name),bytes);return Hash(bytes);
  }
 }
 static uint SendMouseClick(IntPtr hwnd,int x,int y){
  if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_INPUT");
  if(!SetCursorPos(x,y))throw new Exception("CURSOR_POSITION_FAILED");
  if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_INPUT");
  INPUT down=new INPUT();down.union.mouse.flags=0x0002;INPUT up=new INPUT();up.union.mouse.flags=0x0004;
  return SendInput(2,new[]{down,up},Marshal.SizeOf(typeof(INPUT)));
 }
 // A scoped review changes only applicability of one unchanged historical record.
 // Recheck all proof at dispatch; consume before sending any scan input.
 static string ScopeText(Dictionary<string,object> value,string key){object found;return value.TryGetValue(key,out found)&&found is string?(string)found:null;}
 static bool ScopeBool(Dictionary<string,object> value,string key,bool expected){object found;return value.TryGetValue(key,out found)&&found is bool&&(bool)found==expected;}
 static Dictionary<string,object> ScopeMap(object value){var map=value as Dictionary<string,object>;if(map==null)throw new Exception("DEVICE_REVIEW_OBJECT_REQUIRED");return map;}
 static object ScopeValue(Dictionary<string,object> value,string key){object found;if(!value.TryGetValue(key,out found))throw new Exception("DEVICE_REVIEW_FIELD_REQUIRED");return found;}
 static double ScopeNumber(object value){double number;if(value==null||!Double.TryParse(Convert.ToString(value,System.Globalization.CultureInfo.InvariantCulture),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out number)||Double.IsNaN(number)||Double.IsInfinity(number))throw new Exception("DEVICE_REVIEW_NUMERIC_VALUE_REQUIRED");return number;}
 static void ScopeLocalFile(string file){
  if(String.IsNullOrEmpty(file)||!Path.IsPathRooted(file)||file.StartsWith("\\\\")||file.StartsWith("//")||file.IndexOf('\0')>=0||file.Substring(Path.GetPathRoot(file).Length).Contains(":"))throw new Exception("DEVICE_REVIEW_LOCAL_FILE_REQUIRED");
  string current=Path.GetFullPath(file);while(!String.IsNullOrEmpty(current)){if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new Exception("DEVICE_REVIEW_LINK_REJECTED");var parent=Directory.GetParent(current);if(parent==null)break;current=parent.FullName;}
  var info=new FileInfo(file);if(!info.Exists||info.Length>2097152)throw new Exception("DEVICE_REVIEW_REGULAR_FILE_REQUIRED");
 }
 Dictionary<string,object> ScopeRead(string file,string expectedHash){if(!System.Text.RegularExpressions.Regex.IsMatch(expectedHash??"","^[a-f0-9]{64}$"))throw new Exception("DEVICE_REVIEW_EVIDENCE_HASH_REQUIRED");ScopeLocalFile(file);byte[] bytes=File.ReadAllBytes(file);if(Hash(bytes)!=expectedHash)throw new Exception("DEVICE_REVIEW_EVIDENCE_CHANGED");return json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF'));}
 static DateTime ScopeTime(string value){DateTime result;if(String.IsNullOrEmpty(value)||!value.EndsWith("Z")||!DateTime.TryParse(value,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.RoundtripKind,out result))throw new Exception("DEVICE_REVIEW_INVALID_TIME");return result.ToUniversalTime();}
 static void ScopeFresh(string value){double age=(DateTime.UtcNow-ScopeTime(value)).TotalSeconds;if(age<0||age>120)throw new Exception("DEVICE_REVIEW_FRESH_EVIDENCE_REQUIRED");}
 static string ProcessStartUtc(uint pid){return System.Diagnostics.Process.GetProcessById((int)pid).StartTime.ToUniversalTime().ToString("o");}
 static string WindowTitle(IntPtr hwnd){var text=new StringBuilder(256);GetWindowText(hwnd,text,text.Capacity);return text.ToString();}
 static IntPtr FindVisibleProcessWindow(uint pid,string titleHint){
  var matches=new List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr unused){uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=pid||!IsWindowVisible(h)||IsIconic(h))return true;string title=WindowTitle(h);if(title==titleHint||(titleHint=="Z轴控制面板"&&title=="Z axis control panel"))matches.Add(h);return true;},IntPtr.Zero);
  if(matches.Count!=1)throw new Exception("WINDOW_REDISCOVERY_REQUIRED");return matches[0];
 }
 static long ProcessMainHandle(uint pid){try{return FindVisibleProcessWindow(pid,"PrintExp").ToInt64();}catch{return 0;}}
 static bool OwnedDraftTitle(string title){return System.Text.RegularExpressions.Regex.IsMatch(title,"^编辑模板 - 飞天_配准草稿_[0-9]{8}_[0-9]{6}$");}
 static void DraftGuardFile(string file,string hash){
  if(!Path.IsPathRooted(file)||file.StartsWith("\\\\")||!File.Exists(file))throw new Exception("DRAFT_GUARD_LOCAL_FILE_REQUIRED");string p=Path.GetFullPath(file);while(!String.IsNullOrEmpty(p)){if((File.GetAttributes(p)&FileAttributes.ReparsePoint)!=0)throw new Exception("DRAFT_GUARD_LINK_REJECTED");var parent=Directory.GetParent(p);if(parent==null)break;p=parent.FullName;}
  var info=new FileInfo(file);if(info.Length>268435456||Hash(File.ReadAllBytes(file))!=hash)throw new Exception("DRAFT_OR_BACKUP_CHANGED");
 }
 void ValidateNewDraftGuard(uint pid){
  string manifest=Get("newDraftGuardPath","");var guard=ScopeRead(manifest,Get("newDraftGuardSha256",""));
  if(ScopeNumber(ScopeValue(guard,"schemaVersion"))!=2||ScopeText(guard,"guardKind")!="owned-new-draft-first-texture"||!ScopeBool(guard,"customerLocalBackupAuthorized",true)||!ScopeBool(guard,"isolatedDirectoryConfirmed",true)||!ScopeBool(guard,"targetOriginallyAbsent",true))throw new Exception("INVALID_NEW_DRAFT_GUARD");
  double age=(DateTime.UtcNow-ScopeTime(ScopeText(guard,"createdAt"))).TotalSeconds;if(age<0||age>600)throw new Exception("STALE_NEW_DRAFT_BACKUP");
  string name=ScopeText(guard,"draftName"),meta=ScopeText(guard,"metadataPath"),target=ScopeText(guard,"targetPath");if(!OwnedDraftTitle("编辑模板 - "+name)||!Path.IsPathRooted(meta)||!Path.IsPathRooted(target)||File.Exists(target)||Directory.Exists(target)||WindowTitle(FindOwnedDraft(pid))!="编辑模板 - "+name)throw new Exception("NEW_DRAFT_TARGET_OR_EDITOR_CHANGED");
  string draftDir=Path.GetDirectoryName(meta),root=Path.GetDirectoryName(Path.GetDirectoryName(draftDir));if(Path.GetFileName(meta)!="Temp.json"||Path.GetFileName(draftDir)!=name||Path.GetFileName(Path.GetDirectoryName(draftDir))!="Vision"||!String.Equals(target,Path.Combine(root,"Template",name+".tif"),StringComparison.OrdinalIgnoreCase))throw new Exception("DRAFT_METADATA_PATH_MISMATCH");
  var files=ScopeValue(guard,"files") as System.Collections.IEnumerable;if(files==null)throw new Exception("DRAFT_BACKUP_FILES_REQUIRED");int count=0;bool metaFound=false;var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  foreach(object item in files){var f=ScopeMap(item);string source=ScopeText(f,"sourcePath"),backup=ScopeText(f,"backupPath"),hash=ScopeText(f,"sha256");if(!Path.IsPathRooted(source)||!Path.IsPathRooted(backup)||!(Path.GetFullPath(source).StartsWith(draftDir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||String.Equals(source,Path.Combine(root,"Template",name+".bmp"),StringComparison.OrdinalIgnoreCase))||!Path.GetFullPath(backup).StartsWith(Path.GetDirectoryName(manifest)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||!seen.Add(source))throw new Exception("DRAFT_BACKUP_SCOPE_INVALID");DraftGuardFile(source,hash);DraftGuardFile(backup,hash);if(String.Equals(source,meta,StringComparison.OrdinalIgnoreCase))metaFound=true;count++;}
  if(count<2||count>64||!metaFound)throw new Exception("DRAFT_BACKUP_FILES_REQUIRED");
  var metadata=json.Deserialize<Dictionary<string,object>>(Encoding.GetEncoding(936).GetString(File.ReadAllBytes(meta)));var temp=ScopeMap(ScopeValue(metadata,"Temp"));if(ScopeText(temp,"szName")!=name||ScopeText(temp,"szFolderName")!=name||!String.Equals(ScopeText(temp,"szPrintFile"),target,StringComparison.OrdinalIgnoreCase))throw new Exception("DRAFT_METADATA_CONTENT_CHANGED");
 }
 static IntPtr FindOwnedDraft(uint pid){var matches=new List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr unused){uint owner;GetWindowThreadProcessId(h,out owner);if(owner==pid&&IsWindowVisible(h)&&!IsIconic(h)&&OwnedDraftTitle(WindowTitle(h)))matches.Add(h);return true;},IntPtr.Zero);if(matches.Count!=1)throw new Exception("UNIQUE_OWNED_DRAFT_WINDOW_REQUIRED");return matches[0];}
 string CaptureFooter(IntPtr hwnd,string name){
  RECT r;if(GetForegroundWindow()!=hwnd||IsIconic(hwnd)||!GetWindowRect(hwnd,out r)||r.Right-r.Left<1000||r.Bottom-r.Top<600)throw new Exception("MAIN_WINDOW_REQUIRED");
  using(var b=new Bitmap(r.Right-r.Left,52))using(var g=Graphics.FromImage(b))using(var stream=new MemoryStream()){
   g.CopyFromScreen(r.Left,r.Bottom-52,0,0,b.Size,CopyPixelOperation.SourceCopy);
   if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");b.Save(stream,ImageFormat.Png);byte[] bytes=stream.ToArray();File.WriteAllBytes(Path.Combine(runDir,name),bytes);return Hash(bytes);
  }
 }
 int FooterPositionGuardWidth(IntPtr hwnd){
  RECT r;if(!GetWindowRect(hwnd,out r))throw new Exception("NO_TARGET_BOUNDS");var root=AutomationElement.FromHandle(hwnd);
  var ready=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"31028"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
  var edge=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"31029"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
  if(ready.Count!=1||edge.Count!=1||ready[0].Current.IsOffscreen||edge[0].Current.IsOffscreen||ready[0].Current.Name!="设备就绪")throw new Exception("FOOTER_POSITION_ANCHORS_REQUIRED");
  var a=ready[0].Current.BoundingRectangle;var b=edge[0].Current.BoundingRectangle;
  if(a.Top<r.Bottom-52||a.Bottom>r.Bottom||b.Top!=a.Top||b.Height!=a.Height||b.Width<20||b.Width>40||b.Left<a.Right||b.Left-a.Right>10||r.Right-b.Right<0||r.Right-b.Right>10||r.Right-a.Right>60||a.Width<100||a.Width>300)throw new Exception("FOOTER_POSITION_LAYOUT_CHANGED");
  return (int)a.Right-r.Left;
 }
 static bool FooterPixelsMatch(Bitmap original,Bitmap current,int width){
  if(original.Width!=current.Width||original.Height!=52||current.Height!=52||width<original.Width-60||width>original.Width)return false;
  for(int y=0;y<52;y++)for(int x=0;x<width;x++)if(original.GetPixel(x,y).ToArgb()!=current.GetPixel(x,y).ToArgb())return false;return true;
 }
 void Done(object result){Save("result.json",result);timer.Stop();Close();}
 static bool DialogIsForeground(IntPtr main,AutomationElement dialog){IntPtr active=GetForegroundWindow();return active==main||active==new IntPtr(dialog.Current.NativeWindowHandle);}
 static string ReadJobState(AutomationElement root){
  foreach(string id in new[]{"11027","1324","17099","17077"}){
   var matches=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,id));
   if(matches.Count!=1)return "unknown";
   if(matches[0].Current.IsEnabled)return "busy";
  }
  return "idle";
 }
 static string ClassifyZMainJobState(bool mainObserved,bool mainEnabled,string jobState){
  // A disabled modal parent can report every child disabled; that cannot establish idle.
  if(!mainObserved||!mainEnabled)return "unknown";
  return jobState=="idle"||jobState=="busy"?jobState:"unknown";
 }
 static string ObserveZMainJobState(AutomationElement panel,uint pid,out AutomationElement main,out bool? mainEnabled,out string reason){
  main=null;mainEnabled=null;reason="main_window_unobservable";
  try{
   if(panel.Current.ProcessId!=(int)pid)return "unknown";
   IntPtr handle=FindVisibleProcessWindow(pid,"PrintExp");var candidate=AutomationElement.FromHandle(handle);
   if(candidate.Current.ProcessId!=(int)pid||candidate.Current.Name!="PrintExp"||candidate.Current.ControlType!=ControlType.Window||candidate.Current.NativeWindowHandle!=handle.ToInt64()||candidate.Current.IsOffscreen)return "unknown";
   // Independently bind the exact unique native main window. A detached Z dialog's
   // UIA parent may be the desktop, so a missing parent chain is never called idle.
   reason="unique_visible_main_window";var ancestor=panel;
   for(int depth=0;depth<32&&ancestor!=null&&ancestor.Current.ProcessId==(int)pid;depth++){
    if(ancestor.Current.Name=="PrintExp"&&ancestor.Current.ControlType==ControlType.Window){
     if(ancestor.Current.NativeWindowHandle!=candidate.Current.NativeWindowHandle){reason="main_parent_identity_mismatch";return "unknown";}
     reason="uia_parent_and_unique_visible_main_window";break;
    }
    ancestor=TreeWalker.ControlViewWalker.GetParent(ancestor);
   }
   main=candidate;
   mainEnabled=main.Current.IsEnabled;
   if(mainEnabled!=true){reason="main_disabled_by_modal_state_unobservable";return ClassifyZMainJobState(true,false,"unknown");}
   string state=ReadJobState(main);if(state=="unknown")reason="main_job_controls_unobservable";
   return ClassifyZMainJobState(true,true,state);
  }catch{main=null;mainEnabled=null;reason="main_state_read_failed";return "unknown";}
 }
 object ReadVisualControls(IntPtr hwnd){
  var root=AutomationElement.FromHandle(hwnd);var nodes=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);
  var rows=new List<object>();string[] wanted={"新建","编辑","Z轴","开始扫描","导入","产品验证","打印","设备就绪","扫描高度:","扫描区域:","扫描类型:","打印数量:","已识别:"};
  foreach(AutomationElement e in nodes){
   var c=e.Current;if(Array.IndexOf(wanted,c.Name)<0)continue;
   var rect=c.BoundingRectangle;var patterns=new List<string>();foreach(var pattern in e.GetSupportedPatterns())patterns.Add(pattern.ProgrammaticName);
   string value=null;object p;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out p)){string raw=((ValuePattern)p).Current.Value;double parsed;if(Double.TryParse(raw,out parsed))value=raw;}
   string crop=null;
   if(c.ControlType==ControlType.Button&&!c.IsOffscreen&&rect.Width>5&&rect.Width<500&&rect.Height>5&&rect.Height<(c.Name=="Z轴"?200:100)){
    string id=c.AutomationId;if(System.Text.RegularExpressions.Regex.IsMatch(id,"^[0-9]+$")){
     if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");
     crop="control-"+id+".png";using(var b=new Bitmap((int)rect.Width,(int)rect.Height))using(var g=Graphics.FromImage(b)){g.CopyFromScreen((int)rect.X,(int)rect.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(Path.Combine(runDir,crop),ImageFormat.Png);}
    }
   }
   rows.Add(new{name=c.Name,automationId=c.AutomationId,controlType=c.ControlType.ProgrammaticName,enabled=c.IsEnabled,offscreen=c.IsOffscreen,patterns=patterns,numericValue=value,x=rect.X,y=rect.Y,width=rect.Width,height=rect.Height,screenshot=crop});
  }
  var area=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17138"));
  var scan=root.FindFirst(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
  if(area!=null&&scan!=null&&!area.Current.IsOffscreen&&!scan.Current.IsOffscreen){
   RECT wr;if(!GetWindowRect(hwnd,out wr))throw new Exception("NO_TARGET_BOUNDS");
   var ar=area.Current.BoundingRectangle;var sr=scan.Current.BoundingRectangle;
   int left=(int)ar.Left-4,top=(int)ar.Top-4,width=wr.Right-left-8,height=(int)sr.Bottom-top+4;
   if(width<100||width>650||height<30||height>400||left<wr.Left||top<wr.Top)throw new Exception("SCAN_PANEL_BOUNDS_UNEXPECTED");
   if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");
   using(var b=new Bitmap(width,height))using(var g=Graphics.FromImage(b)){g.CopyFromScreen(left,top,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(Path.Combine(runDir,"scan-panel.png"),ImageFormat.Png);}
   foreach(int offset in new[]{200,307}){
    var hit=AutomationElement.FromPoint(new System.Windows.Point(ar.Left+offset,ar.Top+12));var hc=hit.Current;var hp=new List<string>();foreach(var pattern in hit.GetSupportedPatterns())hp.Add(pattern.ProgrammaticName);object statePattern;string state=null;
    if(hit.TryGetCurrentPattern(TogglePattern.Pattern,out statePattern))state=((TogglePattern)statePattern).Current.ToggleState.ToString();
    if(hit.TryGetCurrentPattern(ValuePattern.Pattern,out statePattern))state=((ValuePattern)statePattern).Current.Value;
    rows.Add(new{scope="scan-region-point",offset=offset,name=hc.Name,automationId=hc.AutomationId,className=hc.ClassName,controlType=hc.ControlType.ProgrammaticName,patterns=hp,state=state,nativeHandle=hc.NativeWindowHandle});
   }
  }
  return rows;
 }
 void Tick(object sender,EventArgs args){
  ticks++;
  try{
   if(action=="read-only"){Done(new{at=DateTime.UtcNow.ToString("o"),status="read_only_default",targetInputSent=false,ownWindowInputSent=false});return;}
   if(action=="selftest"){
    if(!sent){if(GetForegroundWindow()!=Handle){if(ticks>20)throw new Exception("SELFTEST_NOT_FOREGROUND");return;}var p=test.PointToScreen(new Point(test.Width/2,test.Height/2));sentEvents=SendMouseClick(Handle,p.X,p.Y);sent=true;return;}
    string hash=CaptureHeader(Handle,"selftest.png");Done(new{at=DateTime.UtcNow.ToString("o"),scope="OWN_TEST_FORM_ONLY",eventsSent=sentEvents,clicks=clicks,passed=sentEvents==2&&clicks==1,screenshotSha256=hash,targetInputSent=false});return;
   }
   if(sent){
    if(ticks<4)return;string after=CaptureHeader(targetHandle,"after.png");
    Done(new{at=DateTime.UtcNow.ToString("o"),status="input_sent_requires_visual_verification",page=Get("page",""),route=inputRoute,eventsSent=sentEvents,beforeSha256=beforeHash,afterSha256=after,headerChanged=after!=beforeHash,targetInputSent=true,printerCommandSent=false,parametersChanged=false});return;
   }
   IntPtr hwnd=GetForegroundWindow();uint pid;GetWindowThreadProcessId(hwnd,out pid);
   bool mainAction=action=="capture-footer"||action=="capture-view"||action=="capture-controls"||action=="capture-print-evidence"||action=="scan-once";
   bool draftAction=action=="capture-draft-editor"||action=="restore-draft-window"||action=="draft-editor-control"||action=="select-draft-features";
   if(!String.Equals(ImagePath((int)pid),Get("targetPath",""),StringComparison.OrdinalIgnoreCase)||(mainAction&&WindowTitle(hwnd)!="PrintExp")||(draftAction&&!OwnedDraftTitle(WindowTitle(hwnd)))){
    try{
     string hint=(action=="capture-z-panel"||action=="close-z-panel"||action=="set-z-target"||action=="position-z-once")?"Z轴控制面板":"PrintExp";
     var candidates=new List<Process>();
     foreach(Process candidate in Process.GetProcessesByName("PrintExp_X64")){
      if(String.Equals(ImagePath(candidate.Id),Get("targetPath",""),StringComparison.OrdinalIgnoreCase)){
       candidates.Add(candidate);
      }
     }
     if(candidates.Count!=1)throw new Exception("UNIQUE_TARGET_PROCESS_REQUIRED");
     pid=(uint)candidates[0].Id;hwnd=draftAction?FindOwnedDraft(pid):FindVisibleProcessWindow(pid,hint);
     if(mainAction&&!AutomationElement.FromHandle(hwnd).Current.IsEnabled)throw new Exception("MAIN_WINDOW_DISABLED_BY_MODAL");
     if(!SetForegroundWindow(hwnd)||GetForegroundWindow()!=hwnd){if(ticks>90)throw new Exception("TARGET_NOT_FOREGROUND_VISIBLE");return;}
    }catch(Exception ex){if(ex.Message!="WINDOW_REDISCOVERY_REQUIRED")throw;}
    if(!String.Equals(ImagePath((int)pid),Get("targetPath",""),StringComparison.OrdinalIgnoreCase)){if(ticks>90)throw new Exception("TIMEOUT_WAITING_FOR_VERIFIED_TARGET");return;}
   }
   // The owned helper must not cover the target footer/canvas during evidence capture.
   // Yield one timer tick for compositor repaint; all target/height checks still run next tick.
   if(Visible){Hide();return;}
   string exe=Get("targetPath","");if(Hash(File.ReadAllBytes(exe))!=Get("targetSha256","").ToLowerInvariant())throw new Exception("TARGET_BINARY_CHANGED");
   if(command.ContainsKey("deviceReviewId"))throw new Exception("HISTORICAL_HEIGHT_REVIEW_RETIRED");
   if(command.ContainsKey("currentZStandardConfirmed"))throw new Exception("CURRENT_Z_SHORTCUT_RETIRED");
   targetHandle=hwnd;RECT r;if(!GetWindowRect(hwnd,out r))throw new Exception("NO_TARGET_BOUNDS");
   Save("geometry.json",new{width=r.Right-r.Left,height=r.Bottom-r.Top});
   if(action=="capture-footer"){
    var footerRoot=AutomationElement.FromHandle(hwnd);if(footerRoot.Current.Name!="PrintExp")throw new Exception("MAIN_WINDOW_REQUIRED");string footerHash=CaptureFooter(hwnd,"machine-footer.png");
    var footerFields=new List<object>();foreach(AutomationElement field in footerRoot.FindAll(TreeScope.Descendants,Condition.TrueCondition)){var f=field.Current;var fr=f.BoundingRectangle;if(!f.IsOffscreen&&fr.Width>0&&fr.Height>0&&fr.Top>=r.Bottom-52&&fr.Bottom<=r.Bottom)footerFields.Add(new{name=f.Name,automationId=f.AutomationId,controlType=f.ControlType.ProgrammaticName,x=fr.Left-r.Left,y=fr.Top-(r.Bottom-52),width=fr.Width,height=fr.Height});}Save("footer-fields.json",footerFields);
    object footerGuard=null;if(ReadJobState(footerRoot)=="idle")footerGuard=new{kind="scan-position-through-ready-v1",rightAnchorId="31028",excludedEdgeControlId="31029",width=FooterPositionGuardWidth(hwnd),height=52};
    Done(new{at=DateTime.UtcNow.ToString("o"),status="machine_footer_observed_readonly",footerSha256=footerHash,footerPositionGuard=footerGuard,width=r.Right-r.Left,height=r.Bottom-r.Top,mainWindowEnabled=footerRoot.Current.IsEnabled,activeJobState=ReadJobState(footerRoot),targetPath=Get("targetPath",""),targetSha256=Get("targetSha256",""),targetProcessId=pid,targetProcessStartUtc=ProcessStartUtc(pid),targetWindowHandle=hwnd.ToInt64(),targetInputSent=false,heightChanged=false});return;
   }
   if(action=="capture-new-template"||action=="create-registration-template"){
    var root=AutomationElement.FromHandle(hwnd);AutomationElement dialog=null;
    if(root.Current.Name=="新建模板")dialog=root;else{var ds=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.NameProperty,"新建模板"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Window)));if(ds.Count!=1)throw new Exception("UNIQUE_NEW_TEMPLATE_DIALOG_REQUIRED");dialog=ds[0];}
    if(!dialog.Current.IsEnabled||!DialogIsForeground(hwnd,dialog))throw new Exception("NEW_TEMPLATE_DIALOG_NOT_ACTIVE");
    var fields=new Dictionary<string,AutomationElement>();foreach(string fid in new[]{"17102","17208","17303","1"}){var matches=dialog.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,fid));if(matches.Count!=1||!matches[0].Current.IsEnabled||matches[0].Current.IsOffscreen)throw new Exception("NEW_TEMPLATE_FIELDS_REQUIRED");fields.Add(fid,matches[0]);}
    if(fields["17102"].Current.ControlType!=ControlType.Edit||fields["1"].Current.ControlType!=ControlType.Button||fields["1"].Current.Name!="确定"||fields["17208"].Current.Name!="多层打印"||fields["17303"].Current.Name!="自动创建模板")throw new Exception("NEW_TEMPLATE_FIELDS_CHANGED");
    object np,mp,ap;if(!fields["17102"].TryGetCurrentPattern(ValuePattern.Pattern,out np)||!fields["17208"].TryGetCurrentPattern(TogglePattern.Pattern,out mp)||!fields["17303"].TryGetCurrentPattern(TogglePattern.Pattern,out ap))throw new Exception("NEW_TEMPLATE_PATTERNS_REQUIRED");
    var vp=(ValuePattern)np;string nameValue=vp.Current.Value,multiState=((TogglePattern)mp).Current.ToggleState.ToString(),autoState=((TogglePattern)ap).Current.ToggleState.ToString();var dr=dialog.Current.BoundingRectangle;IntPtr dh=new IntPtr(dialog.Current.NativeWindowHandle);
    string state=Hash(Encoding.UTF8.GetBytes(json.Serialize(new{handle=dh.ToInt64(),x=dr.X,y=dr.Y,width=dr.Width,height=dr.Height,nameValue=nameValue,multiState=multiState,autoState=autoState})));CaptureHeader(GetForegroundWindow(),"new-template-private.png",Math.Min(1000,(int)dr.Height));
    if(action=="capture-new-template"){Done(new{at=DateTime.UtcNow.ToString("o"),status="new_template_dialog_observed",dialogStateSha256=state,nameValue=nameValue,multiState=multiState,autoState=autoState,targetInputSent=false});return;}
    string draftName=Get("newTemplateName","");if(Get("newTemplateAuthorized","")!="True"||Get("registrationOnlyNoPrint","")!="True"||state!=Get("expectedDialogStateSha256","")||nameValue!=""||multiState!="Off"||autoState!="Off"||!System.Text.RegularExpressions.Regex.IsMatch(draftName,"^飞天_配准草稿_[0-9]{8}_[0-9]{6}$"))throw new Exception("REGISTRATION_DRAFT_STATE_OR_AUTHORIZATION_REQUIRED");
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,scope="NEW_REGISTRATION_DRAFT_ONLY_NO_PRINT",automaticRetry=false});sent=true;inputRoute="UIA name field then exact new-template confirm";vp.SetValue(draftName);
    if(vp.Current.Value!=draftName||((TogglePattern)mp).Current.ToggleState!=ToggleState.Off||((TogglePattern)ap).Current.ToggleState!=ToggleState.Off||!DialogIsForeground(hwnd,dialog))throw new Exception("DRAFT_NAME_OR_DIALOG_CHANGED_NO_RETRY");
    var br=fields["1"].Current.BoundingRectangle;var hit=AutomationElement.FromPoint(new System.Windows.Point(br.X+br.Width/2,br.Y+br.Height/2));if(hit.Current.AutomationId!="1"||hit.Current.Name!="确定"||hit.Current.ProcessId!=dialog.Current.ProcessId)throw new Exception("DRAFT_CONFIRM_OCCLUDED_NO_RETRY");
    sentEvents=SendMouseClick(GetForegroundWindow(),(int)(br.X+br.Width/2),(int)(br.Y+br.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_DRAFT_INPUT_NO_RETRY");Done(new{at=DateTime.UtcNow.ToString("o"),status="registration_draft_submit_requires_editor_readback",targetInputSent=true,eventsSent=sentEvents,scanButtonClicked=false,printStartButtonClicked=false,multiLayerParametersSet=false});return;
   }
   if(draftAction){
    var editor=AutomationElement.FromHandle(hwnd);string title=editor.Current.Name;
    Save("draft-binding.json",new{title=title,enabled=editor.Current.IsEnabled,offscreen=editor.Current.IsOffscreen,foreground=DialogIsForeground(hwnd,editor),iconic=IsIconic(hwnd),visible=IsWindowVisible(hwnd),left=r.Left,top=r.Top,right=r.Right,bottom=r.Bottom,screen=Screen.FromHandle(hwnd).WorkingArea.ToString()});
    if(!OwnedDraftTitle(title)||!editor.Current.IsEnabled||!DialogIsForeground(hwnd,editor))throw new Exception("OWNED_ACTIVE_DRAFT_EDITOR_REQUIRED");
    string titleHash=Hash(Encoding.UTF8.GetBytes(title));int width=r.Right-r.Left,height=r.Bottom-r.Top;
    var working=Screen.FromHandle(hwnd).WorkingArea;bool entirelyOutside=!working.IntersectsWith(Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom));
    if(action=="capture-draft-editor"&&editor.Current.IsOffscreen&&entirelyOutside&&!IsIconic(hwnd)){Done(new{at=DateTime.UtcNow.ToString("o"),status="owned_draft_window_offscreen",editorTitle=title,editorTitleSha256=titleHash,left=r.Left,top=r.Top,width=width,height=height,targetProcessId=pid,targetProcessStartUtc=ProcessStartUtc(pid),targetSha256=Get("targetSha256",""),targetInputSent=false});return;}
    if(action=="restore-draft-window"){
     ScopeFresh(Get("observationAt",""));if(Get("draftEditorAuthorized","")!="True"||Get("draftNoPrint","")!="True"||!entirelyOutside||!editor.Current.IsOffscreen||IsIconic(hwnd)||titleHash!=Get("expectedEditorTitleSha256","")||pid!=Number("expectedProcessId")||ProcessStartUtc(pid)!=Get("expectedProcessStartUtc","")||r.Left!=Number("expectedLeft")||r.Top!=Number("expectedTop")||width!=Number("expectedWidth")||height!=Number("expectedHeight"))throw new Exception("DRAFT_RESTORE_STATE_CHANGED");
     int rw=Number("restoreWidth"),rh=Number("restoreHeight");if(rw<900||rh<650||rw>working.Width-40||rh>working.Height-40)throw new Exception("DRAFT_RESTORE_SIZE_INVALID");
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,scope="OWNED_OFFSCREEN_DRAFT_FRAME_ONLY",automaticRetry=false});sent=true;if(!SetWindowPos(hwnd,IntPtr.Zero,working.Left+20,working.Top+20,rw,rh,0x0014))throw new Exception("DRAFT_RESTORE_FAILED_NO_RETRY");
     RECT restored;GetWindowRect(hwnd,out restored);Done(new{at=DateTime.UtcNow.ToString("o"),status="draft_frame_restored_requires_readback",left=restored.Left,top=restored.Top,width=restored.Right-restored.Left,height=restored.Bottom-restored.Top,targetInputSent=true,hardwareAction=false,automaticRetry=false});return;
    }
    if(editor.Current.IsOffscreen)throw new Exception("DRAFT_EDITOR_OFFSCREEN");
    if(width<900||height<650||height>2000)throw new Exception("DRAFT_LAYOUT_UNSUPPORTED");
    string[] ids={"17078","17208","17121","17074","17307","17023","17107","17021","","17111","17076","17046","17085","17038"};string[] names={"矩形","只寻找外轮廓","毫米单位","验证特征","自动对位","保存","编辑图片","撤消","关闭","编辑模板","选择","小","显示贴图","单位:"};
    var controls=new List<object>();var elements=new Dictionary<string,AutomationElement>();var hashes=new Dictionary<string,string>();
    int canvasRight=width;
    for(int i=0;i<ids.Length;i++){
     Condition condition=ids[i]==""?(Condition)new AndCondition(new PropertyCondition(AutomationElement.NameProperty,"关闭"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)):new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,ids[i]),new PropertyCondition(AutomationElement.NameProperty,names[i]));var matches=editor.FindAll(TreeScope.Descendants,condition);if(matches.Count==0&&ids[i]!="17107"&&ids[i]!="17111"&&ids[i]!="")continue;if(matches.Count!=1)throw new Exception("DRAFT_CONTROL_LAYOUT_CHANGED:"+ids[i]+":"+matches.Count);
     var e=matches[0];var dc=e.Current;var b=dc.BoundingRectangle;ControlType expected=i==1?ControlType.CheckBox:i==2?ControlType.RadioButton:ids[i]=="17038"?ControlType.ComboBox:ControlType.Button;
     if(dc.ControlType!=expected||dc.IsOffscreen||b.Width<10||b.Height<10||b.Left<r.Left||b.Right>r.Right||b.Top<r.Top||b.Bottom>r.Bottom)throw new Exception("DRAFT_CONTROL_BOUNDS_CHANGED");
     canvasRight=Math.Min(canvasRight,(int)b.Left-r.Left-25);object p;string toggle=null;bool? selected=null;
     if(e.TryGetCurrentPattern(TogglePattern.Pattern,out p))toggle=((TogglePattern)p).Current.ToggleState.ToString();if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out p))selected=((SelectionItemPattern)p).Current.IsSelected;
     string hash;using(var bitmap=new Bitmap((int)b.Width,(int)b.Height))using(var g=Graphics.FromImage(bitmap))using(var stream=new MemoryStream()){g.CopyFromScreen((int)b.Left,(int)b.Top,0,0,bitmap.Size,CopyPixelOperation.SourceCopy);bitmap.Save(stream,ImageFormat.Png);byte[] bytes=stream.ToArray();hash=Hash(bytes);File.WriteAllBytes(Path.Combine(runDir,"draft-control-"+ids[i]+".png"),bytes);}
     elements.Add(ids[i],e);hashes.Add(ids[i],hash);controls.Add(new{id=ids[i],name=names[i],type=dc.ControlType.ProgrammaticName,enabled=dc.IsEnabled,offscreen=dc.IsOffscreen,x=b.Left-r.Left,y=b.Top-r.Top,width=b.Width,height=b.Height,toggleState=toggle,selected=selected,sha256=hash});
    }
    string scaleStep=null;bool uniformScale=false;var scaleFields=editor.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17038"));object scalePattern;if(scaleFields.Count==1){if(scaleFields[0].TryGetCurrentPattern(ValuePattern.Pattern,out scalePattern))scaleStep=((ValuePattern)scalePattern).Current.Value;else if(scaleFields[0].TryGetCurrentPattern(SelectionPattern.Pattern,out scalePattern)){var selectedItems=((SelectionPattern)scalePattern).Current.GetSelection();if(selectedItems.Length==1)scaleStep=selectedItems[0].Current.Name;}}
    var uniform=editor.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"17057"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.RadioButton)));if(uniform.Count==1&&uniform[0].TryGetCurrentPattern(SelectionItemPattern.Pattern,out scalePattern))uniformScale=((SelectionItemPattern)scalePattern).Current.IsSelected;
    string viewHash=CaptureHeader(hwnd,"draft-editor-private.png",height);
    if(action=="capture-draft-editor"){Done(new{at=DateTime.UtcNow.ToString("o"),status="owned_draft_editor_observed",editorTitle=title,editorTitleSha256=titleHash,viewSha256=viewHash,width=width,height=height,canvasLeft=30,canvasTop=100,canvasRight=canvasRight,canvasBottom=height-70,scaleStep=scaleStep,uniformScale=uniformScale,controls=controls,targetProcessId=pid,targetProcessStartUtc=ProcessStartUtc(pid),targetSha256=Get("targetSha256",""),targetInputSent=false});return;}
    if(!AutomationElement.FromHandle(FindVisibleProcessWindow(pid,"PrintExp")).Current.IsEnabled)throw new Exception("DRAFT_MODAL_NOTICE_REQUIRES_READBACK");
    if(Get("draftEditorAuthorized","")!="True"||Get("draftNoPrint","")!="True"||titleHash!=Get("expectedEditorTitleSha256","")||width!=Number("expectedWidth")||height!=Number("expectedHeight")||pid!=Number("expectedProcessId")||ProcessStartUtc(pid)!=Get("expectedProcessStartUtc",""))throw new Exception("DRAFT_AUTHORIZATION_OR_INSTANCE_CHANGED");
    ScopeFresh(Get("observationAt",""));
    if(action=="draft-editor-control"){
     string id=Get("draftControlId","");if(!elements.ContainsKey(id))throw new Exception("DRAFT_CONTROL_NOT_ALLOWED");var e=elements[id];var b=e.Current.BoundingRectangle;
     if(!e.Current.IsEnabled||hashes[id]!=Get("expectedControlSha256",""))throw new Exception("DRAFT_CONTROL_CHANGED_REOBSERVE_REQUIRED");
     double scaleAmount;if(id=="17046"&&(!uniformScale||scaleStep!=Get("expectedScaleStep","")||!Double.TryParse(scaleStep,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out scaleAmount)||scaleAmount<=0||scaleAmount>10))throw new Exception("DRAFT_SCALE_STEP_OR_MODE_CHANGED");
     object p;if(id=="17208"&&(!e.TryGetCurrentPattern(TogglePattern.Pattern,out p)||((TogglePattern)p).Current.ToggleState!=ToggleState.Off))throw new Exception("OUTER_CONTOUR_MUST_BE_OFF");
     var hit=AutomationElement.FromPoint(new System.Windows.Point(b.Left+b.Width/2,b.Top+b.Height/2));if(id=="17038"&&hit.Current.ProcessId==(int)pid){var parent=TreeWalker.ControlViewWalker.GetParent(hit);if(!Automation.Compare(hit,e)&&(parent==null||!Automation.Compare(parent,e)))throw new Exception("DRAFT_SCALE_FIELD_OCCLUDED");}else if(hit.Current.ProcessId!=(int)pid||hit.Current.AutomationId!=id||hit.Current.Name!=e.Current.Name)throw new Exception("DRAFT_CONTROL_OCCLUDED");
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,controlId=id,automaticRetry=false,scope="OWNED_REGISTRATION_DRAFT_ONLY",pressDurationMs=id=="17046"?200:0});sent=true;
     if(id=="17046"){if(GetForegroundWindow()!=hwnd||!SetCursorPos((int)(b.Left+b.Width/2),(int)(b.Top+b.Height/2)))throw new Exception("DRAFT_SCALE_FOCUS_CHANGED");INPUT down=new INPUT();down.union.mouse.flags=0x0002;INPUT up=new INPUT();up.union.mouse.flags=0x0004;try{sentEvents=SendInput(1,new[]{down},Marshal.SizeOf(typeof(INPUT)));if(sentEvents!=1)throw new Exception("DRAFT_SCALE_DOWN_NOT_SENT");System.Threading.Thread.Sleep(200);}finally{sentEvents+=SendInput(1,new[]{up},Marshal.SizeOf(typeof(INPUT)));}}
     else sentEvents=SendMouseClick(hwnd,(int)(b.Left+b.Width/2),(int)(b.Top+b.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
    }else{
     int x1=Number("x1"),y1=Number("y1"),x2=Number("x2"),y2=Number("y2");
     bool pointSelect=Get("draftPointOnly","")=="True",textureTransform=Get("draftTextureTransform","")=="True";if(Math.Min(x1,x2)<30||Math.Min(y1,y2)<100||Math.Max(x1,x2)>=canvasRight||Math.Max(y1,y2)>=height-70||(pointSelect?(x2!=x1||y2!=y1):(textureTransform?(Math.Abs(x2-x1)<10||Math.Abs(y2-y1)<10):(x2-x1<10||y2-y1<10))))throw new Exception("DRAFT_SELECTION_OUTSIDE_CANVAS");if(textureTransform&&(pointSelect||!uniformScale||!elements.ContainsKey("17046")||!elements["17046"].Current.IsEnabled))throw new Exception("SELECTED_UNIFORM_TEXTURE_REQUIRED");
     string reference=Path.GetFullPath(Path.Combine(folder,Get("referenceView","")));if(!reference.StartsWith(Path.Combine(folder,"runs")+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(reference)!="draft-editor-private.png"||Hash(File.ReadAllBytes(reference))!=Get("referenceViewSha256",""))throw new Exception("DRAFT_REFERENCE_CHANGED");
     using(var original=new Bitmap(reference))using(var current=new Bitmap(Path.Combine(runDir,"draft-editor-private.png"))){if(original.Width!=width||original.Height!=height)throw new Exception("DRAFT_REFERENCE_DIMENSIONS_CHANGED");bool full=pointSelect||textureTransform;int checkLeft=full?30:x1,checkTop=full?100:y1,checkRight=full?canvasRight-1:x2,checkBottom=full?height-71:y2;for(int draftY=checkTop;draftY<=checkBottom;draftY++)for(int draftX=checkLeft;draftX<=checkRight;draftX++)if(original.GetPixel(draftX,draftY).ToArgb()!=current.GetPixel(draftX,draftY).ToArgb())throw new Exception("DRAFT_PIXELS_CHANGED_REOBSERVE_REQUIRED");}
     foreach(var point in new[]{new System.Windows.Point(r.Left+x1,r.Top+y1),new System.Windows.Point(r.Left+x2,r.Top+y2)}){var hit=AutomationElement.FromPoint(point);if(hit.Current.ProcessId!=(int)pid||hit.Current.ControlType==ControlType.Button||hit.Current.ControlType==ControlType.Edit||hit.Current.ControlType==ControlType.ScrollBar)throw new Exception("DRAFT_ENDPOINT_NOT_CANVAS");}
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,automaticRetry=false,scope="OWNED_REGISTRATION_DRAFT_ONLY"});if(GetForegroundWindow()!=hwnd||!SetCursorPos(r.Left+x1,r.Top+y1))throw new Exception("DRAFT_FOREGROUND_CHANGED");
     INPUT down=new INPUT();down.union.mouse.flags=0x0002;INPUT up=new INPUT();up.union.mouse.flags=0x0004;sent=true;
     try{sentEvents=SendInput(1,new[]{down},Marshal.SizeOf(typeof(INPUT)));if(sentEvents!=1)throw new Exception("DRAFT_DRAG_DOWN_NOT_SENT");for(int step=1;step<=12;step++){if(GetForegroundWindow()!=hwnd||!SetCursorPos(r.Left+x1+(x2-x1)*step/12,r.Top+y1+(y2-y1)*step/12))throw new Exception("DRAFT_DRAG_FOCUS_CHANGED");System.Threading.Thread.Sleep(20);}}finally{sentEvents+=SendInput(1,new[]{up},Marshal.SizeOf(typeof(INPUT)));}if(sentEvents!=2)throw new Exception("PARTIAL_DRAG_INPUT_NO_RETRY");
    }
    Done(new{at=DateTime.UtcNow.ToString("o"),status="draft_input_sent_requires_readback",action=action,controlId=Get("draftControlId",""),targetInputSent=sent,eventsSent=sentEvents,printStartButtonClicked=false,hardwareAction=false,automaticRetry=false});return;
   }
   if(action=="capture-template-editor"||action=="open-texture-import"){
    var editor=AutomationElement.FromHandle(hwnd);if(!editor.Current.Name.StartsWith("编辑模板 - ")){var windows=editor.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Window));var candidates=new List<AutomationElement>();foreach(AutomationElement w in windows)if(w.Current.Name.StartsWith("编辑模板 - "))candidates.Add(w);if(candidates.Count!=1)throw new Exception("UNIQUE_TEMPLATE_EDITOR_REQUIRED");editor=candidates[0];}
    if(!editor.Current.IsEnabled||editor.Current.IsOffscreen||!DialogIsForeground(hwnd,editor))throw new Exception("EDITOR_NOT_ACTIVE");
    if(action=="capture-template-editor"){var er=editor.Current.BoundingRectangle;CaptureHeader(GetForegroundWindow(),"template-editor-private.png",Math.Min(2000,(int)er.Height));}
    var buttons=editor.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"17071"),new PropertyCondition(AutomationElement.NameProperty,"导入贴图"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(buttons.Count!=1||!buttons[0].Current.IsEnabled||buttons[0].Current.IsOffscreen)throw new Exception("EXACT_TEXTURE_IMPORT_REQUIRED");var button=buttons[0];var textureBounds=button.Current.BoundingRectangle;string hash;using(var b=new Bitmap((int)textureBounds.Width,(int)textureBounds.Height))using(var g=Graphics.FromImage(b))using(var stream=new MemoryStream()){g.CopyFromScreen((int)textureBounds.X,(int)textureBounds.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(stream,ImageFormat.Png);var bytes=stream.ToArray();File.WriteAllBytes(Path.Combine(runDir,"texture-import-button.png"),bytes);hash=Hash(bytes);}
    string titleHash=Hash(Encoding.UTF8.GetBytes(editor.Current.Name));
    if(action=="open-texture-import"){
     if(Get("textureImportNavigationAuthorized","")!="True"||hash!=Get("expectedControlSha256","")||titleHash!=Get("expectedEditorTitleSha256",""))throw new Exception("TEXTURE_IMPORT_AUTHORIZATION_OR_STATE_CHANGED");var hit=AutomationElement.FromPoint(new System.Windows.Point(textureBounds.X+textureBounds.Width/2,textureBounds.Y+textureBounds.Height/2));if(hit.Current.ProcessId!=editor.Current.ProcessId||hit.Current.AutomationId!="17071"||hit.Current.Name!="导入贴图")throw new Exception("TEXTURE_BUTTON_OCCLUDED");Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,automaticRetry=false});sent=true;sentEvents=SendMouseClick(hwnd,(int)(textureBounds.X+textureBounds.Width/2),(int)(textureBounds.Y+textureBounds.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
    }
    Done(new{at=DateTime.UtcNow.ToString("o"),status=action=="capture-template-editor"?"texture_import_button_observed":"texture_import_open_sent_requires_dialog_readback",action=action,editorTitleSha256=titleHash,controlSha256=hash,controlId="17071",controlName="导入贴图",targetInputSent=sent,eventsSent=sentEvents,templateSaved=false});return;
   }
   if(action=="capture-z-panel"||action=="close-z-panel"||action=="set-z-target"||action=="position-z-once"){
    var zr=AutomationElement.FromHandle(hwnd);if(zr.Current.Name!="Z轴控制面板"&&zr.Current.Name!="Z axis control panel"){
     var panels=zr.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.NameProperty,"Z轴控制面板"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Window)));
     if(panels.Count!=1)throw new Exception("UNIQUE_Z_PANEL_REQUIRED");zr=panels[0];}
    if(!DialogIsForeground(hwnd,zr)||zr.Current.IsOffscreen||!zr.Current.IsEnabled)throw new Exception("Z_PANEL_NOT_ACTIVE");
    var zn=zr.FindAll(TreeScope.Descendants,Condition.TrueCondition);var data=new List<object>();
    foreach(AutomationElement e in zn){var zc=e.Current;object vp;string value=null;if(e.TryGetCurrentPattern(ValuePattern.Pattern,out vp)){string raw=((ValuePattern)vp).Current.Value;double number;if(Double.TryParse(raw,out number))value=raw;}
     var rect=zc.BoundingRectangle;if(rect.IsEmpty||Double.IsInfinity(rect.X)||Double.IsInfinity(rect.Y))continue;data.Add(new{name=zc.Name,id=zc.AutomationId,type=zc.ControlType.ProgrammaticName,enabled=zc.IsEnabled,offscreen=zc.IsOffscreen,numericValue=value,x=rect.X,y=rect.Y,width=rect.Width,height=rect.Height});}
    string stateHash=Hash(Encoding.UTF8.GetBytes(json.Serialize(data)));var rb=zr.Current.BoundingRectangle;if(rb.Width<200||rb.Height<150||rb.Width>1600||rb.Height>1200)throw new Exception("Z_PANEL_BOUNDS_UNEXPECTED");
    string zh;using(var bitmap=new Bitmap((int)rb.Width,(int)rb.Height))using(var g=Graphics.FromImage(bitmap))using(var stream=new MemoryStream()){g.CopyFromScreen((int)rb.X,(int)rb.Y,0,0,bitmap.Size,CopyPixelOperation.SourceCopy);if(!DialogIsForeground(hwnd,zr))throw new Exception("FOREGROUND_CHANGED");bitmap.Save(stream,ImageFormat.Png);var bytes=stream.ToArray();File.WriteAllBytes(Path.Combine(runDir,"z-panel.png"),bytes);zh=Hash(bytes);}
    AutomationElement zMain;bool? zMainEnabled;string zMainReason;string zJobState=ObserveZMainJobState(zr,pid,out zMain,out zMainEnabled,out zMainReason);

    if(action=="set-z-target"||action=="position-z-once"){
     if((DateTime.UtcNow-DateTime.Parse(Get("createdAt","")).ToUniversalTime()).TotalSeconds>120)throw new Exception("Z_COMMAND_EXPIRED");
     if(Get("heightActionAuthorized","")!="True"||Get("operatorReadyConfirmed","")!="True"||Get("coordinateSemanticsConfirmed","")!="True"||Get("limitsConfirmed","")!="True"||stateHash!=Get("expectedPanelStateSha256",""))throw new Exception("Z_AUTHORIZATION_OR_STATE_CHANGED");
     double target=Double.Parse(Get("targetMm",""),System.Globalization.CultureInfo.InvariantCulture),approved=Double.Parse(Get("approvedTargetMm",""),System.Globalization.CultureInfo.InvariantCulture);
     if(Double.IsNaN(target)||Double.IsInfinity(target)||target<=0||target!=approved)throw new Exception("APPROVED_Z_TARGET_REQUIRED");
     var ze=zr.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"118"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit)));
     var zp=zr.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"110"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Text)));
     var zb=zr.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"109"),new PropertyCondition(AutomationElement.NameProperty,"定位高度"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
     if(ze.Count!=1||zp.Count!=1||zb.Count!=1||!ze[0].Current.IsEnabled||ze[0].Current.IsOffscreen||!zb[0].Current.IsEnabled||zb[0].Current.IsOffscreen)throw new Exception("EXACT_Z_CONTROLS_REQUIRED");
     object valueObject;if(!ze[0].TryGetCurrentPattern(ValuePattern.Pattern,out valueObject))throw new Exception("Z_VALUE_INTERFACE_MISSING");var valuePattern=(ValuePattern)valueObject;if(valuePattern.Current.IsReadOnly)throw new Exception("Z_TARGET_READ_ONLY");
     var main=zMain;if(main==null||zJobState=="unknown")throw new Exception("MAIN_Z_JOB_STATE_UNKNOWN");
     var ready=main.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"31028"));if(ready==null||ready.Current.Name!="设备就绪")throw new Exception("DEVICE_NOT_READY");
     if(!main.Current.IsEnabled||ReadJobState(main)!="idle")throw new Exception("ACTIVE_OR_UNKNOWN_Z_JOB");
     string position=zp[0].Current.Name;if(position!=Get("expectedPositionText",""))throw new Exception("Z_POSITION_CHANGED");
     string targetText=target.ToString("0.###",System.Globalization.CultureInfo.InvariantCulture);
     if(action=="set-z-target"){
      Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,targetMm=target,automaticRetry=false});sent=true;inputRoute="UIA ValuePattern exact edit 118";valuePattern.SetValue(targetText);
      string observed=valuePattern.Current.Value;if(observed!=targetText)throw new Exception("Z_TARGET_WRITE_READBACK_MISMATCH");
      Done(new{at=DateTime.UtcNow.ToString("o"),status="z_target_value_written",action=action,targetMm=target,valueReadback=observed,positionTextAfter=zp[0].Current.Name,targetInputSent=true,motionControlClicked=false});return;
     }
     double entered;if(!Double.TryParse(valuePattern.Current.Value,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out entered)||entered!=target)throw new Exception("Z_TARGET_NOT_ENTERED");
     var br=zb[0].Current.BoundingRectangle;var hit=AutomationElement.FromPoint(new System.Windows.Point(br.X+br.Width/2,br.Y+br.Height/2));if(hit.Current.ProcessId!=zr.Current.ProcessId||hit.Current.AutomationId!="109")throw new Exception("Z_POSITION_BUTTON_OCCLUDED");
     Save("z-position-attempt.json",new{at=DateTime.UtcNow.ToString("o"),targetMm=target,positioningOutcome="requires_readback",historicalHeightLockRetired=true});
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,targetMm=target,automaticRetry=false});sent=true;inputRoute="Win32 SendInput exact positioning button 109";sentEvents=SendMouseClick(hwnd,(int)(br.X+br.Width/2),(int)(br.Y+br.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
     Done(new{at=DateTime.UtcNow.ToString("o"),status="z_position_click_sent_requires_physical_readback",action=action,targetMm=target,eventsSent=sentEvents,targetInputSent=true,motionControlClicked=true,automaticRetry=false});return;
    }
    if(action=="close-z-panel"){
     if(Get("zPanelCloseAuthorized","")!="True"||stateHash!=Get("expectedPanelStateSha256",""))throw new Exception("Z_PANEL_CHANGED_OR_CLOSE_NOT_AUTHORIZED");
     var exit=zr.FindFirst(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"124"),new PropertyCondition(AutomationElement.NameProperty,"退出"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
     if(exit==null||!exit.Current.IsEnabled||exit.Current.IsOffscreen)throw new Exception("EXIT_WITHOUT_SAVE_NOT_FOUND");var er=exit.Current.BoundingRectangle;
     var hit=AutomationElement.FromPoint(new System.Windows.Point(er.X+er.Width/2,er.Y+er.Height/2));if(hit.Current.ProcessId!=zr.Current.ProcessId||hit.Current.AutomationId!="124")throw new Exception("EXIT_OCCLUDED");
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,scope="Exit Z panel without saving; no height or movement changes",automaticRetry=false});sent=true;inputRoute="Win32 SendInput: exact Z panel Exit";sentEvents=SendMouseClick(hwnd,(int)(er.X+er.Width/2),(int)(er.Y+er.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
     Done(new{at=DateTime.UtcNow.ToString("o"),status="z_panel_exit_sent_requires_readback",action=action,eventsSent=sentEvents,targetInputSent=true,heightChanged=false,motionControlClicked=false});return;
    }
    Done(new{at=DateTime.UtcNow.ToString("o"),status="z_panel_observed_readonly",title=zr.Current.Name,controls=data,panelStateSha256=stateHash,screenshotSha256=zh,mainWindowObserved=zMain!=null,mainWindowEnabled=zMainEnabled,activeJobState=zJobState,mainStateReadReason=zMainReason,targetPath=Get("targetPath",""),targetSha256=Get("targetSha256",""),targetProcessId=pid,targetProcessStartUtc=ProcessStartUtc(pid),targetWindowHandle=ProcessMainHandle(pid),targetInputSent=false,heightChanged=false});return;
   }
   if(action=="open-z-panel"){
    if(Get("zPanelAuthorized","")!="True")throw new Exception("Z_PANEL_NAVIGATION_NOT_AUTHORIZED");
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("WINDOW_SIZE_CHANGED");
    var zr=AutomationElement.FromHandle(hwnd);if(!zr.Current.IsEnabled)throw new Exception("MAIN_DISABLED");
    foreach(string id in new[]{"17099","17077","11027","1324"}){var busy=zr.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,id));if(busy==null||busy.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_JOB");}
    var scan=zr.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));if(scan==null||!scan.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_SCAN");
    var matches=zr.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"11048"),new PropertyCondition(AutomationElement.NameProperty,"Z轴"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(matches.Count!=1||!matches[0].Current.IsEnabled||matches[0].Current.IsOffscreen)throw new Exception("UNIQUE_Z_PANEL_BUTTON_REQUIRED");
    ReadVisualControls(hwnd);if(Hash(File.ReadAllBytes(Path.Combine(runDir,"control-11048.png")))!=Get("expectedControlSha256",""))throw new Exception("Z_BUTTON_CHANGED");
    var b=matches[0].Current.BoundingRectangle;var hit=AutomationElement.FromPoint(new System.Windows.Point(b.X+b.Width/2,b.Y+b.Height/2));if(hit.Current.ProcessId!=zr.Current.ProcessId||hit.Current.AutomationId!="11048")throw new Exception("Z_BUTTON_OCCLUDED");
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,scope="Open Z control panel only; no height values or motion controls",automaticRetry=false});sent=true;inputRoute="Win32 SendInput: exact Z panel button";
    sentEvents=SendMouseClick(hwnd,(int)(b.X+b.Width/2),(int)(b.Y+b.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
    Done(new{at=DateTime.UtcNow.ToString("o"),status="z_panel_click_sent_requires_readback",action=action,eventsSent=sentEvents,targetInputSent=true,heightChanged=false,motionControlClicked=false,automaticRetry=false});return;
   }
   if(action=="capture-print-evidence"){
    var evidenceRoot=AutomationElement.FromHandle(hwnd);var log=evidenceRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17112"));if(log==null)throw new Exception("LOG_CONTROL_MISSING");
    var rows=log.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ListItem));var data=new List<object>();foreach(AutomationElement row in rows){var children=row.FindAll(TreeScope.Descendants,Condition.TrueCondition);var texts=new List<object>();foreach(AutomationElement child in children)texts.Add(new{name=child.Current.Name,type=child.Current.ControlType.ProgrammaticName});data.Add(new{name=row.Current.Name,children=texts});}
    var template=evidenceRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"1606"));object selection;var selectedNames=new List<string>();if(template!=null&&template.TryGetCurrentPattern(SelectionPattern.Pattern,out selection))foreach(AutomationElement item in ((SelectionPattern)selection).Current.GetSelection())selectedNames.Add(item.Current.Name);
    var loadedNames=new List<string>();if(template!=null){var loaded=template.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ListItem));foreach(AutomationElement item in loaded)loadedNames.Add(item.Current.Name);}
    Done(new{at=DateTime.UtcNow.ToString("o"),status="private_print_evidence_observed",privacy="Local ephemeral raw UI text; redact before USB storage",logRows=data,selectedTemplates=selectedNames,loadedTemplates=loadedNames,targetInputSent=false});return;
   }
   if(action=="capture-view"){
    if(r.Right-r.Left<1000||r.Bottom-r.Top<600)throw new Exception("MAIN_WINDOW_REQUIRED");
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");
    using(var b=new Bitmap(r.Right-r.Left,r.Bottom-r.Top))using(var g=Graphics.FromImage(b)){g.CopyFromScreen(r.Left,r.Top,0,0,b.Size,CopyPixelOperation.SourceCopy);if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");b.Save(Path.Combine(runDir,"viewport-private.png"),ImageFormat.Png);}
    object observed=ReadVisualControls(hwnd);Done(new{at=DateTime.UtcNow.ToString("o"),status="private_viewport_captured",privacy="Temporary local observation only; exclude screenshot from USB delivery",width=r.Right-r.Left,height=r.Bottom-r.Top,controls=observed,targetInputSent=false});return;
   }
   if(action=="capture-import-dialog"||action=="fill-import-file"||action=="submit-import-once"){
    var dialog=AutomationElement.FromHandle(hwnd);if(dialog.Current.Name!="打开"){
     var dialogs=dialog.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.NameProperty,"打开"),new PropertyCondition(AutomationElement.ClassNameProperty,"#32770")));
     if(dialogs.Count!=1)throw new Exception("UNIQUE_OPEN_DIALOG_REQUIRED");dialog=dialogs[0];
    }
    var types=dialog.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"1136"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ComboBox)));
    if(types.Count!=1)throw new Exception("UNIQUE_FILE_TYPE_REQUIRED");
    var type=types[0];var typeBounds=type.Current.BoundingRectangle;string selected=null;object typePattern;
    if(type.TryGetCurrentPattern(ValuePattern.Pattern,out typePattern))selected=((ValuePattern)typePattern).Current.Value;
    if(type.TryGetCurrentPattern(SelectionPattern.Pattern,out typePattern)){var selectedItems=((SelectionPattern)typePattern).Current.GetSelection();if(selectedItems.Length==1)selected=selectedItems[0].Current.Name;}
    if(!DialogIsForeground(hwnd,dialog))throw new Exception("FOREGROUND_CHANGED");
    using(var b=new Bitmap((int)typeBounds.Width,(int)typeBounds.Height))using(var g=Graphics.FromImage(b)){g.CopyFromScreen((int)typeBounds.X,(int)typeBounds.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(Path.Combine(runDir,"file-type.png"),ImageFormat.Png);}

    var filenameControls=dialog.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"1148"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit)));
    var opens=dialog.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"1"),new PropertyCondition(AutomationElement.NameProperty,"打开(O)"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(filenameControls.Count!=1||opens.Count!=1||!filenameControls[0].Current.IsEnabled||filenameControls[0].Current.IsOffscreen||!opens[0].Current.IsEnabled||opens[0].Current.IsOffscreen)throw new Exception("EXACT_FILE_DIALOG_CONTROLS_REQUIRED");
    object filenamePattern;if(!filenameControls[0].TryGetCurrentPattern(ValuePattern.Pattern,out filenamePattern))throw new Exception("FILENAME_VALUE_INTERFACE_MISSING");var fp=(ValuePattern)filenamePattern;if(fp.Current.IsReadOnly)throw new Exception("FILENAME_READ_ONLY");
    string field=fp.Current.Value;var db=dialog.Current.BoundingRectangle;var fb=filenameControls[0].Current.BoundingRectangle;var ob=opens[0].Current.BoundingRectangle;
    string dialogHash=Hash(Encoding.UTF8.GetBytes(json.Serialize(new{fileType=selected,filenameSha256=Hash(Encoding.UTF8.GetBytes(field)),x=db.X,y=db.Y,width=db.Width,height=db.Height,editX=fb.X,editY=fb.Y,openX=ob.X,openY=ob.Y})));
    if(action=="capture-import-dialog"){
     var observedHit=AutomationElement.FromPoint(new System.Windows.Point(ob.X+ob.Width/2,ob.Y+ob.Height/2));var hc=observedHit.Current;var hb=hc.BoundingRectangle;
     Save("open-hit.json",new{name=hc.Name,id=hc.AutomationId,type=hc.ControlType.ProgrammaticName,sameProcess=hc.ProcessId==dialog.Current.ProcessId,openBounds=new{x=ob.X,y=ob.Y,width=ob.Width,height=ob.Height},hitBounds=new{x=hb.X,y=hb.Y,width=hb.Width,height=hb.Height}});
     using(var b=new Bitmap((int)ob.Width,(int)ob.Height))using(var g=Graphics.FromImage(b)){g.CopyFromScreen((int)ob.X,(int)ob.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(Path.Combine(runDir,"open-button.png"),ImageFormat.Png);}
    }
    if(action!="capture-import-dialog"){
     if(Get("importAuthorized","")!="True"||Get("importOnlyNoPrintConfirmed","")!="True"||(selected!=Get("expectedFileType","图片文件(*.tif)")||(selected!="图片文件(*.tif)"&&selected!="图片文件 (*.tif;*.pdf;*.ai)"))||dialogHash!=Get("expectedDialogStateSha256",""))throw new Exception("IMPORT_AUTHORIZATION_OR_DIALOG_CHANGED");
     string file=Get("filePath","");if(!Path.IsPathRooted(file)||Path.GetExtension(file).ToLowerInvariant()!=".tif"||!File.Exists(file))throw new Exception("LOCAL_TIFF_REQUIRED");var fi=new FileInfo(file);if(fi.Length<8||fi.Length>268435456)throw new Exception("TIFF_SIZE_NOT_ALLOWED");byte[] data=File.ReadAllBytes(file);string fileHash=Hash(data);if(fileHash!=Get("fileSha256",""))throw new Exception("TIFF_CHANGED");if(!((data[0]==73&&data[1]==73&&data[2]==42&&data[3]==0)||(data[0]==77&&data[1]==77&&data[2]==0&&data[3]==42)))throw new Exception("TIFF_SIGNATURE_REQUIRED");
     var mains=AutomationElement.RootElement.FindAll(TreeScope.Children,new AndCondition(new PropertyCondition(AutomationElement.ProcessIdProperty,dialog.Current.ProcessId),new PropertyCondition(AutomationElement.NameProperty,"PrintExp")));if(mains.Count!=1)throw new Exception("MAIN_READY_STATE_UNKNOWN");var main=mains[0];var ready=main.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"31028"));if(ready==null||ready.Current.Name!="设备就绪")throw new Exception("DEVICE_NOT_READY");
     if(action=="fill-import-file"){
      Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,fileSha256=fileHash,automaticRetry=false});sent=true;inputRoute="UIA ValuePattern exact filename edit 1148";fp.SetValue(file);if(fp.Current.Value!=file)throw new Exception("FILENAME_READBACK_MISMATCH");
      Done(new{at=DateTime.UtcNow.ToString("o"),status="import_filename_written",action=action,fileSha256=fileHash,fileBytes=data.Length,targetInputSent=true,fileSubmitted=false,printClicked=false});return;
     }
     if(selected=="图片文件 (*.tif;*.pdf;*.ai)"){
      if(command.ContainsKey("newDraftGuardPath")){ValidateNewDraftGuard(pid);}else{string original=Get("templateOriginalSha256",""),template=Get("templateFilePath",""),backup=Get("templateBackupPath","");if(original.Length!=64||!Path.IsPathRooted(template)||!Path.IsPathRooted(backup)||String.Equals(template,backup,StringComparison.OrdinalIgnoreCase)||!File.Exists(template)||!File.Exists(backup)||Hash(File.ReadAllBytes(template))!=original||Hash(File.ReadAllBytes(backup))!=original)throw new Exception("TEMPLATE_OR_VERIFIED_BACKUP_CHANGED");}
     }
     if(!String.Equals(field,file,StringComparison.Ordinal))throw new Exception("IMPORT_FIELD_FILE_MISMATCH");var hit=AutomationElement.FromPoint(new System.Windows.Point(ob.X+ob.Width/2,ob.Y+ob.Height/2));if(hit.Current.ProcessId!=dialog.Current.ProcessId||hit.Current.AutomationId!="1"||hit.Current.Name!="打开(O)")throw new Exception("OPEN_BUTTON_OCCLUDED");
     Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,fileSha256=fileHash,automaticRetry=false});sent=true;inputRoute="Win32 SendInput exact Open file button";sentEvents=SendMouseClick(hwnd,(int)(ob.X+ob.Width/2),(int)(ob.Y+ob.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
     Done(new{at=DateTime.UtcNow.ToString("o"),status="import_open_sent_requires_acceptance_readback",action=action,fileSha256=fileHash,fileBytes=data.Length,eventsSent=sentEvents,targetInputSent=true,fileSubmitted=true,printClicked=false,automaticRetry=false});return;
    }
    Done(new{at=DateTime.UtcNow.ToString("o"),status="import_dialog_observed",dialogTitle="打开",fileType=selected,fileTypeScreenshot="file-type.png",filenameSha256=Hash(Encoding.UTF8.GetBytes(field)),filenameEmpty=field.Length==0,dialogStateSha256=dialogHash,filenameId="1148",openButtonId="1",targetInputSent=false});return;

   }
   if(action=="set-scan-height"){
    if(Get("scanHeightAuthorized","")!="True"||Get("operatorReadyConfirmed","")!="True"||(DateTime.UtcNow-DateTime.Parse(Get("createdAt","")).ToUniversalTime()).TotalSeconds>120)throw new Exception("CURRENT_SCAN_HEIGHT_CONFIRMATION_REQUIRED");
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("WINDOW_SIZE_CHANGED");var main=AutomationElement.FromHandle(hwnd);if(main.Current.Name!="PrintExp"||!main.Current.IsEnabled)throw new Exception("MAIN_WINDOW_REQUIRED");
    foreach(string id in new[]{"17099","17077","11027","1324"}){var busy=main.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,id));if(busy==null||busy.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_JOB");}
    var scan=main.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));var ready=main.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"31028"));if(scan==null||!scan.Current.IsEnabled||ready==null||ready.Current.Name!="设备就绪")throw new Exception("SCAN_STATE_NOT_READY");
    var fields=main.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"35008"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit)));if(fields.Count!=1||!fields[0].Current.IsEnabled||fields[0].Current.IsOffscreen)throw new Exception("EXACT_SCAN_HEIGHT_REQUIRED");object vp;if(!fields[0].TryGetCurrentPattern(ValuePattern.Pattern,out vp))throw new Exception("SCAN_HEIGHT_VALUE_INTERFACE_MISSING");var value=(ValuePattern)vp;if(value.Current.IsReadOnly||value.Current.Value!=Get("expectedScanHeight",""))throw new Exception("SCAN_HEIGHT_CHANGED");
    ReadVisualControls(hwnd);if(Hash(File.ReadAllBytes(Path.Combine(runDir,"scan-panel.png")))!=Get("expectedPanelSha256",""))throw new Exception("SCAN_PANEL_CHANGED");double target=Double.Parse(Get("approvedHeightMm",""),System.Globalization.CultureInfo.InvariantCulture);if(Double.IsNaN(target)||Double.IsInfinity(target)||target<=0)throw new Exception("APPROVED_SCAN_HEIGHT_REQUIRED");string text=target.ToString("0.###",System.Globalization.CultureInfo.InvariantCulture);
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,targetMm=target,automaticRetry=false});sent=true;inputRoute="UIA ValuePattern exact scan height 35008";value.SetValue(text);if(value.Current.Value!=text)throw new Exception("SCAN_HEIGHT_READBACK_MISMATCH");Done(new{at=DateTime.UtcNow.ToString("o"),status="scan_height_value_written",action=action,approvedHeightMm=target,valueReadback=text,targetInputSent=true,scanStarted=false,motionControlClicked=false});return;
   }
   beforeHash=CaptureHeader(hwnd,"before.png");
   if(action=="capture-controls"){object controls=ReadVisualControls(hwnd);if(((List<object>)controls).Count<4)throw new Exception("EXPECTED_MAIN_VISUAL_CONTROLS_MISSING");var observedRoot=AutomationElement.FromHandle(hwnd);Done(new{at=DateTime.UtcNow.ToString("o"),status="controls_observed",headerSha256=beforeHash,x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,controls=controls,mainWindowEnabled=observedRoot.Current.IsEnabled,activeJobState=ReadJobState(observedRoot),targetPath=Get("targetPath",""),targetProcessId=pid,targetProcessStartUtc=ProcessStartUtc(pid),targetWindowHandle=hwnd.ToInt64(),targetSha256=Get("targetSha256",""),targetInputSent=false});return;}
   if(action=="capture"){Done(new{at=DateTime.UtcNow.ToString("o"),status="captured",headerSha256=beforeHash,x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,targetInputSent=false});return;}
   if(action=="select-products"){
    if(Get("selectionAuthorized","")!="True")throw new Exception("CURRENT_SELECTION_AUTHORIZATION_REQUIRED");
    int x1=Number("x1"),y1=Number("y1"),x2=Number("x2"),y2=Number("y2");
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("WINDOW_SIZE_CHANGED");
    if(x1<30||y1<300||x2>=r.Right-r.Left-600||y2>=r.Bottom-r.Top-190||x2-x1<10||y2-y1<10||x2-x1>1000||y2-y1>800)throw new Exception("RECTANGLE_OUTSIDE_CANVAS_LIMITS");
    var selectionRoot=AutomationElement.FromHandle(hwnd);if(!selectionRoot.Current.IsEnabled)throw new Exception("MAIN_WINDOW_DISABLED_OR_MODAL");
    foreach(string busyId in new[]{"11027","17099","17077"}){var busy=selectionRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,busyId));if(busy==null||busy.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_JOB");}
    var scanIdle=selectionRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));if(scanIdle==null||!scanIdle.Current.IsEnabled)throw new Exception("SCAN_OR_VALIDATION_BUSY");
    string reference=Path.GetFullPath(Path.Combine(folder,Get("referenceView","")));if(!reference.StartsWith(Path.Combine(folder,"runs")+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)||Path.GetFileName(reference)!="viewport-private.png")throw new Exception("REFERENCE_OUTSIDE_LOCAL_OBSERVATION");
    if(Hash(File.ReadAllBytes(reference))!=Get("referenceViewSha256",""))throw new Exception("REFERENCE_IMAGE_CHANGED");
    using(var original=new Bitmap(reference))using(var current=new Bitmap(x2-x1+1,y2-y1+1))using(var g=Graphics.FromImage(current)){
     if(original.Width!=r.Right-r.Left||original.Height!=r.Bottom-r.Top)throw new Exception("REFERENCE_DIMENSIONS_CHANGED");
     if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");g.CopyFromScreen(r.Left+x1,r.Top+y1,0,0,current.Size,CopyPixelOperation.SourceCopy);
     for(int pixelY=0;pixelY<current.Height;pixelY++)for(int pixelX=0;pixelX<current.Width;pixelX++)if(current.GetPixel(pixelX,pixelY).ToArgb()!=original.GetPixel(x1+pixelX,y1+pixelY).ToArgb())throw new Exception("SELECTION_PIXELS_CHANGED_REOBSERVE_REQUIRED");
    }
    foreach(var point in new[]{new System.Windows.Point(r.Left+x1,r.Top+y1),new System.Windows.Point(r.Left+x2,r.Top+y2)}){var hit=AutomationElement.FromPoint(point);if(hit.Current.ProcessId!=selectionRoot.Current.ProcessId||hit.Current.ControlType==ControlType.Button||hit.Current.ControlType==ControlType.Edit||hit.Current.ControlType==ControlType.ScrollBar)throw new Exception("SELECTION_ENDPOINT_NOT_CANVAS");}
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),action=action,automaticRetry=false,scope="CURRENT_USER_AUTHORIZED_CANVAS_RECTANGLE"});
    if(GetForegroundWindow()!=hwnd||!SetCursorPos(r.Left+x1,r.Top+y1))throw new Exception("FOREGROUND_OR_POINTER_CHANGED_BEFORE_DRAG");
    INPUT down=new INPUT();down.union.mouse.flags=0x0002;INPUT up=new INPUT();up.union.mouse.flags=0x0004;
    sent=true;inputRoute="Win32 SendInput: current-image-bound canvas rectangle";
    try{sentEvents=SendInput(1,new[]{down},Marshal.SizeOf(typeof(INPUT)));if(sentEvents!=1)throw new Exception("DRAG_DOWN_NOT_SENT_NO_RETRY");for(int step=1;step<=12;step++){if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_DURING_DRAG");if(!SetCursorPos(r.Left+x1+(x2-x1)*step/12,r.Top+y1+(y2-y1)*step/12))throw new Exception("DRAG_MOVE_FAILED");System.Threading.Thread.Sleep(20);}}
    finally{sentEvents+=SendInput(1,new[]{up},Marshal.SizeOf(typeof(INPUT)));}
    if(sentEvents!=2)throw new Exception("PARTIAL_DRAG_INPUT_NO_RETRY");
    Done(new{at=DateTime.UtcNow.ToString("o"),status="rectangle_drag_sent_requires_visual_readback",action=action,eventsSent=sentEvents,targetInputSent=true,scanButtonClicked=false,printStartButtonClicked=false,automaticRetry=false});return;
   }
   if(action=="scan-region-control"){
    var regionRoot=AutomationElement.FromHandle(hwnd);if(!regionRoot.Current.IsEnabled)throw new Exception("MAIN_WINDOW_DISABLED");
    var start=regionRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));if(start==null||!start.Current.IsEnabled)throw new Exception("SCAN_BUSY_OR_UNKNOWN");
    ReadVisualControls(hwnd);if(Hash(File.ReadAllBytes(Path.Combine(runDir,"scan-panel.png")))!=Get("expectedPanelSha256",""))throw new Exception("SCAN_PANEL_CHANGED_REOBSERVE_REQUIRED");
    string choice=Get("regionControl","");int[] zones=choice=="zones-1-2-3-4"?new[]{1,2,3,4}:choice=="zones-5-6-7"?new[]{5,6,7}:choice=="zones-1-2-3"?new[]{1,2,3}:choice=="zones-2-3"?new[]{2,3}:choice=="zone-1"?new[]{1}:choice=="zone-2"?new[]{2}:choice=="zone-3"?new[]{3}:choice=="zone-4"?new[]{4}:new int[0];bool selectZone=zones.Length>0;if(choice!="all-toggle"&&choice!="expand"&&!selectZone)throw new Exception("REGION_CONTROL_NOT_ALLOWED");
    string targetId=choice=="all-toggle"?"17208":"99";ControlType type=choice=="all-toggle"?ControlType.CheckBox:ControlType.ComboBox;
    var candidates=regionRoot.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,targetId),new PropertyCondition(AutomationElement.ControlTypeProperty,type)));
    if(candidates.Count!=1||!candidates[0].Current.IsEnabled||candidates[0].Current.IsOffscreen)throw new Exception("UNIQUE_REGION_CONTROL_REQUIRED");
    var rect=candidates[0].Current.BoundingRectangle;int pointX=choice=="all-toggle"?(int)rect.Left+8:(int)rect.Right-8,pointY=(int)(rect.Top+rect.Height/2);
    var area=regionRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17138"));if(area==null||Math.Abs(pointY-area.Current.BoundingRectangle.Top)>35)throw new Exception("REGION_CONTROL_OUTSIDE_OBSERVED_ROW");
    var pointHit=AutomationElement.FromPoint(new System.Windows.Point(pointX,pointY));if(pointHit.Current.AutomationId!=targetId&&TreeWalker.ControlViewWalker.GetParent(pointHit).Current.AutomationId!=targetId)throw new Exception("REGION_CONTROL_OCCLUDED");
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_INPUT");inputRoute="Win32 SendInput: verified scan region control";sent=true;sentEvents=SendMouseClick(hwnd,pointX,pointY);if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
    System.Threading.Thread.Sleep(250);
    if(selectZone){
     IntPtr combo=new IntPtr(candidates[0].Current.NativeWindowHandle);COMBOBOXINFO info=new COMBOBOXINFO();info.cbSize=Marshal.SizeOf(typeof(COMBOBOXINFO));
     if(!GetComboBoxInfo(combo,ref info)||!IsWindowVisible(info.hwndList))throw new Exception("REGION_POPUP_NOT_VISIBLE");
     int count=ReadControlNumber(combo,0x0146,IntPtr.Zero,IntPtr.Zero).ToInt32();if(count!=16)throw new Exception("REGION_LIST_LAYOUT_CHANGED");
     foreach(int zone in zones){
     RECT item=new RECT();if(ReadListRect(info.hwndList,0x0198,new IntPtr(zone-1),ref item).ToInt64()<0||item.Bottom-item.Top<12||item.Bottom-item.Top>50)throw new Exception("REGION_ITEM_BOUNDS_UNAVAILABLE");
     POINT origin=new POINT();if(!ClientToScreen(info.hwndList,ref origin))throw new Exception("REGION_POPUP_POSITION_UNAVAILABLE");
     uint popupPid;GetWindowThreadProcessId(GetForegroundWindow(),out popupPid);if(!String.Equals(ImagePath((int)popupPid),Get("targetPath",""),StringComparison.OrdinalIgnoreCase))throw new Exception("FOREGROUND_CHANGED_BEFORE_REGION_SELECTION");
     RECT popup;if(!GetWindowRect(info.hwndList,out popup))throw new Exception("NO_POPUP_RECT");
     using(var b=new Bitmap(popup.Right-popup.Left,Math.Min(100,popup.Bottom-popup.Top)))using(var g=Graphics.FromImage(b)){g.CopyFromScreen(popup.Left,popup.Top,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(Path.Combine(runDir,"region-list-before.png"),ImageFormat.Png);}
     uint selectionEvents=SendMouseClick(GetForegroundWindow(),origin.X+item.Left+10,origin.Y+(item.Top+item.Bottom)/2);sentEvents+=selectionEvents;if(selectionEvents!=2)throw new Exception("PARTIAL_REGION_INPUT_NO_RETRY");
     System.Threading.Thread.Sleep(250);
     }
     if(selectZone){uint closePid;GetWindowThreadProcessId(GetForegroundWindow(),out closePid);if(!String.Equals(ImagePath((int)closePid),Get("targetPath",""),StringComparison.OrdinalIgnoreCase))throw new Exception("FOREGROUND_CHANGED_BEFORE_DROPDOWN_CLOSE");uint closeEvents=SendMouseClick(GetForegroundWindow(),pointX,pointY);sentEvents+=closeEvents;if(closeEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");System.Threading.Thread.Sleep(150);}
    }
    uint afterPid;GetWindowThreadProcessId(GetForegroundWindow(),out afterPid);if(!String.Equals(ImagePath((int)afterPid),Get("targetPath",""),StringComparison.OrdinalIgnoreCase))throw new Exception("FOREGROUND_CHANGED_AFTER_REGION_INPUT");
    var regionArea=area.Current.BoundingRectangle;var scanArea=start.Current.BoundingRectangle;int pl=(int)regionArea.Left-4,pt=(int)regionArea.Top-4,pw=r.Right-pl-8,ph=(int)scanArea.Bottom-pt+4;
    using(var pb=new Bitmap(pw,ph))using(var pg=Graphics.FromImage(pb)){pg.CopyFromScreen(pl,pt,0,0,pb.Size,CopyPixelOperation.SourceCopy);pb.Save(Path.Combine(runDir,"after-scan-panel.png"),ImageFormat.Png);}
    Done(new{at=DateTime.UtcNow.ToString("o"),status="region_control_clicked_requires_visual_readback",control=choice,eventsSent=sentEvents,targetInputSent=true,scanButtonClicked=false,printStartButtonClicked=false});return;
   }
   if(action=="scan-once"){
    if(Get("scanOnlyAuthorized","")!="True"||Get("operatorReadyConfirmed","")!="True")throw new Exception("CURRENT_SCAN_ONLY_AUTHORIZATION_REQUIRED");
    if(Get("approvedRegions","")!=""){if(Get("approvedRegions","")!="1,2,3"&&Get("approvedRegions","")!="1,2,3,4")throw new Exception("REGION_SET_NOT_ALLOWED");ReadVisualControls(hwnd);if(Hash(File.ReadAllBytes(Path.Combine(runDir,"scan-panel.png")))!=Get("expectedPanelSha256",""))throw new Exception("APPROVED_SCAN_REGIONS_OR_PARAMETERS_CHANGED");}
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight")||beforeHash!=Get("expectedHeaderSha256",""))throw new Exception("SCAN_LAYOUT_CHANGED_REOBSERVE_REQUIRED");
    var scanRoot=AutomationElement.FromHandle(hwnd);if(!scanRoot.Current.IsEnabled)throw new Exception("MODAL_OR_DISABLED_MAIN_WINDOW");
    if(ReadJobState(scanRoot)!="idle")throw new Exception("ACTIVE_OR_UNKNOWN_SCAN_JOB");
    foreach(string pauseId in new[]{"11027","17099"}){var pauses=scanRoot.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,pauseId));foreach(AutomationElement pause in pauses)if(pause.Current.IsEnabled)throw new Exception("POSSIBLE_ACTIVE_JOB_STOP_SCAN_TEST");}
    var ready=scanRoot.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"31028"),new PropertyCondition(AutomationElement.NameProperty,"设备就绪")));if(ready.Count!=1)throw new Exception("SOFTWARE_READY_INDICATOR_REQUIRED");
    var heights=scanRoot.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"35008"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit)));object heightPattern;if(heights.Count!=1||!heights[0].TryGetCurrentPattern(ValuePattern.Pattern,out heightPattern)||((ValuePattern)heightPattern).Current.Value!=Get("expectedScanHeight",""))throw new Exception("SCAN_HEIGHT_CHANGED");
    var scans=scanRoot.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"),new PropertyCondition(AutomationElement.NameProperty,"开始扫描"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(scans.Count!=1||!scans[0].Current.IsEnabled||scans[0].Current.IsOffscreen)throw new Exception("UNIQUE_ENABLED_SCAN_BUTTON_REQUIRED");
    var scanBounds=scans[0].Current.BoundingRectangle;if(scanBounds.Width<10||scanBounds.Width>300||scanBounds.Height<10||scanBounds.Height>100)throw new Exception("INVALID_SCAN_BOUNDS");
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_SCAN");
    byte[] scanImage;using(var b=new Bitmap((int)scanBounds.Width,(int)scanBounds.Height))using(var g=Graphics.FromImage(b))using(var s=new MemoryStream()){g.CopyFromScreen((int)scanBounds.X,(int)scanBounds.Y,0,0,b.Size,CopyPixelOperation.SourceCopy);b.Save(s,ImageFormat.Png);scanImage=s.ToArray();File.WriteAllBytes(Path.Combine(runDir,"scan-button.png"),scanImage);}
    if(Hash(scanImage)!=Get("expectedControlSha256",""))throw new Exception("SCAN_BUTTON_CHANGED_REOBSERVE_REQUIRED");
    var hit=AutomationElement.FromPoint(new System.Windows.Point(scanBounds.X+scanBounds.Width/2,scanBounds.Y+scanBounds.Height/2));if(hit.Current.AutomationId!="17070"||hit.Current.Name!="开始扫描")throw new Exception("SCAN_BUTTON_OCCLUDED");
    inputRoute="Win32 SendInput: one verified Start Scan click";
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),status="scan_input_about_to_be_sent",automaticRetry=false,scope="CURRENT_USER_AUTHORIZED_SCAN_ONLY"});
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_SCAN");sent=true;sentEvents=SendMouseClick(hwnd,(int)(scanBounds.X+scanBounds.Width/2),(int)(scanBounds.Y+scanBounds.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");
    Done(new{at=DateTime.UtcNow.ToString("o"),status="scan_click_sent_requires_machine_and_ui_verification",route=inputRoute,eventsSent=sentEvents,targetInputSent=true,scanButtonClicked=true,approvedRegions=Get("approvedRegions","not specified in this command"),printStartButtonClicked=false,automaticRetry=false});return;
   }
   if(action=="print-once"){
    if(Get("printAuthorized","")!="True"||Get("operatorReadyConfirmed","")!="True")throw new Exception("CURRENT_PRINT_AUTHORIZATION_REQUIRED");
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("PRINT_WINDOW_SIZE_CHANGED");
    var printRoot=AutomationElement.FromHandle(hwnd);if(!printRoot.Current.IsEnabled)throw new Exception("MAIN_WINDOW_DISABLED_OR_MODAL");
    foreach(string busyId in new[]{"11027","17099","17077"}){var busy=printRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,busyId));if(busy==null||busy.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_JOB");}
    var scanIdle=printRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));if(scanIdle==null||!scanIdle.Current.IsEnabled)throw new Exception("SCAN_OR_VALIDATION_BUSY");
    var count=printRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17338"));if(count==null||count.Current.Name!=Get("expectedProductCount",""))throw new Exception("PRODUCT_COUNT_CHANGED");
    var rows=printRoot.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.ListItem));bool verified=false;string latestRecognition=null;foreach(AutomationElement row in rows){string name=row.Current.Name;if(name.Contains("成功识别"))latestRecognition=name;if(name==Get("expectedVerificationLine",""))verified=true;}if(!verified||latestRecognition!=Get("expectedVerificationLine",""))throw new Exception("LATEST_PRODUCT_VERIFICATION_MISSING_OR_CHANGED");
    var template=printRoot.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"1606"));object selection;if(template==null||!template.TryGetCurrentPattern(SelectionPattern.Pattern,out selection))throw new Exception("SELECTED_TEMPLATE_UNAVAILABLE");var selected=((SelectionPattern)selection).Current.GetSelection();if(selected.Length!=1||Hash(Encoding.UTF8.GetBytes(selected[0].Current.Name))!=Get("expectedTemplateSha256",""))throw new Exception("SELECTED_TEMPLATE_CHANGED");
    var prints=printRoot.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"17061"),new PropertyCondition(AutomationElement.NameProperty,"打印"),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(prints.Count!=1||!prints[0].Current.IsEnabled||prints[0].Current.IsOffscreen)throw new Exception("UNIQUE_ENABLED_VISUAL_PRINT_BUTTON_REQUIRED");
    ReadVisualControls(hwnd);if(Hash(File.ReadAllBytes(Path.Combine(runDir,"control-17061.png")))!=Get("expectedControlSha256",""))throw new Exception("PRINT_BUTTON_CHANGED");if(Hash(File.ReadAllBytes(Path.Combine(runDir,"scan-panel.png")))!=Get("expectedPanelSha256",""))throw new Exception("SCAN_PARAMETERS_CHANGED");
    var printBounds=prints[0].Current.BoundingRectangle;var hit=AutomationElement.FromPoint(new System.Windows.Point(printBounds.X+printBounds.Width/2,printBounds.Y+printBounds.Height/2));if(hit.Current.AutomationId!="17061"||hit.Current.Name!="打印")throw new Exception("PRINT_BUTTON_OCCLUDED");
    inputRoute="Win32 SendInput: one verified visual Print click";Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),status="print_input_about_to_be_sent",automaticRetry=false,scope="CURRENT_EXPLICIT_USER_PRINT_AUTHORIZATION"});
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_PRINT");sent=true;sentEvents=SendMouseClick(hwnd,(int)(printBounds.X+printBounds.Width/2),(int)(printBounds.Y+printBounds.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_PRINT_INPUT_NO_RETRY");
    Done(new{at=DateTime.UtcNow.ToString("o"),status="print_click_sent_requires_software_and_physical_readback",route=inputRoute,eventsSent=sentEvents,printStartButtonClicked=true,expectedProductCount=Get("expectedProductCount",""),targetInputSent=true,automaticRetry=false});return;
   }
   if(action=="open-template-import"||action=="open-template-editor"||action=="open-new-template"||action=="verify-product"){
    if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("WINDOW_SIZE_CHANGED");
    var root=AutomationElement.FromHandle(hwnd);
    bool verify=action=="verify-product";string buttonId=verify?"17075":action=="open-new-template"?"17072":action=="open-template-editor"?"35006":"17098",buttonName=verify?"产品验证":action=="open-new-template"?"新建":action=="open-template-editor"?"编辑":"导入";
    if(!root.Current.IsEnabled)throw new Exception("MAIN_WINDOW_DISABLED");foreach(string bid in new[]{"17099","17077","11027","1324"}){var busy=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,bid));if(busy==null||busy.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_JOB");}
    if(action=="open-template-editor"&&Get("templateEditorNavigationAuthorized","")!="True")throw new Exception("EDITOR_NAVIGATION_NOT_AUTHORIZED");
    if(action=="open-new-template"&&(Get("newTemplateNavigationAuthorized","")!="True"||ReadJobState(root)!="idle"))throw new Exception("NEW_TEMPLATE_AUTHORIZATION_OR_IDLE_REQUIRED");
    if(verify){if(Get("productVerificationAuthorized","")!="True"||!root.Current.IsEnabled)throw new Exception("VERIFICATION_AUTHORIZATION_OR_IDLE_STATE_MISSING");var scanReady=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17070"));var cancel=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.AutomationIdProperty,"17077"));if(scanReady==null||!scanReady.Current.IsEnabled||cancel==null||cancel.Current.IsEnabled)throw new Exception("ACTIVE_OR_UNKNOWN_WORKFLOW");}
    var matches=root.FindAll(TreeScope.Descendants,new AndCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,buttonId),new PropertyCondition(AutomationElement.NameProperty,buttonName),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button)));
    if(matches.Count!=1)throw new Exception("UNIQUE_TEMPLATE_IMPORT_BUTTON_REQUIRED");
    var button=matches[0];if(!button.Current.IsEnabled||button.Current.IsOffscreen)throw new Exception("IMPORT_NOT_AVAILABLE");
    ReadVisualControls(hwnd);
    if(Hash(File.ReadAllBytes(Path.Combine(runDir,"control-"+buttonId+".png")))!=Get("expectedControlSha256",""))throw new Exception("BUTTON_CHANGED_REOBSERVE_REQUIRED");
    object invoke;if(!button.TryGetCurrentPattern(InvokePattern.Pattern,out invoke))throw new Exception("INVOKE_PATTERN_UNAVAILABLE");
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED_BEFORE_INPUT");
    string requestedRoute=Get("inputRoute","uia");if(requestedRoute!="uia"&&requestedRoute!="native-mouse")throw new Exception("IMPORT_ROUTE_NOT_ALLOWED");
    inputRoute=requestedRoute=="uia"?"UIA Invoke: exact approved button":"Win32 SendInput: verified approved button center";sent=true;
    Save("dispatch.json",new{at=DateTime.UtcNow.ToString("o"),status="single_input_started_outcome_requires_readback",automationId=buttonId,targetInputMayHaveBeenSent=true,automaticRetry=false});
    if(requestedRoute=="uia")((InvokePattern)invoke).Invoke();else{var importBounds=button.Current.BoundingRectangle;sentEvents=SendMouseClick(hwnd,(int)(importBounds.X+importBounds.Width/2),(int)(importBounds.Y+importBounds.Height/2));if(sentEvents!=2)throw new Exception("PARTIAL_INPUT_NO_RETRY");}
    Done(new{at=DateTime.UtcNow.ToString("o"),status="input_returned_requires_dialog_verification",action=action,route=inputRoute,eventsSent=sentEvents,targetInputSent=true,printerCommandSent=false,fileSubmitted=false});return;
   }
   string page=Get("page","");if(Array.IndexOf(pageNames,page)<0)throw new Exception("PAGE_NOT_ALLOWED");
   if(r.Right-r.Left!=Number("expectedWidth")||r.Bottom-r.Top!=Number("expectedHeight"))throw new Exception("WINDOW_SIZE_CHANGED");
   if(beforeHash!=Get("expectedHeaderSha256",""))throw new Exception("HEADER_CHANGED_REOBSERVE_REQUIRED");
   int x=Number("x"),y=Number("y");
   // Only the observed top navigation band. The machine toolbar begins below it.
   if(y<25||y>85||x<160||x>r.Right-r.Left-100)throw new Exception("POINT_OUTSIDE_NAVIGATION_BAND");
   var element=AutomationElement.FromPoint(new System.Windows.Point(r.Left+x,r.Top+y));
   object pattern;var c=element.Current;var bounds=c.BoundingRectangle;
   if(c.Name==page&&bounds.Top>=r.Top+20&&bounds.Bottom<=r.Top+105&&element.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern)){
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");sent=true;inputRoute="UIA SelectionItem";((SelectionItemPattern)pattern).Select();sentEvents=0;
   }else if(c.Name==page&&bounds.Top>=r.Top+20&&bounds.Bottom<=r.Top+105&&element.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){
    if(GetForegroundWindow()!=hwnd)throw new Exception("FOREGROUND_CHANGED");sent=true;inputRoute="UIA Invoke";((InvokePattern)pattern).Invoke();sentEvents=0;
   }else{inputRoute="Win32 SendInput to freshly verified header point";sent=true;sentEvents=SendMouseClick(hwnd,r.Left+x,r.Top+y);if(sentEvents!=2){throw new Exception("PARTIAL_INPUT_NO_RETRY");}}
   sent=true;ticks=0;
  }catch(Exception ex){Done(new{at=DateTime.UtcNow.ToString("o"),status="blocked",error=ex.Message,inputMayHaveBeenSent=sent,route=inputRoute,eventsSent=sentEvents,automaticRetry=false,printInputMayHaveBeenSent=action=="print-once"&&sent,scanInputMayHaveBeenSent=action=="scan-once"&&sent});}
 }
 [STAThread]public static void Main(){SetProcessDPIAware();Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);try{Application.Run(new MenuCompat());}catch(Exception ex){File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"startup-error.json"),new JavaScriptSerializer().Serialize(new{status="blocked",error=ex.Message,targetInputSent=false}));}}
}

