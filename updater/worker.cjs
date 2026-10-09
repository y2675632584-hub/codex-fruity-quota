'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
const {createUpdater}=require('./core.cjs');
async function main(args=process.argv.slice(2)){
  if(process.platform!=='darwin')throw Error('此更新入口仅支持 macOS');
  const root=path.resolve(__dirname,'..'),cache=path.join(os.homedir(),'Library/Caches/CodexOrbit-updates');
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'update.json'),'utf8'));
  const core=createUpdater(metadata.repository),mode=args[0]||'run';
  if(mode==='status'){console.log(JSON.stringify({settings:core.readJson(path.join(root,'update-settings.json')),state:core.readJson(path.join(cache,'state.json'))},null,2));return;}
  if(['enable','disable'].includes(mode)){
    const file=path.join(root,'update-settings.json'),settings=core.readJson(file);
    if(settings?.owner!=='codex-orbit-updater-v1')throw Error('更新未配置');
    core.writeJson(file,{...settings,enabled:mode==='enable'});return;
  }
  if(!['run','check','update'].includes(mode))throw Error('未知更新操作');
  if(fs.existsSync(cache)&&fs.lstatSync(cache).isSymbolicLink())throw Error('更新缓存不能是链接');
  if(mode==='run')await require('node:timers/promises').setTimeout(30000);
  const result=await core.updateOnce({installDir:root,cacheDir:cache,force:mode!=='run',checkOnly:mode==='check',
    install:async(stage,current)=>{
      await execFile(process.execPath,[path.join(stage,'macos/manage.cjs'),'install','--from-update'],{
        env:{...process.env,CODEX_ORBIT_APP:current.app,CODEX_HOME:current.codexHome||''},timeout:120000,maxBuffer:1024*1024
      });
    }});
  console.log(JSON.stringify({event:result.event,version:result.currentVersion,availableVersion:result.availableVersion}));
}
module.exports={main};
if(require.main===module)main().catch(()=>{console.error('自动更新失败；现有版本保留。请运行更新诊断。');process.exitCode=1;});
