"""Build allowlisted macOS and Windows ZIPs, with per-file and release digests."""
from pathlib import Path
import hashlib,json,stat,zipfile,argparse
ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
MAC=['build/agent.cjs','build/startup/watch.cjs','build/startup/controller.cjs','build/startup/bridge','build/updater/core.cjs','build/updater/worker.cjs','build/update.json','scripts/mac-entry.sh','macos/manage.cjs','macos/transaction.cjs','安装.command','打开 Codex.command','诊断.command','停止.command','卸载.command','立即更新.command','更新诊断.command','开启自动更新.command','关闭自动更新.command','README.md','README.en.md','VERIFICATION.md','LICENSE','THIRD_PARTY_NOTICES.md','third_party/codex-usage-badge/LICENSE','third_party/codex-usage-badge/SOURCE.json']
WIN={'agent.cjs':'build/agent.cjs','README-Windows.md':'docs/windows.md','LICENSE':'LICENSE','UPSTREAM_LICENSE':'third_party/codex-usage-badge/LICENSE','THIRD_PARTY_NOTICES.md':'THIRD_PARTY_NOTICES.md'}
for name in ['manage-windows.ps1','bridge.cjs','update.cjs','update-windows.ps1','update.json','Install.cmd','Launch.cmd','Status.cmd','Uninstall.cmd','Update.cmd','startup/controller.cjs','startup/windows.cjs','startup/windows-bridge.ps1','startup/windows-native.cs']:WIN[name]='build/windows/'+name

def package(platform):
    mapping={name:name for name in MAC} if platform=='macOS' else WIN
    sums_name='FILE_SHA256SUMS' if platform=='macOS' else 'SHA256SUMS.txt'
    folder=f'CodexOrbit-{platform}-{VERSION}'
    dist=ROOT/'dist';dist.mkdir(exist_ok=True);target=dist/(folder+'.zip')
    sums=[]
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
        for name,source in mapping.items():
            data=(ROOT/source).read_bytes()
            if source.endswith(('.cjs','.sh','.command','.ps1','.cmd')) and b'/Users/yyy' in data:raise ValueError('Personal path: '+source)
            sums.append(hashlib.sha256(data).hexdigest()+'  '+name)
            executable=name.endswith(('.sh','.command')) or name=='build/startup/bridge'
            item=zipfile.ZipInfo(folder+'/'+name);item.create_system=3;item.external_attr=(stat.S_IFREG|(0o755 if executable else 0o644))<<16;item.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(item,data)
        z.writestr(folder+'/'+sums_name,'\n'.join(sums)+'\n')
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        assert set(z.namelist())=={folder+'/'+name for name in mapping}|{folder+'/'+sums_name}
    print(target)
    return target

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--platform',choices=['macOS','Windows','all'],default='all');args=parser.parse_args()
    paths=[package(p) for p in (['macOS','Windows'] if args.platform=='all' else [args.platform])]
    lines=''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in paths)
    (ROOT/'dist/SHA256SUMS.txt').write_text(lines,encoding='utf-8')
