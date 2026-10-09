param([Parameter(Mandatory=$true)][string]$AppExe,[Parameter(Mandatory=$true)][string]$StopFile,[Parameter(Mandatory=$true)][int]$ParentId)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -Path (Join-Path $PSScriptRoot 'windows-native.cs') -ReferencedAssemblies System.Management,System.Core,System.Windows.Forms
[CodexUsageBadge.Startup.Native]::Configure($AppExe,$StopFile,$ParentId)
# Persistent stdin/stdout RPC: one hidden helper, no repeated PowerShell launches while idle.
while ($null -ne ($line=[Console]::ReadLine())) {
    $request=$null
    try {
        $request=$line | ConvertFrom-Json
        $result=switch($request.action) {
            'snapshot' { [CodexUsageBadge.Startup.Native]::TakeSnapshot() }
            'quit' { [CodexUsageBadge.Startup.Native]::Quit($request.pid,$request.key,$request.stamp) }
            'launch' { [CodexUsageBadge.Startup.Native]::Launch($request.stamp,$request.foreground) }
            'show' { [CodexUsageBadge.Startup.Native]::Show($request.pid,$request.key,$request.stamp,$request.foreground) }
            default { throw 'Unknown startup action' }
        }
        [Console]::WriteLine((@{id=$request.id;result=$result} | ConvertTo-Json -Depth 8 -Compress))
    } catch {
        [Console]::WriteLine((@{id=$request.id;error=$_.Exception.Message} | ConvertTo-Json -Compress))
    }
}
