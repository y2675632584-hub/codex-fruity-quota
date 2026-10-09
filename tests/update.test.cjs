'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {sanitizeOrbitUsage}=require('../build/agent.cjs');
const {createUpdater}=require('../build/updater/core.cjs');
const {replaceInstallation}=require('../macos/transaction.cjs');
const repo=require('../release.json').repository,core=createUpdater(repo);
const packageVersion=require('../package.json').version;
const macZip=path.join(__dirname,`../dist/CodexOrbit-macOS-${packageVersion}.zip`);
const hasMacZip=fs.existsSync(macZip);
const weekly={usedPercent:62,windowDurationMins:10080,resetsAt:123};
test('weekly-only accounts use the weekly ring; invalid five-hour data does not become Pro',()=>{
  const pro=sanitizeOrbitUsage({rateLimits:{primary:weekly}});assert.equal(pro.ringWindow,'weekly');assert.equal(pro.fiveHour,null);assert.equal(pro.weekly.remainingPercent,38);
  const invalid=sanitizeOrbitUsage({rateLimits:{primary:{windowDurationMins:300,usedPercent:null},secondary:weekly}});assert.equal(invalid.ringWindow,'fiveHour');assert.equal(invalid.fiveHour,null);
});
test('updater pins the project repository and six-hour interval',()=>{assert.equal(core.intervalMs,21600000);assert.throws(()=>createUpdater('../other/repo'));});
function release(version,bytes){const name=`CodexOrbit-macOS-${version}.zip`,tag=`v${version}-macos`;return {tag_name:tag,published_at:'2026-10-09',assets:[{name,state:'uploaded',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),browser_download_url:`https://github.com/${repo}/releases/download/${tag}/${name}`}]};}
test('only newer matching macOS assets are selected; drafts, foreign URLs and missing digests are rejected',()=>{
 const bytes=Buffer.from('zip'),good=release('0.4.0',bytes);
 assert.equal(core.selectRelease([good],'0.3.0').version,'0.4.0');
 for(const bad of [{...good,draft:true},{...good,tag_name:'v0.4.0-windows'},{...good,assets:[{...good.assets[0],digest:''}]},{...good,assets:[{...good.assets[0],browser_download_url:'https://evil.example/pkg.zip'}]}])assert.equal(core.selectRelease([bad],'0.3.0'),null);
 assert.equal(core.selectRelease([good],'0.4.0'),null);
});
test('production macOS ZIP passes strict internal hash/path/version validation',{skip:!hasMacZip},()=>{
 const bytes=fs.readFileSync(macZip);
 assert.ok(core.readArchive(bytes,packageVersion).has('build/updater/worker.cjs'));
 assert.throws(()=>core.readArchive(bytes,'999.0.0'));
 const bad=Buffer.from(bytes);bad[100]^=1;assert.throws(()=>core.readArchive(bad,packageVersion));
});
function temporary(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'orbit-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('corrupt release download never invokes installer; errors observe six-hour cooldown',{skip:!hasMacZip},async t=>{
 const root=temporary(t),live=path.join(root,'live'),cache=path.join(root,'cache');fs.mkdirSync(live);
 core.writeJson(path.join(live,'update-settings.json'),{owner:'codex-orbit-updater-v1',enabled:true});core.writeJson(path.join(live,'installed-version.json'),{platform:'macOS',repository:repo,version:'0.2.0'});
 const bytes=fs.readFileSync(macZip),r=release(packageVersion,bytes);let installs=0,requests=0;
 const fetchImpl=async url=>{requests++;return new Response(url.includes('api.github.com')?JSON.stringify([r]):Buffer.alloc(bytes.length),{status:200});};
 await assert.rejects(()=>core.updateOnce({installDir:live,cacheDir:cache,fetchImpl,install:()=>installs++,now:()=>1000}));assert.equal(installs,0);assert.equal(core.readJson(path.join(cache,'state.json')).event,'error');
 const result=await core.updateOnce({installDir:live,cacheDir:cache,fetchImpl,install:()=>installs++,now:()=>2000});assert.equal(result.event,'cooldown');assert.equal(requests,2);
});
test('validated update installs once and confirms the installed version',{skip:!hasMacZip},async t=>{
 const root=temporary(t),live=path.join(root,'live'),cache=path.join(root,'cache');fs.mkdirSync(live);
 core.writeJson(path.join(live,'update-settings.json'),{owner:'codex-orbit-updater-v1',enabled:true});core.writeJson(path.join(live,'installed-version.json'),{platform:'macOS',repository:repo,version:'0.2.0'});
 const bytes=fs.readFileSync(macZip),r=release(packageVersion,bytes);let count=0;
 await core.updateOnce({installDir:live,cacheDir:cache,fetchImpl:async url=>new Response(url.includes('api.github.com')?JSON.stringify([r]):bytes),install:async stage=>{count++;assert.ok(fs.existsSync(path.join(stage,'build/agent.cjs')));core.writeJson(path.join(live,'installed-version.json'),{platform:'macOS',repository:repo,version:packageVersion});}});
 assert.equal(count,1);assert.equal(core.readJson(path.join(cache,'state.json')).event,'updated');assert.equal(fs.readdirSync(cache).some(x=>x.startsWith('stage-')),false);
});
test('failed start restores previous runtime and external configuration',async t=>{
 const root=temporary(t),live=path.join(root,'Orbit'),stage=live+'.staging-test';fs.mkdirSync(live);fs.mkdirSync(stage);fs.writeFileSync(path.join(live,'version'),'old');fs.writeFileSync(path.join(stage,'version'),'new');let restored=false,starts=[];
 await assert.rejects(()=>replaceInstallation({live,stage,stop:()=>{},start:({rollback})=>starts.push(rollback),probe:()=>{throw Error('new worker failed');},restoreExternal:()=>{restored=true;}}));
 assert.equal(fs.readFileSync(path.join(live,'version'),'utf8'),'old');assert.deepEqual(starts,[false,true]);assert.equal(restored,true);
});
test('successful swap retains a recoverable old version',async t=>{
 const root=temporary(t),live=path.join(root,'Orbit'),stage=live+'.staging-test';fs.mkdirSync(live);fs.mkdirSync(stage);fs.writeFileSync(path.join(live,'version'),'old');fs.writeFileSync(path.join(stage,'version'),'new');
 const result=await replaceInstallation({live,stage,stop:()=>{},start:()=>{},probe:()=>{}});assert.equal(fs.readFileSync(path.join(result.backup,'version'),'utf8'),'old');assert.equal(fs.readFileSync(path.join(live,'version'),'utf8'),'new');
});
test('Windows updater reads this project metadata, validates checksum and excludes macOS releases',()=>{
 const win=require('../build/windows/update.cjs'),bytes=Buffer.from('windows ZIP'),hash=crypto.createHash('sha256').update(bytes).digest('hex'),tag='v0.4.0-windows',name='CodexOrbit-Windows-0.4.0.zip';
 const asset={name,state:'uploaded',size:bytes.length,digest:'sha256:'+hash,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/${name}`};
 const checksums={name:'SHA256SUMS.txt',state:'uploaded',size:100,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/SHA256SUMS.txt`};
 const r={tag_name:tag,published_at:'2026-10-09',assets:[asset,checksums]};const candidate=win.selectRelease([r],'0.3.0');assert.equal(candidate.version,'0.4.0');assert.equal(win.verifyArchive(bytes,Buffer.from(hash+'  '+name),candidate),hash);assert.throws(()=>win.verifyArchive(Buffer.alloc(bytes.length),Buffer.from(hash+'  '+name),candidate));assert.equal(win.selectRelease([{...r,tag_name:'v0.4.0-macos'}],'0.3.0'),null);
});
