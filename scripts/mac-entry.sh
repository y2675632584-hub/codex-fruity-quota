#!/bin/bash
set -u
cd "$(dirname "$0")/.." || exit 1
orbit_node=""
for orbit_candidate in "${CODEX_ORBIT_NODE:-}" \
  "${CODEX_ORBIT_APP:-/Applications/Codex.app}/Contents/Resources/cua_node/bin/node" \
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" \
  "$HOME/Applications/Codex.app/Contents/Resources/cua_node/bin/node" \
  "$HOME/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" \
  "$(command -v node 2>/dev/null || true)"; do
  if [ -x "$orbit_candidate" ] && "$orbit_candidate" -e 'if(+process.versions.node.split(".")[0]<24)process.exit(1)' >/dev/null 2>&1; then
    orbit_node="$orbit_candidate"
    break
  fi
done
if [ -z "$orbit_node" ]; then
  echo "未找到 Node.js 24+。请设置 CODEX_ORBIT_NODE，或安装 Node.js 24 LTS。"
  orbit_result=1
else
  "$orbit_node" ./macos/manage.cjs "$1"
  orbit_result=$?
fi
echo
read -r -p "按回车关闭…" _ || true
exit "$orbit_result"
