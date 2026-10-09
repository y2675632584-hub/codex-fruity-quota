'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const REPO='jaykinhoo9/codex-usage-badge';
const INTERVAL=6*60*60*1000;
const MAX_ARCHIVE=20*1024*1024;
function compareVersions(a,b) {
  const parse=value=>{const match=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);if(!match)throw Error('Invalid update version');return match;};
  const left=parse(a),right=parse(b);
  for(let i=1;i<=3;i++){const delta=Number(left[i])-Number(right[i]);if(delta)return Math.sign(delta);}
  if(left[4]===right[4])return 0;
  if(!left[4])return 1;if(!right[4])return -1;
  const l=left[4].split('.'),r=right[4].split('.');
  for(let i=0;i<Math.max(l.length,r.length);i++){
    if(l[i]===r[i])continue;if(l[i]===undefined)return -1;if(r[i]===undefined)return 1;
    const ln=/^\d+$/.test(l[i]),rn=/^\d+$/.test(r[i]);
    if(ln&&rn)return Math.sign(Number(l[i])-Number(r[i]));if(ln!==rn)return ln?-1:1;
    return l[i]<r[i]?-1:1;
  }
  return 0;
}
function validAsset(asset,tag) {
  return asset?.state==='uploaded'&&Number.isSafeInteger(asset.size)&&asset.size>0&&
    asset.browser_download_url===`https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${asset.name}`;
}
function selectRelease(releases,current) {
  const found=[];
  for(const release of releases){
    if(release.draft||!release.published_at||!/^v\d+\.\d+\.\d+-windows$/.test(release.tag_name||''))continue;
    const version=release.tag_name.slice(1,-8),name=`CodexUsageBadge-Windows-${version}.zip`;
    const asset=release.assets?.find(a=>a.name===name),checksums=release.assets?.find(a=>a.name==='SHA256SUMS.txt');
    if(!validAsset(asset,release.tag_name)||!validAsset(checksums,release.tag_name)||asset.size>MAX_ARCHIVE||checksums.size>65536)continue;
    if(compareVersions(version,current)>0)found.push({version,asset,checksums});
  }
  return found.sort((a,b)=>compareVersions(b.version,a.version))[0]||null;
}
async function getBytes(url,limit,fetcher=fetch) {
  const response=await fetcher(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'CodexUsageBadge-Windows-Updater'},signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error(`GitHub update request failed (${response.status})`);
  if(Number(response.headers.get('content-length')||0)>limit)throw Error('Update response exceeds size limit');
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Update response exceeds size limit');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
function verifyArchive(data,manifest,candidate) {
  if(data.length!==candidate.asset.size)throw Error('Update archive size mismatch');
  const lines=manifest.toString('utf8').split(/\r?\n/).map(line=>/^([a-fA-F0-9]{64})  (.+)$/.exec(line)).filter(Boolean);
  const matches=lines.filter(line=>line[2]===candidate.asset.name);
  if(matches.length!==1)throw Error('Update checksum missing or duplicated');
  const hash=crypto.createHash('sha256').update(data).digest('hex');
  if(hash!==matches[0][1].toLowerCase())throw Error('Update archive checksum mismatch');
  if(candidate.asset.digest&&candidate.asset.digest!==`sha256:${hash}`)throw Error('GitHub asset digest mismatch');
  return hash;
}
async function checkForUpdate({current,fetcher=fetch,installPackage,record,force=false,state={},now=Date.now}={}) {
  const time=now();
  if(!force&&Number.isFinite(state.checkedAt)&&state.checkedAt<=time&&time-state.checkedAt<INTERVAL)return {event:'not-due'};
  await record({event:'checking',checkedAt:time}); // Persist before the request so failure/restart cannot create a loop.
  try {
    const releases=JSON.parse((await getBytes(`https://api.github.com/repos/${REPO}/releases?per_page=100`,2*1024*1024,fetcher)).toString('utf8'));
    if(!Array.isArray(releases))throw Error('Invalid GitHub release list');
    const candidate=selectRelease(releases,current);
    if(!candidate){const result={event:'up-to-date',checkedAt:time,currentVersion:current};await record(result);return result;}
    const manifest=await getBytes(candidate.checksums.browser_download_url,65536,fetcher);
    const data=await getBytes(candidate.asset.browser_download_url,MAX_ARCHIVE,fetcher);
    const hash=verifyArchive(data,manifest,candidate);
    await record({event:'installing',checkedAt:time,currentVersion:current,availableVersion:candidate.version});
    await installPackage({data,hash,version:candidate.version});
    const result={event:'updated',checkedAt:time,currentVersion:candidate.version};await record(result);return result;
  } catch(error) {
    await record({event:'error',checkedAt:time,message:error.message});throw error;
  }
}
function installDownloaded(root,candidate,force) {
  const tempRoot=path.resolve(require('node:os').tmpdir());
  const task=fs.mkdtempSync(path.join(tempRoot,'badge-update-'));
  const archive=path.join(task,'package.zip');fs.writeFileSync(archive,candidate.data);
  const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  return new Promise((resolve,reject)=>{
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'update-windows.ps1'),'-InstallRoot',root,'-Archive',archive,'-Version',candidate.version,'-Digest',candidate.hash];
    if(force)args.push('-ForceUpdate');
    const child=spawn(shell,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let details='';child.stderr.on('data',chunk=>{details=(details+chunk.toString()).slice(-2000);});
    child.once('error',reject);child.once('close',code=>{code===0?resolve():reject(Error(`Update validation or installation failed (${code}): ${details.trim()}`));});
  }).finally(()=>{
    const resolved=path.resolve(task);
    if(path.dirname(resolved)!==tempRoot||!path.basename(resolved).startsWith('badge-update-'))throw Error('Invalid update cleanup directory');
    fs.rmSync(resolved,{recursive:true,force:true});
  });
}
async function main() {
  const root=__dirname,file=path.join(root,'update-state.json'),configFile=path.join(root,'config.json');
  if(fs.readFileSync(path.join(root,'.codex-usage-badge-owner'),'utf8').trim()!=='local.codexusagebadge.windows')throw Error('Update install ownership check failed');
  const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const force=process.argv.includes('--force');
  try{if(JSON.parse(fs.readFileSync(path.join(root,'update-preferences.json'),'utf8')).Enabled===false&&!force)return;}catch(error){if(error.code!=='ENOENT')throw error;}
  let state={};try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  // The manager holds the OS update mutex, including during installation and rollback.
  await checkForUpdate({current:config.Version,state,force,installPackage:candidate=>installDownloaded(root,candidate,force),record:async value=>{
    const temp=file+'.tmp-'+crypto.randomUUID();
    try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n');fs.renameSync(temp,file);}
    finally{fs.rmSync(temp,{force:true});}
  }});
}
module.exports={compareVersions,selectRelease,getBytes,verifyArchive,checkForUpdate,INTERVAL};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
