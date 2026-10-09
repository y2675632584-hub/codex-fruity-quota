param([string]$InstallRoot,[string]$Archive,[string]$Version,[string]$Digest,[switch]$ForceUpdate,[switch]$Functions)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Expand-ValidatedUpdate([string]$File,[string]$Target,[string]$ReleaseVersion,[string]$ExpectedDigest) {
    if($ReleaseVersion -notmatch '^\d+\.\d+\.\d+$' -or $ExpectedDigest -notmatch '^[a-f0-9]{64}$') { throw 'Invalid update metadata' }
    if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedDigest) { throw 'Update archive changed before validation' }
    $prefix='CodexUsageBadge-Windows-'+$ReleaseVersion+'/'
    $allowed=@('agent.cjs','manage-windows.ps1','bridge.cjs','update.cjs','update-windows.ps1','Install.cmd','Launch.cmd','Status.cmd','Uninstall.cmd','Update.cmd','README-Windows.md','README.md','CHANGELOG.md','LICENSE','SECURITY.md','docs/windows.md','docs/macos.md','docs/development.md','assets/cover.png','startup/controller.cjs','startup/windows.cjs','startup/windows-bridge.ps1','startup/windows-native.cs','SHA256SUMS.txt')
    $required=@('agent.cjs','manage-windows.ps1','bridge.cjs','update.cjs','update-windows.ps1','Install.cmd','Launch.cmd','Status.cmd','Uninstall.cmd','Update.cmd','README-Windows.md','startup/controller.cjs','startup/windows.cjs','startup/windows-bridge.ps1','startup/windows-native.cs','SHA256SUMS.txt')
    $zip=[IO.Compression.ZipFile]::OpenRead($File)
    try {
        $files=@{};$total=0
        foreach($entry in $zip.Entries) {
            if(!$entry.FullName.StartsWith($prefix,[StringComparison]::Ordinal)) { throw 'Unexpected update archive root' }
            $name=$entry.FullName.Substring($prefix.Length)
            if($name -notin $allowed -or $files.ContainsKey($name) -or $entry.Length -gt 8388608 -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Unexpected or duplicate update archive file' }
            $files[$name]=$entry;$total+=$entry.Length
            if($total -gt 20971520) { throw 'Update expansion exceeds size limit' }
        }
        foreach($name in $required) { if(!$files.ContainsKey($name)) { throw ('Incomplete update package: '+$name) } }
        if($files['SHA256SUMS.txt'].Length -gt 65536) { throw 'Internal update checksum exceeds size limit' }
        $stream=$files['SHA256SUMS.txt'].Open();$reader=New-Object IO.StreamReader($stream)
        try { $manifest=$reader.ReadToEnd() } finally { $reader.Dispose() }
        $sums=@{}
        foreach($line in $manifest -split '\r?\n') {
            if(!$line) { continue }
            if($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid internal update checksum' }
            $name=$Matches[2]
            if(!$files.ContainsKey($name) -or $name -eq 'SHA256SUMS.txt' -or $sums.ContainsKey($name)) { throw 'Unexpected internal update checksum' }
            $sums[$name]=$Matches[1]
        }
        if($sums.Count -ne $files.Count-1) { throw 'Missing internal update checksums' }
        foreach($name in $sums.Keys) {
            $stream=$files[$name].Open();$hash=[Security.Cryptography.SHA256]::Create()
            try { $actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
            finally { $hash.Dispose();$stream.Dispose() }
            if($actual -ne $sums[$name]) { throw ('Internal update checksum mismatch: '+$name) }
        }
        [void][IO.Directory]::CreateDirectory($Target)
        foreach($name in $files.Keys) {
            $destination=Join-Path $Target $name
            [void][IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
            [IO.Compression.ZipFileExtensions]::ExtractToFile($files[$name],$destination,$false)
        }
        $manager=Get-Content -LiteralPath (Join-Path $Target 'manage-windows.ps1') -Raw -Encoding UTF8
        if($manager -notmatch ('\$script:Version\s*=\s*'''+[regex]::Escape($ReleaseVersion)+'''')) { throw 'Installer version mismatch' }
        return $Target
    } finally { $zip.Dispose() }
}
if($Functions) { return }
$stage=$null
try {
    $expected=Join-Path $env:LOCALAPPDATA 'CodexUsageBadge'
    if(![IO.Path]::GetFullPath($InstallRoot).Equals([IO.Path]::GetFullPath($expected),[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected update install directory' }
    $owner=Join-Path $InstallRoot '.codex-usage-badge-owner'
    if(!(Test-Path -LiteralPath $owner) -or (Get-Content -LiteralPath $owner -Raw).Trim() -ne 'local.codexusagebadge.windows') { throw 'Update ownership check failed' }
    $saved=Get-Content -LiteralPath (Join-Path $InstallRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if([version]($saved.Version -split '-')[0] -gt [version]$Version) { throw 'Update cannot downgrade installed version' }
    $stage=Join-Path ([IO.Path]::GetTempPath()) ('badge-update-validated-'+[guid]::NewGuid().ToString('N'))
    [void](Expand-ValidatedUpdate $Archive $stage $Version $Digest)
    # The shipped installer provides the same owned-directory checks and upgrade rollback as manual installation.
    $shell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $installerArgs=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $stage 'manage-windows.ps1'),'-Action','Install','-AutomaticUpdate')
    if($ForceUpdate) { $installerArgs+='-ForceUpdate' }
    & $shell @installerArgs
    if($LASTEXITCODE -ne 0) { throw 'Update installer failed; previous version was preserved by rollback' }
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
finally {
    if($stage) {
        $resolved=[IO.Path]::GetFullPath($stage)
        if($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -like 'badge-update-validated-*') {
            Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
