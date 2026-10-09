const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtime = require('../build/agent.cjs');
const { StartupController } = require('../third_party/codex-usage-badge/macos/startup/controller.cjs');
const manage = require('../macos/manage.cjs');

function payload(used=25, week=50, count=2) {
  return { accountId:'PRIVATE_ACCOUNT_ID', rateLimitsByLimitId:{codex:{limitId:'codex',
    primary:{usedPercent:used,windowDurationMins:300,resetsAt:2000000000},
    secondary:{usedPercent:week,windowDurationMins:10080,resetsAt:2000100000}}},
    rateLimitResetCredits:{availableCount:count,credits:[{id:'PRIVATE_RESET_ID'}]} };
}
test('runtime exposes authoritative reset count and strips private identifiers', () => {
  const value=runtime.sanitizeOrbitUsage(payload());
  assert.equal(value.fiveHour.remainingPercent,75);
  assert.equal(value.weekly.remainingPercent,50);
  assert.equal(value.resetCount,2);
  assert.equal(runtime.sanitizeOrbitUsage(payload(100,100,0)).resetCount,0);
  assert.ok(!JSON.stringify(value).includes('PRIVATE'));
});
test('runtime handles reordered windows and missing/invalid fields', () => {
  const value=payload();
  const codex=value.rateLimitsByLimitId.codex;
  [codex.primary,codex.secondary]=[codex.secondary,codex.primary];
  assert.equal(runtime.sanitizeOrbitUsage(value).fiveHour.remainingPercent,75);
  for(const invalid of [NaN,Infinity,'25',null,true])assert.equal(runtime.sanitizeOrbitUsage(payload(invalid)).fiveHour,null);
  assert.equal(runtime.sanitizeOrbitUsage(payload(-1)).fiveHour.remainingPercent,100);
  assert.equal(runtime.sanitizeOrbitUsage(payload(101)).fiveHour.remainingPercent,0);
  assert.equal(runtime.sanitizeOrbitUsage(payload(25,50,null)).resetCount,null);
  const keyed=payload();keyed.rateLimits=keyed.rateLimitsByLimitId.codex;keyed.rateLimitsByLimitId={other:keyed.rateLimits};
  assert.equal(runtime.sanitizeOrbitUsage(keyed).status,'unavailable');
});
test('upstream notification merging clears previous account data', () => {
  const result=runtime.mergeRateLimitsResponse(payload(),{accountId:'NEW_ACCOUNT',rateLimitsByLimitId:{codex:{limitId:'codex',primary:null,secondary:null}}});
  assert.equal(runtime.sanitizeOrbitUsage(result).resetCount,null);
  assert.equal(runtime.sanitizeOrbitUsage(result).fiveHour,null);
});
test('bootstrap injects only the orbit and uses DOM layout placement', () => {
  const source=runtime.buildBootstrapScript();
  assert.ok(source.includes('rail.insertBefore(badge, footer)'));
  assert.ok(source.includes('position:relative'));
  assert.ok(source.includes('other-badge-detected'));
  assert.ok(!source.includes('installProjectColors'));
  assert.ok(!source.includes('ThreadTokenReader'));
  assert.ok(!source.includes('__codexUsageBadge'));
  assert.ok(source.includes('__codexOrbit'));
});
test('only main Codex renderers are selected, overlays and other origins are excluded', () => {
  assert.equal(runtime.isMainWindow({url:'app://-/index.html'}),true);
  for(const url of ['https://example.com/index.html','app://-/index.html?overlay=1','app://-/settings.html','app://wrong/index.html'])
    assert.equal(runtime.isMainWindow({url}),false);
});
test('CDP connection rejects non-loopback addresses before opening a socket', async () => {
  const session=new runtime.CdpSession({webSocketDebuggerUrl:'ws://attacker.example:39222/target'});
  await assert.rejects(session.connect(),/loopback/);
});
test('reused RPC completes initialization and only reads account quota', async () => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-rpc-'));
  const fake=path.join(folder,'server.cjs');
  const records=path.join(folder,'requests.jsonl');
  fs.writeFileSync(fake,`const fs=require('node:fs');const readline=require('node:readline');\nconst records=${JSON.stringify(records)};\nreadline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);fs.appendFileSync(records,line+'\\n');if(m.id){const result=m.method==='initialize'?{}:${JSON.stringify(payload())};console.log(JSON.stringify({id:m.id,result}));}});`);
  const client=new runtime.AppServerClient({command:process.execPath,args:[fake],requestTimeoutMs:2000});
  try {
    await client.start();
    assert.equal(runtime.sanitizeOrbitUsage(client.rateLimits).resetCount,2);
    await client.refresh();
    const requests=fs.readFileSync(records,'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(requests.map(item=>item.method),['initialize','initialized','account/rateLimits/read','account/rateLimits/read']);
    assert.equal(requests[0].params.clientInfo.name,'codex_orbit');
  } finally {client.stop();fs.rmSync(folder,{recursive:true,force:true});}
});
test('reused RPC times out without printing opaque upstream data', async () => {
  const client=new runtime.AppServerClient({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],requestTimeoutMs:100});
  try {await assert.rejects(client.start(),/timed out/);}finally{client.stop();}
});
test('startup adapter does not reopen an existing working app', async () => {
  let quits=0;
  const app={key:'existing',launchedAt:1,argumentsKnown:true,debugPort:null,finishedLaunching:true,pid:1};
  const adapter={snapshot:async()=>({apps:[app],frontmostPid:1,inputIdleMs:10000,inputStamp:'same'}),record:async()=>{},quit:async()=>{quits++;return {accepted:true};}};
  const controller=new StartupController(adapter,{now:()=>5000});
  await controller.tick();await controller.tick();assert.equal(quits,0);
});
test('startup adapter skips new instances already receiving user input', async () => {
  let appList=[],quits=0;
  const adapter={snapshot:async()=>({apps:appList,frontmostPid:1,inputIdleMs:0,inputStamp:'changed'}),record:async()=>{},quit:async()=>{quits++;return {accepted:true};}};
  const controller=new StartupController(adapter,{now:()=>5000});await controller.tick();
  appList=[{key:'new',launchedAt:4000,argumentsKnown:true,debugPort:null,finishedLaunching:true,pid:1}];
  await controller.tick();assert.equal(quits,0);
});
test('installer uses separate service names and safe plist escaping', () => {
  assert.equal(manage.label,'local.codexorbit.agent');
  assert.equal(manage.startupLabel,'local.codexorbit.startup');
  const xml=manage.plist({ProgramArguments:['/path with spaces/node','<a>&"'],RunAtLoad:true});
  assert.ok(xml.includes('&lt;a&gt;&amp;&quot;'));
  assert.ok(xml.includes('<true/>'));
});
