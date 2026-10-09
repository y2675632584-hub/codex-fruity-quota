'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {runOrbit}=require('../build/agent.cjs');
const {installationReady}=require('../macos/manage.cjs');
const version=require('../package.json').version;

test('background readiness is written before a stalled renderer scan completes',async t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'fruity-ready-'));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const receiptFile=path.join(folder,'runtime-state.json');
  let finishScan,scanStarted=false;
  const injector={sessions:new Map(),scan(){scanStarted=true;return new Promise(resolve=>{finishScan=resolve;});},stop(){finishScan?.();}};
  const started=Date.now();
  const agent=await runOrbit({codexBin:process.execPath,receiptFile,rendererInjector:injector,scanMs:60000});
  t.after(()=>agent.stop());
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  assert.equal(scanStarted,true);
  assert.equal(receipt.state,'waiting');assert.equal(receipt.version,version);
  assert.equal(receipt.pid,process.pid);assert.ok(receipt.startedAt>=started);
  assert.ok(receipt.updatedAt>=started);
});

test('a missing receipt directory fails startup instead of hiding the write error',async()=>{
  const injector={sessions:new Map(),scan(){throw Error('scan should not start');},stop(){}};
  await assert.rejects(runOrbit({codexBin:process.execPath,rendererInjector:injector,
    receiptFile:path.join(os.tmpdir(),'missing-'+require('node:crypto').randomUUID(),'receipt.json')}),{code:'ENOENT'});
});

test('installation requires fresh records from the actual running service processes',()=>{
  const good={version,started:100,agentPid:21,startupPid:22,
    receipt:{version,pid:21,startedAt:101,updatedAt:101,state:'waiting'},watcher:{pid:22,updatedAt:101}};
  assert.equal(installationReady(good),true);
  for(const patch of [
    {agentPid:null},{startupPid:null},
    {receipt:{...good.receipt,pid:19}},
    {receipt:{...good.receipt,version:'0.0.0'}},
    {receipt:{...good.receipt,startedAt:99}},
    {watcher:{...good.watcher,pid:20}},
    {watcher:{...good.watcher,updatedAt:99}}
  ])assert.equal(installationReady({...good,...patch}),false);
});
