const resolverFs = require('node:fs');
function isExecutableFile(file) {
  if (!file) return false;
  try {
    resolverFs.accessSync(file, resolverFs.constants.X_OK);
    return resolverFs.statSync(file).isFile();
  } catch { return false; }
}
function resolveCodexBin(explicit, appPath = '/Applications/ChatGPT.app', platform = process.platform) {
  if (explicit && explicit !== 'codex' && isExecutableFile(explicit)) return explicit;
  // New desktop releases bundle the CLI as a nested app and expose a shell entrypoint.
  // Prefer this client's CLI to unrelated installations in the user's shell PATH.
  const candidates = platform === 'win32' ? windowsCodexCandidates(appPath) : [
    `${appPath}/Contents/Resources/codex-cli/bin/codex`,
    `${appPath}/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`,
    `${appPath}/Contents/Resources/codex`
  ];
  const found = candidates.find(isExecutableFile);
  if (!found) throw new Error('找不到客户端内置 Codex 可执行程序，请检查客户端安装');
  return found;
}
function windowsCodexCandidates(appPath) {
  const path = require('node:path');
  const root = /\.exe$/i.test(appPath) ? path.dirname(appPath) : appPath;
  const local = process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local');
  const managed = path.join(local, 'OpenAI', 'Codex', 'bin');
  let versions = [];
  try {
    versions = resolverFs.readdirSync(managed, { withFileTypes: true }).filter(e => e.isDirectory())
      .map(e => path.join(managed, e.name, 'codex.exe')).filter(isExecutableFile)
      .sort((a, b) => resolverFs.statSync(b).mtimeMs - resolverFs.statSync(a).mtimeMs);
  } catch {}
  return [path.join(managed, 'codex.exe'), ...versions,
    path.join(root, 'resources', 'codex.exe'), path.join(root, 'resources', 'codex-cli', 'bin', 'codex.exe'),
    path.join(root, 'resources', 'codex-cli', 'codex.exe')];
}
