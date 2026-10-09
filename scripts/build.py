"""Build the audited, dependency-free Node runtime from pinned MIT source."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / 'third_party' / 'codex-usage-badge'


def replace_once(source, before, after):
    if source.count(before) != 1:
        raise ValueError('Pinned upstream source changed; adaptation needs review')
    return source.replace(before, after)


def build(native=False):
    manifest = json.loads((VENDOR / 'SOURCE.json').read_text(encoding='utf-8'))
    for path, expected in manifest['sha256'].items():
        if hashlib.sha256((VENDOR / path).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Upstream checksum mismatch: {path}')
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    cdp = (VENDOR / 'src/cdp.js').read_text(encoding='utf-8')
    cdp = replace_once(cdp,
        "return [installUsageBadge,installProjectColors,installProjectSizes,installThreadTokens].map(fn=>`(${fn.toString()})()`).join(';\\n');",
        "return `(${installQuotaOrbit.toString()})()`;")
    cdp = cdp.replace('__codexUsageBadge', '__codexOrbit')
    app_server = (VENDOR / 'src/app-server.js').read_text(encoding='utf-8').replace("name:'codex_usage_badge',title:'Codex Usage Badge'", "name:'codex_orbit',title:'Codex 果味额度条'")
    parts = [f"/* Codex 果味额度条 {version}; includes MIT-licensed codex-usage-badge code. */\n'use strict';\nconst AGENT_VERSION={json.dumps(version)};",
             (VENDOR / 'src/rate-limits.js').read_text(encoding='utf-8'), (VENDOR / 'src/resolve.js').read_text(encoding='utf-8'),
             app_server, cdp, (ROOT / 'src/orbit-values.cjs').read_text(encoding='utf-8'),
             (ROOT / 'src/injected-orbit.js').read_text(encoding='utf-8'), (ROOT / 'src/agent.cjs').read_text(encoding='utf-8')]
    output = ROOT / 'build'
    (output / 'startup').mkdir(parents=True, exist_ok=True)
    (output / 'agent.cjs').write_text('\n\n'.join(parts) + '\n',encoding='utf-8')
    for name in ['watch.cjs','controller.cjs']:
        (output / 'startup' / name).write_bytes((VENDOR / 'macos/startup' / name).read_bytes())
    from adapt import adapt
    adapt(ROOT, VENDOR, output, version)
    if native:
        subprocess.run(['clang','-fobjc-arc','-O2','-mmacosx-version-min=14.0','-arch','arm64','-arch','x86_64',
                        '-framework','AppKit','-framework','ApplicationServices',
                        str(VENDOR / 'macos/startup/bridge.m'),'-o',str(output / 'startup/bridge')],check=True)
        subprocess.run(['codesign','--force','--sign','-',str(output / 'startup/bridge')],check=True)
    print('Built:', output / 'agent.cjs')


if __name__ == '__main__':
    build('--native' in sys.argv)
