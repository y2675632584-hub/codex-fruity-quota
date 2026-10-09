"""Small, auditable adaptations of checksum-pinned upstream modules."""
import json
from pathlib import Path

def adapt(root, vendor, output, version):
    def source(name): return (vendor / name).read_text(encoding='utf-8')
    def save(name, text):
        p=output/name;p.parent.mkdir(parents=True,exist_ok=True)
        if name.endswith('.ps1'):text='\ufeff'+text.lstrip('\ufeff')
        with p.open('w',encoding='utf-8',newline='') as f:f.write(text)
    release=json.loads((root/'release.json').read_text(encoding='utf-8'))
    required=['build/agent.cjs','macos/manage.cjs','macos/transaction.cjs','build/startup/bridge','build/startup/controller.cjs','build/startup/watch.cjs','build/updater/core.cjs','build/updater/worker.cjs','build/update.json']
    core=source('updater/core.cjs').replace("'use strict';", "'use strict';\nfunction createUpdater(repository){\nif(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\\/[A-Za-z0-9_.-]+$/.test(repository))throw Error('Invalid update repository');",1)
    core=core.replace("const repository='jaykinhoo9/codex-usage-badge';",'')
    start=core.index('const required=');end=core.index(';',start)
    core=core[:start]+'const required='+json.dumps(required)+core[end:]
    core=core.replace('CodexUsageBadge','CodexOrbit').replace('codex-usage-badge-updater-v1','codex-orbit-updater-v1')
    core=core.replace("files.get('update.json')","files.get('build/update.json')").replace('SHA256SUMS.txt','FILE_SHA256SUMS')
    core=core.replace('module.exports={repository,','return {repository,')+'\n}\nmodule.exports={createUpdater};\n'
    save('updater/core.cjs',core)
    save('updater/worker.cjs',(root/'updater/worker.cjs').read_text(encoding='utf-8'))
    save('update.json',json.dumps({'schema':1,'repository':release['repository'],'version':version,'platform':'macOS','allowPrerelease':release.get('allowPrerelease',False)},indent=2)+'\n')
    # Windows keeps the upstream ownership guards, Store discovery, native activation and rollback.
    def brand(text):
        return text.replace('CodexUsageBadge','CodexOrbit').replace('Codex Usage Badge','Codex 果味额度条').replace('codexusagebadge','codexorbit').replace('codex-usage-badge','codex-orbit').replace('CODEX_BADGE_','CODEX_ORBIT_').replace('Codex 用量条','Codex 果味额度条')
    manager=brand(source('windows/manage-windows.ps1')).replace("$script:Version = '0.10.1'",f"$script:Version = '{version}'")
    manager=manager.replace('const{DatabaseSync}=require("node:sqlite");new DatabaseSync(":memory:").close();','').replace('（需 node:sqlite）','')
    manager=manager.replace("'Update.cmd','README-Windows.md'","'Update.cmd','README-Windows.md','LICENSE','UPSTREAM_LICENSE','THIRD_PARTY_NOTICES.md','update.json'")
    manager=manager.replace("已保存的文件夹颜色可能保留，重新安装后可重置。",'')
    save('windows/manage-windows.ps1',manager)
    for name in ['startup/controller.cjs','startup/windows.cjs','startup/windows-bridge.ps1','startup/windows-native.cs','windows/bridge.cjs','windows/update.cjs','windows/update-windows.ps1']:
        text=brand(source(name))
        if name=='windows/bridge.cjs':
            start=text.index('const expressions =');end=text.index('async function evaluate',start)
            text=text[:start]+"const expressions = { cleanup: `(() => { window.__codexOrbit?.destroy?.(); return !document.getElementById('codex-orbit-badge'); })()`, status: `JSON.stringify(window.__codexOrbit?.status() ?? {placed:false})` };\n"+text[end:]
            text=text.replace('window.__codexUsageBadge','window.__codexOrbit')
        if name=='windows/update.cjs':
            text=text.replace("const REPO='jaykinhoo9/codex-orbit';", "const REPO=JSON.parse(fs.readFileSync(path.join(__dirname,'update.json'),'utf8')).repository;\nif(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\\/[A-Za-z0-9_.-]+$/.test(REPO))throw Error('Invalid update repository');")
        if name=='windows/update-windows.ps1':
            text=text.replace("'SHA256SUMS.txt')","'SHA256SUMS.txt','update.json','UPSTREAM_LICENSE','THIRD_PARTY_NOTICES.md')")
            text=text.replace("# The shipped installer provides", "    $metadata=Get-Content -LiteralPath (Join-Path $stage 'update.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n    $previous=Get-Content -LiteralPath (Join-Path $InstallRoot 'update.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n    if($metadata.repository -ne $previous.repository -or $metadata.version -ne $Version -or $metadata.platform -ne 'Windows') { throw 'Update source or version mismatch' }\n    # The shipped installer provides")
        save('windows/'+name.removeprefix('windows/'),text)
    save('windows/update.json',json.dumps({'schema':1,'repository':release['repository'],'version':version,'platform':'Windows'},indent=2)+'\n')

    for name,action in [('Install','Install'),('Launch','Launch'),('Status','Status'),('Uninstall','Uninstall'),('Update','Update')]:
        save('windows/'+name+'.cmd','@echo off\r\nchcp 65001 >nul\r\nsetlocal\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-windows.ps1" -Action '+action+'\r\npause\r\n')
