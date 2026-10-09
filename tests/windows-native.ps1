$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$base=Join-Path $root 'build/windows'
foreach($file in @(Get-ChildItem -LiteralPath $base -Recurse -Filter '*.ps1')) {
    $tokens=$null;$errors=$null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
    if($errors.Count) { throw ($errors | Out-String) }
}
# Compile the actual native helper without starting a watcher or opening Codex.
Add-Type -Path (Join-Path $base 'startup/windows-native.cs') -ReferencedAssemblies System.Management,System.Core,System.Windows.Forms
$type=[CodexOrbit.Startup.Native].Assembly.GetType('CodexOrbit.Startup.InputActivity')
$method=$type.GetMethod('Meaningful',[Reflection.BindingFlags]'NonPublic,Static')
if(!$method.Invoke($null,@([uint32]1,[uint16]0))) { throw 'Keyboard input classification failed' }
if($method.Invoke($null,@([uint32]0,[uint16]0))) { throw 'Pointer movement must not trigger takeover cancellation' }
. (Join-Path $base 'manage-windows.ps1') -Action Functions
foreach($value in @('a b','quote"here','C:\path\')) {
    $quoted=ConvertTo-NativeArgument $value
    if(!$quoted.StartsWith('"') -or !$quoted.EndsWith('"')) { throw 'Argument quoting failed' }
}
. (Join-Path $base 'update-windows.ps1') -Functions
$temp=Join-Path ([IO.Path]::GetTempPath()) ('orbit-ci-'+[guid]::NewGuid().ToString('N'))
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$archive=Join-Path $root ('dist/CodexOrbit-Windows-'+$version+'.zip')
$digest=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
try {
    [void](Expand-ValidatedUpdate $archive $temp $version $digest)
    if(!(Test-Path -LiteralPath (Join-Path $temp 'startup/windows-native.cs'))) { throw 'Required helper missing' }
    $rejected=$false
    try { [void](Expand-ValidatedUpdate $archive ($temp+'-bad') $version ('0'*64)) } catch { $rejected=$true }
    if(!$rejected) { throw 'Invalid archive digest was accepted' }
} finally {
    if(Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force }
}
Write-Host 'Windows: PowerShell parser, native compilation, input classification, argument quoting and archive validation passed.'
