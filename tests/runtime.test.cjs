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
test('reset expiration details retain only available Codex cards and timestamps', () => {
  const response=payload();response.rateLimitResetCredits.availableCount=10;
  response.rateLimitResetCredits.credits=[
    {id:'PRIVATE_ID',status:'available',resetType:'codexRateLimits',expiresAt:2000000000},
    {status:'available',resetType:'codexRateLimits',expiresAt:null},
    {status:'redeemed',resetType:'codexRateLimits',expiresAt:2000000001},
    {status:'available',resetType:'unknown',expiresAt:2000000002},
    ...[undefined,-1,true,'2000000000',Infinity,8640000000001].map(expiresAt=>({status:'available',resetType:'codexRateLimits',expiresAt}))];
  const result=runtime.sanitizeOrbitUsage(response);
  assert.deepEqual(result.resetExpirations,[2000000000,null]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  response.rateLimitResetCredits.availableCount=1;
  assert.deepEqual(runtime.sanitizeOrbitUsage(response).resetExpirations,[2000000000]);
  response.rateLimitResetCredits.availableCount=0;
  assert.deepEqual(runtime.sanitizeOrbitUsage(response).resetExpirations,[]);
  response.rateLimitResetCredits={availableCount:2,credits:null};
  assert.deepEqual(runtime.sanitizeOrbitUsage(response).resetExpirations,[]);
});
test('reset card UI groups dates and distinguishes unlimited, missing and zero cards', () => {
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/injected-orbit.js'),'utf8');
  const functionSource=source.slice(source.indexOf('  function creditExpiryText('),source.indexOf('  function positionDetails('));
  const context={value:{resetExpirations:[2000000000,2000000000,null]}};
  vm.createContext(context);vm.runInContext(functionSource,context);
  assert.match(context.creditExpiryText(4),/（2 张）/);
  assert.match(context.creditExpiryText(4),/无到期限制（1 张）/);
  assert.match(context.creditExpiryText(4),/到期时间暂不可用（1 张）/);
  assert.equal(context.creditExpiryText(0),'');
  context.value={resetExpirations:[]};
  assert.equal(context.creditExpiryText(2),'重置卡到期\n到期时间暂不可用（2 张）');
});
test('weekly warning is strictly below 20 across every palette and independent of the ring', () => {
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../src/injected-orbit.js'),'utf8');
  const remainingSource=source.slice(source.indexOf('  const remaining ='),source.indexOf('  const percent ='));
  const renderSource=source.slice(source.indexOf('  function render()'),source.indexOf("    const fill = badge.querySelector('.orbit-fill');"))+'\n}';
  const style={setProperty(){},removeProperty(){}};
  const palettes=Object.fromEntries(['classic','blue','purple','battery','peach','amber'].map(id=>[id,{light:'#111',dark:'#eee'}]));
  const context={palettes,palette:'classic',value:{},badge:{dataset:{},style},details:{dataset:{},style,querySelectorAll:()=>[]}};
  vm.createContext(context);vm.runInContext(remainingSource+renderSource,context);
  for(const palette of Object.keys(palettes)) {
    context.palette=palette;
    for(const remaining of [100,21,20,19.99,19,0,null]) {
      context.value={fiveHour:{usedPercent:10},weekly:remaining===null?null:{usedPercent:100-remaining},status:'live'};
      context.render();
      assert.equal(context.badge.dataset.weekLow,String(remaining!==null&&remaining<20),`${palette}: ${remaining}`);
      assert.equal(context.details.dataset.weekLow,context.badge.dataset.weekLow);
      assert.equal(context.badge.dataset.low,'false');
    }
    context.value={fiveHour:null,weekly:{usedPercent:81},status:'live'};context.render();
    assert.equal(context.badge.dataset.weekLow,'true');
    assert.equal(context.badge.dataset.low,String(palette==='battery'));
    context.value={fiveHour:{usedPercent:75},weekly:{usedPercent:50},status:'live'};context.render();
    assert.equal(context.badge.dataset.weekLow,'false');
    assert.equal(context.badge.dataset.low,String(palette==='battery'));
  }
});
test('upstream notification merging clears previous account data', () => {
  const result=runtime.mergeRateLimitsResponse(payload(),{accountId:'NEW_ACCOUNT',rateLimitsByLimitId:{codex:{limitId:'codex',primary:null,secondary:null}}});
  assert.equal(runtime.sanitizeOrbitUsage(result).resetCount,null);
  assert.equal(runtime.sanitizeOrbitUsage(result).fiveHour,null);
});
test('bootstrap injects quota and scoped tokens, preserves DOM placement', () => {
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
