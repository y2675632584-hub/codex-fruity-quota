'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
const {updateOnce,readJson,writeJson}=require('./core.cjs');
const installDir=path.resolve(__dirname,'..');
const cacheDir=path.join(os.homedir(),'Library/Caches/CodexUsageBadge-updates');
async function main(args=process.argv.slice(2)){
  if(process.platform!=='darwin')throw Error('此更新器仅供 macOS 使用');
  const mode=args[0]||'run';
  if(['enable','disable'].includes(mode)){
    const file=path.join(installDir,'update-settings.json'),settings=readJson(file);
    if(settings?.owner!=='codex-usage-badge-updater-v1')throw Error('自动更新未配置');
    writeJson(file,{...settings,enabled:mode==='enable'});console.log(mode==='enable'?'自动更新已开启':'自动更新已关闭');return;
  }
  if(mode==='status'){
    console.log(JSON.stringify({settings:readJson(path.join(installDir,'update-settings.json')),status:readJson(path.join(cacheDir,'state.json'))},null,2));return;
  }
  if(!['run','check'].includes(mode))throw Error('未知更新操作');
  if(fs.existsSync(cacheDir)&&fs.lstatSync(cacheDir).isSymbolicLink())throw Error('更新目录不能是链接');
  const controller=new AbortController();
  const stop=()=>controller.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    if(mode==='run')await require('node:timers/promises').setTimeout(30000,null,{signal:controller.signal});
    const result=await updateOnce({installDir,cacheDir,signal:controller.signal,force:mode==='check',checkOnly:mode==='check',
      install:async(stage,current)=>{
        await execFile(process.execPath,[path.join(stage,'manage.cjs'),'install','--from-update'],{
          env:{...process.env,CODEX_BADGE_APP:current.app,CODEX_HOME:current.codexHome||''},maxBuffer:1024*1024,windowsHide:true
        });
      }});
    if(mode==='check'){
      if(result.event==='available')console.log(`发现 macOS v${result.availableVersion}。${readJson(path.join(installDir,'update-settings.json'))?.enabled===false?'自动更新已关闭，可从 GitHub Releases 下载新版。':'后台将在下一次自动检查时升级。'}`);
      else if(result.event==='up_to_date')console.log(`当前 macOS v${result.currentVersion} 已是最新版本。`);
      else console.log('已有更新任务运行，请稍后再检查。');
    }else console.log(JSON.stringify({event:result.event,version:result.currentVersion,availableVersion:result.availableVersion}));
  }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
module.exports={main};
if(require.main===module)main().catch(error=>{console.error('自动更新暂不可用：'+error.message);process.exitCode=1;});
