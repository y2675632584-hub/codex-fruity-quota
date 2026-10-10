'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const label = 'local.codexorbit.agent';
const startupLabel = 'local.codexorbit.startup';
const updateLabel = 'local.codexorbit.updater';
const root = path.resolve(__dirname, '..');
const home = os.homedir();
const installDir = path.join(home, 'Library/Application Support/CodexOrbit');
const logs = path.join(home, 'Library/Logs/CodexOrbit');
const launchDir = path.join(home, 'Library/LaunchAgents');
const uid = process.getuid?.();
const domain = `gui/${uid}`;
const run = (command, args, options = {}) => execFileSync(command, args, { encoding:'utf8', stdio:['ignore','pipe','pipe'], ...options });
const exists = file => fs.existsSync(file);
function findApp(explicit = process.env.CODEX_ORBIT_APP) {
  const candidates = explicit ? [explicit] : ['/Applications/Codex.app','/Applications/ChatGPT.app',path.join(home,'Applications/Codex.app'),path.join(home,'Applications/ChatGPT.app')];
  return candidates.find(app => ['codex-cli/bin/codex','codex'].some(relative => exists(path.join(app,'Contents/Resources',relative)))) ?? null;
}
function config() { return JSON.parse(fs.readFileSync(path.join(installDir,'settings.json'),'utf8')); }
function xml(value) { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function plist(spec) {
  const encode = value => Array.isArray(value) ? `<array>${value.map(encode).join('')}</array>` : typeof value === 'boolean' ? `<${value}/>` : typeof value === 'number' ? `<integer>${value}</integer>` : value && typeof value === 'object' ? `<dict>${Object.entries(value).map(([key,item])=>`<key>${xml(key)}</key>${encode(item)}`).join('')}</dict>` : `<string>${xml(value)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0">${encode(spec)}</plist>\n`;
}
// bootout returns before launchd finishes removing a terminating job.
// Never kickstart that old job as a substitute for registering the replacement.
function createServiceManager({run,domain,launchDir,exists=fs.existsSync,
  wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=100}) {
  function registered(name) {
    try { run('/bin/launchctl',['print',`${domain}/${name}`]); return true; }
    catch(error) {
      if(/Could not find (?:specified )?service/i.test(String(error.stderr)) || error.status===113)return false;
      throw error;
    }
  }
  async function stop(name) {
    try { run('/bin/launchctl',['bootout',`${domain}/${name}`]); }
    catch(error) { if(registered(name))throw error; }
    for(let i=0;i<attempts;i++) {
      if(!registered(name))return;
      await wait(100);
    }
    throw Error('旧后台尚未完全退出：'+name+'。安装已停止，请稍后重试。');
  }
  async function load(name) {
    const file=path.join(launchDir,`${name}.plist`);
    if(!exists(file))throw Error('请先运行安装.command');
    if(registered(name)) { run('/bin/launchctl',['kickstart',`${domain}/${name}`]); return; }
    let failure;
    for(let i=0;i<attempts;i++) {
      try { run('/bin/launchctl',['bootstrap',domain,file]); return; }
      catch(error) {
        failure=error;
        // A just-removed job can still be busy inside launchd. Retry registration.
        // Permanent errors are reported with their original cause.
        if(!/(?:in progress|Input\/output error)/i.test(String(error.stderr)) && ![5,37].includes(error.status))throw error;
        await wait(100);
      }
    }
    throw failure;
  }
  return {stop,load};
}
const services=createServiceManager({run,domain,launchDir,exists});
const stopService=services.stop,loadService=services.load;
function servicePid(name) {
  try {
    const output=run('/bin/launchctl',['print',`${domain}/${name}`]);
    return /\bstate = running\b/.test(output) ? Number(output.match(/\bpid = (\d+)\b/)?.[1]) || null : null;
  } catch { return null; }
}
function installationReady({receipt,watcher,version,started,agentPid,startupPid}) {
  return Number.isInteger(agentPid) && agentPid>0 && Number.isInteger(startupPid) && startupPid>0
    && receipt?.version===version && receipt?.pid===agentPid && watcher?.pid===startupPid
    && receipt?.startedAt>=started && receipt?.updatedAt>=started && watcher?.updatedAt>=started;
}
function portReady(port=39222) {
  return new Promise(resolve => {
    const socket = net.createConnection({host:'127.0.0.1',port});
    let done = false;
    const finish = value => { if (!done) { done=true;socket.destroy();resolve(value); } };
    socket.once('connect',()=>finish(true)); socket.once('error',()=>finish(false)); socket.setTimeout(500,()=>finish(false));
  });
}
function nativeSnapshot(app) {
  const binary = path.join(installDir,'startup/bridge');
  return JSON.parse(run(binary,['snapshot',app],{timeout:5000}));
}
async function install() {
  if (process.platform !== 'darwin') throw new Error('此入口仅支持 macOS');
  if (+process.versions.node.split('.')[0]<24) throw new Error('需要 Node.js 24+');
  const payload=root===installDir?installDir:path.join(root,'build');
  const metadata=JSON.parse(fs.readFileSync(path.join(payload,'update.json'),'utf8'));
  if(metadata.schema!==1||metadata.platform!=='macOS'||!/^\d+\.\d+\.\d+$/.test(metadata.version))throw Error('版本信息无效');
  const updateCore=require(path.join(payload,'updater/core.cjs')).createUpdater(metadata.repository);
  const saved=exists(path.join(installDir,'settings.json'))?config():null;
  const app=findApp(process.env.CODEX_ORBIT_APP||saved?.app);
  if(!app)throw Error('未找到带 Codex CLI 的桌面应用');
  const fromUpdate=process.argv.includes('--from-update');
  const previousVersion=exists(path.join(installDir,'installed-version.json'))?JSON.parse(fs.readFileSync(path.join(installDir,'installed-version.json'),'utf8')):null;
  const codexHome=process.env.CODEX_HOME||previousVersion?.codexHome||'';
  const preferences=exists(path.join(installDir,'update-settings.json'))?JSON.parse(fs.readFileSync(path.join(installDir,'update-settings.json'),'utf8')):null;
  if(fromUpdate&&preferences?.enabled===false)throw Error('自动更新已关闭');
  if(fromUpdate){const current=JSON.parse(fs.readFileSync(path.join(installDir,'installed-version.json'),'utf8'));if(current.repository!==metadata.repository||updateCore.compareVersions(metadata.version,current.version)<=0)throw Error('更新来源或版本不匹配');}
  if(exists(installDir)&&!exists(path.join(installDir,'agent.cjs')))throw Error('目标目录不属于 Codex 果味额度条');
  const mapping={'agent.cjs':path.join(payload,'agent.cjs'),'startup/watch.cjs':path.join(payload,'startup/watch.cjs'),
    'startup/controller.cjs':path.join(payload,'startup/controller.cjs'),'startup/bridge':path.join(payload,'startup/bridge'),
    'updater/core.cjs':path.join(payload,'updater/core.cjs'),'updater/worker.cjs':path.join(payload,'updater/worker.cjs'),
    'update.json':path.join(payload,'update.json'),'macos/manage.cjs':__filename,'macos/transaction.cjs':path.join(__dirname,'transaction.cjs'),
    'LICENSE':path.join(root,'LICENSE'),'THIRD_PARTY_NOTICES.md':path.join(root,'THIRD_PARTY_NOTICES.md'),
    'third_party/codex-usage-badge/LICENSE':path.join(root,'third_party/codex-usage-badge/LICENSE')};
  for(const source of Object.values(mapping))if(!exists(source))throw Error('安装包不完整，请重新解压');
  for(const name of ['agent.cjs','updater/core.cjs','updater/worker.cjs','startup/watch.cjs'])run(process.execPath,['--check',path.join(payload,name)]);
  run('/usr/bin/codesign',['--verify','--strict',path.join(payload,'startup/bridge')]);
  const stage=installDir+'.staging-'+require('node:crypto').randomUUID();
  fs.mkdirSync(stage,{recursive:true,mode:0o700});
  for(const [name,source]of Object.entries(mapping)){
    const destination=path.join(stage,name);fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});fs.copyFileSync(source,destination);
  }
  fs.chmodSync(path.join(stage,'startup/bridge'),0o755);
  for(const name of ['startup/state.json'])if(exists(path.join(installDir,name)))fs.copyFileSync(path.join(installDir,name),path.join(stage,name));
  const write=(name,value)=>fs.writeFileSync(path.join(stage,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
  write('settings.json',{schema:1,app,port:39222});write('startup/settings.json',{app});
  write('update-settings.json',{owner:'codex-orbit-updater-v1',enabled:preferences?.enabled!==false,allowPrerelease:preferences?.allowPrerelease??metadata.allowPrerelease??false});
  write('installed-version.json',{...metadata,app,codexHome});
  fs.mkdirSync(logs,{recursive:true,mode:0o700});fs.mkdirSync(launchDir,{recursive:true});
  const labels=[label,startupLabel,updateLabel];
  const previous=new Map(labels.map(name=>{const file=path.join(launchDir,name+'.plist');return[file,exists(file)?fs.readFileSync(file):null];}));
  const specs=new Map();
  for(const[name,program]of[[label,'agent.cjs'],[startupLabel,'startup/watch.cjs'],[updateLabel,'updater/worker.cjs']]){
    const spec={Label:name,ProgramArguments:[process.execPath,path.join(installDir,program)],RunAtLoad:true,ProcessType:'Background',
      StandardOutPath:path.join(logs,name+'.log'),StandardErrorPath:path.join(logs,name+'.error.log'),
      EnvironmentVariables:codexHome?{CODEX_HOME:codexHome}: {}};
    if(name===updateLabel)spec.StartInterval=21600;else{spec.KeepAlive={SuccessfulExit:false};spec.ThrottleInterval=10;}
    specs.set(path.join(launchDir,name+'.plist'),plist(spec));
  }
  if(!fromUpdate)await stopService(updateLabel);
  const started=Date.now();
  const result=await require('./transaction.cjs').replaceInstallation({live:installDir,stage,
    stop:async()=>{await stopService(startupLabel);await stopService(label);},
    start:async({rollback})=>{if(!rollback)for(const[file,text]of specs)fs.writeFileSync(file,text,{mode:0o600});await loadService(label);await loadService(startupLabel);if(rollback&&!fromUpdate&&exists(path.join(launchDir,updateLabel+'.plist')))await loadService(updateLabel);},
    restoreExternal:()=>{for(const[file,data]of previous){if(data)fs.writeFileSync(file,data,{mode:0o600});else if(exists(file))fs.unlinkSync(file);}},
    probe:async()=>{
      let readyPid = null;
      for(let i=0;i<60;i++){
        try{
          const receipt=JSON.parse(fs.readFileSync(path.join(installDir,'runtime-state.json'),'utf8'));
          const watcher=JSON.parse(fs.readFileSync(path.join(installDir,'startup/state.json'),'utf8'));
          const agentPid=servicePid(label),startupPid=servicePid(startupLabel);
          if(installationReady({receipt,watcher,version:metadata.version,started,agentPid,startupPid})){
            const pair=`${agentPid}:${startupPid}`;
            if(readyPid===pair)return;
            readyPid=pair;
          }else readyPid=null;
        }catch{}
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      const reason=!servicePid(label)?'额度后台未运行':!servicePid(startupLabel)?'启动助手未运行':'后台启动记录未确认';
      throw Error(`${reason}，已恢复原版本。请查看 ~/Library/Logs/CodexOrbit 的后台日志。`);
    }});
  if(!fromUpdate)await loadService(updateLabel);
  console.log('Codex 果味额度条 '+metadata.version+' 后台已安装；自动更新每 6 小时检查自己的 GitHub Releases。');
  if(!fromUpdate)console.log('请保存工作，用 ⌘Q 完全退出 Codex，再从原图标打开。');
  if(result.backup)console.log('原版本备份：'+result.backup);
}
async function launch() {
  const settings = config();
  await loadService(label);
  if (await portReady()) { console.log('本机调试端口已开启，等待组件连接。'); return; }
  if (nativeSnapshot(settings.app).apps.length) throw new Error('Codex 仍在运行。请先按 ⌘Q 完全退出，再运行打开 Codex.command。不会强制结束你的聊天。');
  run('/usr/bin/open',['-a',settings.app,'--args','--remote-debugging-address=127.0.0.1','--remote-debugging-port=39222']);
  console.log('已从专用入口打开 Codex，等待 5–10 秒后查看左下角。');
}
async function status() {
  console.log(`安装状态：${exists(path.join(installDir,'settings.json')) ? '已安装' : '未安装'}`);
  if (!exists(path.join(installDir,'settings.json'))) return;
  const settings = config();
  console.log(`本机调试连接：${await portReady(settings.port) ? '可连接' : '未开启'}`);
  for (const name of [label,startupLabel,updateLabel]) {
    try { const output=run('/bin/launchctl',['print',`${domain}/${name}`]); console.log(`${name===label?'额度后台':name===updateLabel?'更新后台':'启动助手'}：${/state = running/.test(output)?'运行中':'已加载'}`); }
    catch { console.log(`${name===label?'额度后台':name===updateLabel?'更新后台':'启动助手'}：未运行`); }
  }
  // Do not inspect the client's live renderer from this management command.
  console.log('若左下角未出现图标：先彻底退出并重开 Codex，再查看额度后台日志。');
}
async function stop() {
  await stopService(updateLabel); await stopService(startupLabel); await stopService(label);
  console.log('后台已停止。当前窗口中的图标会随 Codex 退出移除；重开普通 Codex 可关闭调试端口。');
}
async function uninstall() {
  await stop();
  // Move only this installation to the user's recoverable Trash.
  if (exists(installDir)) {
    const trash = path.join(home,'.Trash',`CodexOrbit-${Date.now()}`);
    fs.mkdirSync(path.dirname(trash),{recursive:true}); fs.renameSync(installDir,trash);
  }
  for (const name of [label,startupLabel,updateLabel]) {
    const file=path.join(launchDir,`${name}.plist`);
    if (exists(file)) fs.renameSync(file,path.join(home,'.Trash',`${name}-${Date.now()}.plist`));
  }
  console.log('Codex 果味额度条 已移到废纸篓。请退出并重新打开 Codex，以移除图标和关闭调试接口。');
}
module.exports = { findApp, plist, label, startupLabel, updateLabel, installationReady, createServiceManager };
if (require.main === module) {
  const action = process.argv[2];
  const handlers = { install, launch, status, stop, uninstall, update:()=>require(path.join(installDir,'updater/worker.cjs')).main(['update']), 'update-status':()=>require(path.join(installDir,'updater/worker.cjs')).main(['status']), 'updates-on':()=>require(path.join(installDir,'updater/worker.cjs')).main(['enable']), 'updates-off':()=>require(path.join(installDir,'updater/worker.cjs')).main(['disable']) };
  if (!handlers[action]) { console.error('未知操作'); process.exitCode=1; }
  else handlers[action]().catch(error => { console.error(error.message); process.exitCode=1; });
}
