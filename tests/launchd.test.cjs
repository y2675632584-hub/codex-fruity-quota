'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {createServiceManager,plist}=require('../macos/manage.cjs');
const missing=()=>Object.assign(Error('missing'),{status:113,stderr:'Could not find service'});

test('stop waits for removal, including the period after the old process exits',async()=>{
  let checks=0,waits=0;
  const service=createServiceManager({domain:'gui/1',launchDir:'/test',wait:async()=>{waits++;},run:(_cmd,args)=>{
    if(args[0]==='bootout')return '';
    if(++checks<4)return 'state = not running';
    throw missing();
  }});
  await service.stop('example');assert.equal(checks,4);assert.equal(waits,3);
});

test('registration retries a busy removal without kickstarting the old job',async()=>{
  let registrations=0;
  const service=createServiceManager({domain:'gui/1',launchDir:'/test',exists:()=>true,wait:async()=>{},run:(_cmd,args)=>{
    if(args[0]==='print')throw missing();
    assert.equal(args[0],'bootstrap');
    if(++registrations<3)throw Object.assign(Error('busy'),{status:37,stderr:'Operation already in progress'});
  }});
  await service.load('example');assert.equal(registrations,3);
});

test('an already running registered service can be started without re-registering',async()=>{
  const commands=[];
  const service=createServiceManager({domain:'gui/1',launchDir:'/test',exists:()=>true,run:(_cmd,args)=>{commands.push(args[0]);return 'state = running';}});
  await service.load('example');assert.deepEqual(commands,['print','kickstart']);
});

test('permission errors and a stop timeout prevent replacing the old files',async()=>{
  const permission=Object.assign(Error('permission denied'),{status:1,stderr:'Operation not permitted'});
  const denied=createServiceManager({domain:'gui/1',launchDir:'/test',run:()=>{throw permission;}});
  await assert.rejects(denied.stop('example'),error=>error===permission);
  const stuck=createServiceManager({domain:'gui/1',launchDir:'/test',attempts:2,wait:async()=>{},run:()=>''});
  await assert.rejects(stuck.stop('example'),/尚未完全退出/);
});

test('permanent bootstrap failure preserves the original cause',async()=>{
  const failure=Object.assign(Error('invalid plist'),{status:78,stderr:'Invalid property list'});
  const service=createServiceManager({domain:'gui/1',launchDir:'/test',exists:()=>true,run:(_cmd,args)=>{if(args[0]==='print')throw missing();throw failure;}});
  await assert.rejects(service.load('example'),error=>error===failure);
});

test('macOS delayed-exit service reproduces the old race and survives replacement',
  {skip:process.platform!=='darwin',timeout:20000},async t=>{
  // Isolated jobs only: no desktop app, renderer, native bridge or account access.
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'fruity-launchd-race-'));
  const name='local.fruity.race.'+crypto.randomUUID(),domain='gui/'+process.getuid();
  const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const services=createServiceManager({run,domain,launchDir:directory});
  t.after(async()=>{await services.stop(name);fs.rmSync(directory,{recursive:true,force:true});});
  const script=path.join(directory,'job.cjs'),receipt=path.join(directory,'ready.json');
  fs.writeFileSync(script,`require('node:fs').writeFileSync(${JSON.stringify(receipt)},String(process.pid));setInterval(()=>{},1000);process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),1500));`);
  fs.writeFileSync(path.join(directory,name+'.plist'),plist({Label:name,ProgramArguments:[process.execPath,script],RunAtLoad:true}));
  await services.load(name);
  for(let i=0;!fs.existsSync(receipt)&&i<50;i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(fs.existsSync(receipt));const original=Number(fs.readFileSync(receipt,'utf8'));
  run('/bin/launchctl',['bootout',domain+'/'+name]);
  // The old installer tried bootstrap immediately after bootout.
  assert.throws(()=>run('/bin/launchctl',['bootstrap',domain,path.join(directory,name+'.plist')]));
  // stop may encounter an already exiting job; it must still wait for removal.
  // bootout again is allowed by launchd while termination is in progress.
  await services.stop(name);fs.unlinkSync(receipt);await services.load(name);
  for(let i=0;!fs.existsSync(receipt)&&i<50;i++)await new Promise(r=>setTimeout(r,100));
  assert.ok(fs.existsSync(receipt));assert.notEqual(Number(fs.readFileSync(receipt,'utf8')),original);
  assert.match(run('/bin/launchctl',['print',domain+'/'+name]),/state = running/);
});
