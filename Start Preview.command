#!/bin/sh
set -eu
cd "$(dirname "$0")"
printf '%s\n' 'Codex Orbit 组件预览：http://127.0.0.1:8765' '按 Ctrl+C 停止。此预览不会修改 Codex。'
exec python3 -m orbit.server
