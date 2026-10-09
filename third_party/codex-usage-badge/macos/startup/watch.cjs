'use strict';
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const readline=require('node:readline');
const {StartupController}=require('./controller.cjs');
const run=promisify(execFile);
const root=__dirname;
const config=JSON.parse(fs.readFileSync(path.join(root,'settings.json'),'utf8'));
const receipt=path.join(root,'state.json');
let state={};
try { state=JSON.parse(fs.readFileSync(receipt,'utf8')); } catch(error) { if(error.code!=='ENOENT')throw error; }
if(!Number.isFinite(state.lastAttemptAt??0))throw Error('Invalid startup receipt');
const abort=new AbortController();
async function native(action,...args) {
  const result=await run(path.join(root,'bridge'),[action,config.app,...args.map(String)],{timeout:35000,maxBuffer:65536,signal:abort.signal});
  return JSON.parse(result.stdout);
}
const adapter={
  snapshot:()=>native('snapshot'),
  quit:(app,stamp)=>native('quit',app.pid,app.key,stamp),
  launch:(stamp,frontmost)=>native('launch',stamp,frontmost),
  show:(app,stamp,frontmost)=>native('show',app.pid,app.key,stamp,frontmost),
  portInUse:()=>new Promise(resolve=>{
    const socket=net.createConnection({host:'127.0.0.1',port:39222});
    const done=value=>{socket.destroy();resolve(value);};
    socket.once('connect',()=>done(true));
    socket.once('error',error=>done(error.code!=='ECONNREFUSED'));
    socket.setTimeout(350,()=>done(true));
  }),
  async record(event,details={}) {
    state={...state,...details,event,updatedAt:Date.now()};
    const temp=receipt+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});
    fs.renameSync(temp,receipt);
    console.log(new Date().toISOString(),event);
  }
};
const controller=new StartupController(adapter,{lastAttemptAt:state.lastAttemptAt||0});
let stopped=false,queued=false,pumping=false,pendingTimer;
async function pump() {
  queued=true;
  if(pumping||stopped)return;
  pumping=true;
  clearTimeout(pendingTimer);
  try {
    while(queued&&!stopped) {
      queued=false;
      if(!fs.existsSync(path.join(root,'../agent.cjs')))return shutdown();
      await controller.tick();
    }
  } finally {
    pumping=false;
    if(controller.pendingLaunch&&!stopped)pendingTimer=setTimeout(pump,300);
  }
}
// NSWorkspace notifications, not a tight loop spawning native processes while idle.
const observer=spawn(path.join(root,'bridge'),['watch',config.app],{stdio:['ignore','pipe','ignore']});
const lines=readline.createInterface({input:observer.stdout});
lines.on('line',line=>{
  try { JSON.parse(line);pump(); } catch { shutdown(1); }
});
observer.once('error',()=>shutdown(1));
observer.once('exit',()=>{if(!stopped)shutdown(1);});
function shutdown(code=0) {
  if(stopped)return;
  stopped=true;controller.stop();clearTimeout(pendingTimer);abort.abort();observer.kill('SIGTERM');
  process.exit(code);
}
process.once('SIGTERM',()=>shutdown());process.once('SIGINT',()=>shutdown());
