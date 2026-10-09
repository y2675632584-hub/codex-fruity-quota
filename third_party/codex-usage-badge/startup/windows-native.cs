// Native Windows startup adapter. No keyboard injection, process termination or app patching.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace CodexUsageBadge.Startup {
    // Raw Input reports activity asynchronously. Only event categories and times are inspected;
    // key values, text, pointer coordinates and button identities are never retained.
    internal sealed class InputActivity {
        [StructLayout(LayoutKind.Sequential)] struct Device {
            public ushort page,usage; public uint flags; public IntPtr target;
        }
        [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterRawInputDevices(Device[] devices,uint count,uint size);
        [DllImport("user32.dll",SetLastError=true)] static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
        [DllImport("kernel32.dll")] static extern uint GetTickCount();
        readonly object sync=new object();
        readonly ManualResetEvent ready=new ManualResetEvent(false);
        readonly Thread thread;
        uint lastInput;
        long sequence;
        volatile bool available;
        internal InputActivity() {
            thread=new Thread(Run) {IsBackground=true,Name="Badge startup activity"};
            thread.SetApartmentState(ApartmentState.STA);thread.Start();
            if(!ready.WaitOne(3000)||!available) throw new InvalidOperationException("Startup activity monitor unavailable");
        }
        void Run() {
            try {
                using(var window=new ActivityWindow(this)) {
                    var devices=new[]{new Device {page=1,usage=2,flags=0x100,target=window.Handle},new Device {page=1,usage=6,flags=0x100,target=window.Handle}};
                    if(!RegisterRawInputDevices(devices,2,(uint)Marshal.SizeOf(typeof(Device)))) return;
                    lock(sync) {lastInput=GetTickCount();available=true;}
                    ready.Set();
                    System.Windows.Forms.Application.Run();
                }
            } catch { /* An unavailable monitor disables takeover. */ }
            finally {available=false;ready.Set();}
        }
        internal static bool Meaningful(uint type,ushort flags) {
            // Mouse down/wheel, or keyboard make. Pointer movement and launch-button release are ignored.
            return type==0?(flags&0x0D55)!=0:type==1&&(flags&1)==0;
        }
        void ReadPacket(IntPtr input,IntPtr buffer) {
            uint size=64,header=(uint)(8+2*IntPtr.Size);
            uint count=GetRawInputData(input,0x10000003,buffer,ref size,header);
            if(count==UInt32.MaxValue||count<header+8) {available=false;return;}
            uint type=unchecked((uint)Marshal.ReadInt32(buffer));
            ushort flags=unchecked((ushort)Marshal.ReadInt16(buffer,(int)header+(type==0?4:2)));
            if(Meaningful(type,flags)) lock(sync) {lastInput=GetTickCount();sequence++;}
        }
        internal void Read(out string stamp,out double idle) {
            lock(sync) {
                bool known=available&&thread.IsAlive;
                stamp=known?lastInput+":"+sequence:"unknown";
                idle=known?unchecked(GetTickCount()-lastInput):0;
            }
        }
        sealed class ActivityWindow : System.Windows.Forms.NativeWindow,IDisposable {
            readonly InputActivity owner;
            readonly IntPtr buffer=Marshal.AllocHGlobal(64);
            internal ActivityWindow(InputActivity owner) {
                this.owner=owner;
                CreateHandle(new System.Windows.Forms.CreateParams {Parent=new IntPtr(-3)}); // HWND_MESSAGE
            }
            protected override void WndProc(ref System.Windows.Forms.Message message) {
                if(message.Msg==0x00FF) owner.ReadPacket(message.LParam,buffer); // WM_INPUT
                base.WndProc(ref message);
            }
            public void Dispose() {DestroyHandle();Marshal.FreeHGlobal(buffer);}
        }
    }
    public sealed class App {
        public int pid;
        public string key;
        public double launchedAt;
        public bool finishedLaunching, argumentsKnown, plainLaunch;
        public string debugPort;
    }
    public sealed class Snapshot {
        public App[] apps;
        public int frontmostPid;
        public string inputStamp;
        public double inputIdleMs;
    }
    public static class Native {
        [StructLayout(LayoutKind.Sequential)] struct UniqueProcess {
            public int pid;
            public System.Runtime.InteropServices.ComTypes.FILETIME started;
        }
        [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct ProcessInfo {
            public UniqueProcess process;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string name;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string service;
            public uint type, status, session;
            [MarshalAs(UnmanagedType.Bool)] public bool restartable;
        }
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out int pid);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr window);
        [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window, int command);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CommandLineToArgvW(string text, out int count);
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
        static extern bool QueryFullProcessImageName(IntPtr process,uint flags,StringBuilder value,ref uint length);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr process,ref uint length,StringBuilder value);
        [ComImport,Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] class ActivationManager {}
        [ComImport,Guid("2E941141-7F97-4756-BA1D-9DECDE894A3D"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IActivationManager {
            [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id,[MarshalAs(UnmanagedType.LPWStr)] string args,uint options,out uint pid);
        }
        [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint session, int flags, StringBuilder key);
        [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint session);
        [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint session, uint fileCount, string[] files, uint processCount, UniqueProcess[] processes, uint serviceCount, string[] services);
        [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint session, out uint needed, ref uint count, [In, Out] ProcessInfo[] processes, ref uint reason);
        [DllImport("rstrtmgr.dll")] static extern int RmShutdown(uint session, uint flags, IntPtr callback);
        [DllImport("rstrtmgr.dll")] static extern int RmCancelCurrentTask(uint session);

        static string appPath, stopPath, applicationId;
        static Process parent;
        static InputActivity activity;
        static readonly Dictionary<string,string[]> arguments = new Dictionary<string,string[]>();
        static readonly int sessionId = Process.GetCurrentProcess().SessionId;
        static double Now { get { return (DateTime.UtcNow-new DateTime(1970,1,1)).TotalMilliseconds; } }
        public static void Configure(string app, string stop, int parentPid) {
            appPath=Path.GetFullPath(app); stopPath=stop; parent=Process.GetProcessById(parentPid); applicationId=null;
            if (!File.Exists(appPath)) throw new FileNotFoundException("Desktop executable unavailable");
            if(activity==null) activity=new InputActivity();
        }
        static bool Stopped() { return File.Exists(stopPath) || parent.HasExited; }
        static string Identity(Process p) { return p.Id+":"+p.StartTime.ToUniversalTime().ToFileTimeUtc(); }
        static string ReadApplicationId(Process p) {
            uint length=0;
            int result=GetApplicationUserModelId(p.Handle,ref length,null);
            if(result==15703) return null; // APPMODEL_ERROR_NO_APPLICATION: ordinary desktop executable.
            if(result!=122) throw new System.ComponentModel.Win32Exception(result,"Cannot resolve desktop activation identity");
            var value=new StringBuilder(checked((int)length));
            result=GetApplicationUserModelId(p.Handle,ref length,value);
            if(result!=0) throw new System.ComponentModel.Win32Exception(result,"Cannot resolve desktop activation identity");
            return value.ToString();
        }
        static string ReadImagePath(Process p) {
            var value=new StringBuilder(32768); uint length=(uint)value.Capacity;
            if(!QueryFullProcessImageName(p.Handle,0,value,ref length))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"Cannot resolve desktop executable identity");
            return value.ToString();
        }
        static bool Matches(Process p) {
            // The main module list can still contain the loader when Process.Start
            // returns. Query the process image directly without waiting for modules.
            return !p.HasExited && p.SessionId==sessionId && String.Equals(ReadImagePath(p),appPath,StringComparison.OrdinalIgnoreCase);
        }
        static string[] ReadArguments(Process p) {
            string key=Identity(p); string[] cached;
            if (arguments.TryGetValue(key,out cached)) return cached;
            using (var query=new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId="+p.Id)) {
                query.Options.Timeout=TimeSpan.FromSeconds(2);
                using (var rows=query.Get()) foreach (ManagementObject row in rows) using(row) {
                    string text=row["CommandLine"] as string;
                    if (String.IsNullOrEmpty(text)) return null;
                    int count; IntPtr data=CommandLineToArgvW(text,out count);
                    if (data==IntPtr.Zero) return null;
                    try {
                        var result=new string[count];
                        for (int i=0;i<count;i++) result[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(data,i*IntPtr.Size));
                        arguments[key]=result; return result;
                    } finally { LocalFree(data); }
                }
            }
            return null;
        }
        static App Describe(Process p) {
            if (!Matches(p)) return null;
            string[] args=null;
            try { args=ReadArguments(p); } catch { /* Unknown arguments always disable takeover. */ }
            if (args!=null && args.Any(a=>a.StartsWith("--type=",StringComparison.Ordinal)||a=="--type")) return null;
            string port=null;
            if (args!=null) for(int i=1;i<args.Length;i++) {
                if(args[i].StartsWith("--remote-debugging-port=",StringComparison.Ordinal)) port=args[i].Substring(24);
                if(args[i]=="--remote-debugging-port") port=i+1<args.Length?args[i+1]:"";
            }
            IntPtr window=p.MainWindowHandle;
            return new App {pid=p.Id,key=Identity(p),launchedAt=(p.StartTime.ToUniversalTime()-new DateTime(1970,1,1)).TotalMilliseconds,
                argumentsKnown=args!=null,plainLaunch=args!=null&&args.Length==1,debugPort=port,
                finishedLaunching=window!=IntPtr.Zero&&IsWindowVisible(window)&&IsWindowEnabled(window)};
        }
        public static Snapshot TakeSnapshot() {
            var found=new List<App>();
            foreach(var p in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(appPath))) using(p) {
                try { var app=Describe(p); if(app!=null) found.Add(app); }
                catch (InvalidOperationException) { /* Process exited during inspection. */ }
                catch (System.ComponentModel.Win32Exception) { throw new InvalidOperationException("Cannot inspect a matching desktop process"); }
            }
            if(arguments.Count>256) arguments.Clear();
            string stamp;double idle;activity.Read(out stamp,out idle);
            int foreground; GetWindowThreadProcessId(GetForegroundWindow(),out foreground);
            return new Snapshot {apps=found.ToArray(),frontmostPid=foreground,inputStamp=stamp,inputIdleMs=idle};
        }
        static bool CanQuit(Snapshot s,int pid,string key,string stamp) {
            if(Stopped()||s.apps.Length!=1||s.frontmostPid!=pid||s.inputStamp!=stamp||stamp=="unknown") return false;
            var a=s.apps[0]; double age=Now-a.launchedAt;
            return a.pid==pid&&a.key==key&&a.argumentsKnown&&a.plainLaunch&&a.debugPort==null&&a.finishedLaunching&&age>=0&&age<=8000&&s.inputIdleMs>=age;
        }
        public static object Quit(int pid,string key,string stamp) {
            if(!CanQuit(TakeSnapshot(),pid,key,stamp)) return new {accepted=false,reason="guard"};
            using(var p=Process.GetProcessById(pid)) {
                if(!Matches(p)||Identity(p)!=key) return new {accepted=false,reason="identity"};
                // Capture the actual process identity before closing it; never guess a Store package/version.
                // Failure leaves the original app running rather than attempting an unsupported relaunch.
                applicationId=ReadApplicationId(p);
                return ShutdownProcess(p,()=>CanQuit(TakeSnapshot(),pid,key,stamp),()=>{
                    string current;double idle;activity.Read(out current,out idle);
                    return Stopped()||current!=stamp;
                });
            }
        }
        // Kept separate so OS shutdown/refusal can be tested with a hidden disposable app.
        static object ShutdownProcess(Process p,Func<bool> guard,Func<bool> canceledByUser) {
            uint handle; var sessionKey=new StringBuilder(33);
            int result=RmStartSession(out handle,0,sessionKey);
            if(result!=0) return new {accepted=false,reason="restart-manager-unavailable"};
            try {
                {
                    int pid=p.Id;
                    long ticks=p.StartTime.ToUniversalTime().ToFileTimeUtc();
                    var target=new UniqueProcess {pid=pid,started=new System.Runtime.InteropServices.ComTypes.FILETIME {
                        dwLowDateTime=unchecked((int)ticks),dwHighDateTime=(int)(ticks>>32)}};
                    // Register this exact PID + creation time only, never files/services/dependencies.
                    result=RmRegisterResources(handle,0,null,1,new[]{target},0,null);
                    if(result!=0) return new {accepted=false,reason="register-failed"};
                    uint needed,count=1,reason=0; var list=new ProcessInfo[1];
                    result=RmGetList(handle,out needed,ref count,list,ref reason);
                    if(result!=0||count!=1||reason!=0||list[0].process.pid!=pid||
                        list[0].process.started.dwLowDateTime!=target.started.dwLowDateTime||
                        list[0].process.started.dwHighDateTime!=target.started.dwHighDateTime)
                        return new {accepted=false,reason="ambiguous-target",errorCode=result,processCount=count,rebootReason=reason};
                    if(!guard()) return new {accepted=false,reason="guard"};
                    // Zero flags: never RmForceShutdown. A refusing/hung app is left running.
                    var task=Task.Factory.StartNew(()=>RmShutdown(handle,0,IntPtr.Zero));
                    var timer=Stopwatch.StartNew(); bool canceled=false;
                    while(!task.Wait(50)) {
                        if(!canceled&&(timer.ElapsedMilliseconds>10000||canceledByUser())) {
                            canceled=true; RmCancelCurrentTask(handle);
                        }
                    }
                    return new {accepted=!canceled&&task.Result==0,reason=canceled?"canceled":task.Result==0?"closed":"quit-refused",errorCode=task.Result};
                }
            } finally { RmEndSession(handle); }
        }
        public static object Launch(string stamp,int foreground) {
            var s=TakeSnapshot();
            if(Stopped()||s.apps.Length!=0||s.inputStamp!=stamp||stamp=="unknown"||s.frontmostPid!=foreground) return new {launched=false};
            using(var p=StartApplication()) {
                p.Refresh();
                if(p.HasExited) throw new InvalidOperationException("Activated desktop process exited: "+p.ExitCode);
                if(!Matches(p)) throw new InvalidOperationException("Activated desktop process identity did not match: "+ReadImagePath(p)+", session "+p.SessionId);
                return new {launched=true,pid=p.Id,key=Identity(p)};
            }
        }
        static Process StartApplication() {
            const string flags="--remote-debugging-address=127.0.0.1 --remote-debugging-port=39222";
            if(!String.IsNullOrEmpty(applicationId)) {
                // WindowsApps executables can reject direct Process.Start with access denied.
                // AO_NOERRORUI only: AO_NOSPLASHSCREEN requires package debugging and can terminate the app.
                object manager=new ActivationManager();
                try {
                    uint pid;
                    int result=((IActivationManager)manager).ActivateApplication(applicationId,flags,2,out pid);
                    if(result<0) Marshal.ThrowExceptionForHR(result);
                    return Process.GetProcessById(checked((int)pid));
                } finally { Marshal.ReleaseComObject(manager); }
            }
            var info=new ProcessStartInfo(appPath,flags) {
                UseShellExecute=false,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=Path.GetDirectoryName(appPath)};
            return Process.Start(info);
        }
        public static object Show(int pid,string key,string stamp,int foreground) {
            // Only the verified replacement may receive focus; Store activation can already have shown it.
            var deadline=Stopwatch.StartNew();
            while(deadline.ElapsedMilliseconds<5000) {
                var s=TakeSnapshot();
                if(Stopped()||s.inputStamp!=stamp||(s.frontmostPid!=foreground&&s.frontmostPid!=pid)) return new {shown=false};
                var a=s.apps.FirstOrDefault(x=>x.pid==pid&&x.key==key);
                if(a==null||a.debugPort!="39222"||Now-a.launchedAt>30000) return new {shown=false};
                using(var p=Process.GetProcessById(pid)) {
                    IntPtr window=p.MainWindowHandle;
                    if(window!=IntPtr.Zero) {
                        ShowWindowAsync(window,4); // SW_SHOWNOACTIVATE; foreground permission may be refused by Windows.
                        return new {shown=SetForegroundWindow(window)};
                    }
                }
                Thread.Sleep(100);
            }
            return new {shown=false};
        }
    }
}
