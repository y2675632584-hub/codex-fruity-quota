'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const repository='jaykinhoo9/codex-usage-badge';
const intervalMs=6*60*60*1000;
const maxArchive=16*1024*1024,maxExpanded=48*1024*1024;
const required=['agent.cjs','manage.cjs','macos/shortcuts.cjs','macos/startup/bridge','macos/startup/controller.cjs','macos/startup/watch.cjs','updater/core.cjs','updater/worker.cjs','updater/run.sh','update.json'];
function versionParts(value){
  if(typeof value!=='string'||!/^\d+\.\d+\.\d+$/.test(value))throw Error('无效版本号');
  const parts=value.split('.').map(Number);
  if(parts.some(n=>!Number.isSafeInteger(n)))throw Error('无效版本号');
  return parts;
}
function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;}
function selectRelease(releases,currentVersion,{allowPrerelease=true}={}){
  versionParts(currentVersion);if(!Array.isArray(releases))throw Error('GitHub 返回了无效发布列表');
  let best=null;
  for(const release of releases){
    if(!release||release.draft||!release.published_at||(!allowPrerelease&&release.prerelease)||!Array.isArray(release.assets))continue;
    const match=/^v(\d+\.\d+\.\d+)-macos$/.exec(release.tag_name||'');
    if(!match)continue;
    const version=match[1];
    if(compareVersions(version,currentVersion)<=0)continue;
    const name=`CodexUsageBadge-macOS-${version}.zip`;
    const assets=release.assets.filter(a=>a.name===name&&a.state==='uploaded');
    if(assets.length!==1)continue;
    const asset=assets[0];
    if(!/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')||!Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>maxArchive)continue;
    const url=`https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
    if(asset.browser_download_url!==url)continue;
    if(!best||compareVersions(version,best.version)>0)best={version,tag:release.tag_name,url,name,size:asset.size,digest:asset.digest.slice(7).toLowerCase()};
  }
  return best;
}
function allowedDownload(url){
  const u=new URL(url);
  return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&
    ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(u.hostname);
}
async function fetchBytes(url,{fetchImpl=fetch,limit,signal,timeoutMs=60000}={}){
  const abort=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,abort]):abort;
  const response=await fetchImpl(url,{headers:{'User-Agent':'CodexUsageBadge-Updater','Accept':url.includes('api.github.com')?'application/vnd.github+json':'application/octet-stream'},signal:combined});
  if(!response.ok)throw Error(`GitHub 请求失败（HTTP ${response.status}）`);
  if(response.url&&url.includes('/releases/download/')&&!allowedDownload(response.url))throw Error('拒绝非 GitHub 安装包地址');
  const length=Number(response.headers.get('content-length'));
  if(length>limit)throw Error('下载内容超出大小限制');
  if(!response.body)throw Error('下载内容为空');
  const chunks=[];let size=0;
  for await(const chunk of response.body){combined.throwIfAborted();size+=chunk.length;if(size>limit)throw Error('下载内容超出大小限制');chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data){let n=0xffffffff;for(const byte of data)n=crcTable[(n^byte)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
function safeName(name){
  return name&&name===name.normalize('NFC')&&!/[\\\x00-\x1f\x7f:]/.test(name)&&!name.startsWith('/')&&
    name.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.endsWith('.')&&!part.endsWith(' '));
}
function readArchive(buffer,version){
  if(!Buffer.isBuffer(buffer)||buffer.length>maxArchive)throw Error('无效安装包');
  let end=-1;
  for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--){
    if(buffer.readUInt32LE(i)===0x06054b50&&i+22+buffer.readUInt16LE(i+20)===buffer.length){end=i;break;}
  }
  if(end<0||buffer.readUInt16LE(end+4)||buffer.readUInt16LE(end+6))throw Error('不支持的 ZIP 格式');
  const count=buffer.readUInt16LE(end+10),centralSize=buffer.readUInt32LE(end+12),start=buffer.readUInt32LE(end+16);
  if(!count||count>128||count!==buffer.readUInt16LE(end+8)||start+centralSize!==end)throw Error('无效 ZIP 索引');
  const prefix=`CodexUsageBadge-macOS-${version}/`,files=new Map(),names=new Set();
  let offset=start,total=0;
  for(let i=0;i<count;i++){
    if(offset+46>end||buffer.readUInt32LE(offset)!==0x02014b50)throw Error('损坏的 ZIP 索引');
    const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),crc=buffer.readUInt32LE(offset+16);
    const compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24);
    const nameSize=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32);
    const mode=buffer.readUInt32LE(offset+38)>>>16,local=buffer.readUInt32LE(offset+42);
    const name=buffer.subarray(offset+46,offset+46+nameSize).toString('utf8');
    offset+=46+nameSize+extra+comment;
    if(offset>end||flags&~0x808||![0,8].includes(method)||((mode&0xf000)!==0&&(mode&0xf000)!==0x8000)||buffer.readUInt16LE(offset-46-nameSize-extra-comment+34)!==0)throw Error('不支持的 ZIP 文件类型');
    if(!name.startsWith(prefix)||!safeName(name.slice(prefix.length)))throw Error('安装包包含不安全路径');
    const relative=name.slice(prefix.length),key=relative.toLowerCase();
    if(names.has(key))throw Error('安装包包含重复文件');names.add(key);
    total+=size;if(total>maxExpanded||size>maxExpanded)throw Error('解压内容超出大小限制');
    if(local+30>start||buffer.readUInt32LE(local)!==0x04034b50||buffer.readUInt16LE(local+6)!==flags||buffer.readUInt16LE(local+8)!==method)throw Error('无效 ZIP 文件头');
    const localNameSize=buffer.readUInt16LE(local+26),localExtra=buffer.readUInt16LE(local+28);
    if(buffer.subarray(local+30,local+30+localNameSize).toString('utf8')!==name)throw Error('ZIP 路径不一致');
    const dataStart=local+30+localNameSize+localExtra;
    if(dataStart+compressed>start)throw Error('ZIP 文件数据越界');
    const packed=buffer.subarray(dataStart,dataStart+compressed);
    const data=method===8?zlib.inflateRawSync(packed,{maxOutputLength:Math.max(1,size)}):Buffer.from(packed);
    if(data.length!==size||crc32(data)!==crc)throw Error('ZIP 文件损坏');
    files.set(relative,{data,mode:mode&0o777});
  }
  if(offset!==end)throw Error('ZIP 索引长度不一致');
  for(const name of files.keys())for(const other of files.keys())if(other.startsWith(name+'/'))throw Error('ZIP 文件与目录冲突');
  for(const name of required)if(!files.has(name))throw Error('安装包缺少更新组件');
  const manifest=JSON.parse(files.get('update.json').data.toString('utf8'));
  if(manifest.schema!==1||manifest.repository!==repository||manifest.platform!=='macOS'||manifest.version!==version)throw Error('更新包版本或来源不匹配');
  const sums=files.get('SHA256SUMS.txt');if(!sums)throw Error('安装包缺少校验清单');
  const checked=new Set();
  for(const line of sums.data.toString('utf8').trim().split('\n')){
    const m=/^([a-f0-9]{64})  (.+)$/.exec(line);
    if(!m||m[2]==='SHA256SUMS.txt'||checked.has(m[2])||!files.has(m[2]))throw Error('无效校验清单');
    const digest=crypto.createHash('sha256').update(files.get(m[2]).data).digest('hex');
    if(digest!==m[1])throw Error('安装包文件校验失败');checked.add(m[2]);
  }
  if(checked.size!==files.size-1)throw Error('安装包包含未校验文件');
  return files;
}
function extractArchive(files,destination){
  fs.mkdirSync(destination,{mode:0o700});
  for(const [name,{data,mode}] of files){const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,data,{flag:'wx',mode:mode&0o111?0o700:0o600});}
}
function writeJson(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp-'+crypto.randomUUID();
  try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{fs.rmSync(temp,{force:true});}
}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function acquireLock(directory,{pid=process.pid,now=Date.now,isAlive=p=>{try{process.kill(p,0);return true;}catch(e){return e.code!=='ESRCH';}}}={}){
  fs.mkdirSync(path.dirname(directory),{recursive:true,mode:0o700});
  for(let attempt=0;attempt<2;attempt++){
    try{fs.mkdirSync(directory,{mode:0o700});fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({pid,startedAt:now()}),{mode:0o600,flag:'wx'});return ()=>fs.rmSync(directory,{recursive:true,force:true});}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      if(fs.lstatSync(directory).isSymbolicLink())throw Error('更新锁目录不能是链接');
      let owner;try{owner=readJson(path.join(directory,'owner.json'));}catch{}
      const predatesBoot=Number.isFinite(owner?.startedAt)&&owner.startedAt<now()-require('node:os').uptime()*1000-10000;
      if(owner&&Number.isSafeInteger(owner.pid)&&owner.pid>0){if(!predatesBoot&&isAlive(owner.pid))return null;}
      else if(now()-fs.statSync(directory).mtimeMs<120000)return null;
      fs.rmSync(directory,{recursive:true,force:true});
    }
  }
  return null;
}
async function updateOnce({installDir,cacheDir,fetchImpl=fetch,install,now=Date.now,signal,force=false,checkOnly=false}){
  const stateFile=path.join(cacheDir,'state.json');
  const settings=readJson(path.join(installDir,'update-settings.json'));
  if(settings?.owner!=='codex-usage-badge-updater-v1')throw Error('自动更新未配置');
  if(settings.enabled===false&&!checkOnly){writeJson(stateFile,{event:'disabled',checkedAt:now()});return {event:'disabled'};}
  const current=readJson(path.join(installDir,'installed-version.json'));
  if(current?.platform!=='macOS'||current.repository!==repository)throw Error('安装版本记录无效');
  versionParts(current.version);
  const last=readJson(stateFile);
  if(!force&&Number.isFinite(last?.nextCheckAt)&&now()<last.nextCheckAt)return {event:'cooldown'};
  const unlock=acquireLock(path.join(cacheDir,'check.lock'),{now});
  if(!unlock)return {event:'busy'};
  let stage;
  const record=value=>{const state={currentVersion:current.version,checkedAt:now(),nextCheckAt:now()+intervalMs,...value};writeJson(stateFile,state);return state;};
  try{
    record({event:'checking'});
    const raw=await fetchBytes(`https://api.github.com/repos/${repository}/releases?per_page=100`,{fetchImpl,limit:2*1024*1024,signal,timeoutMs:20000});
    const release=selectRelease(JSON.parse(raw.toString('utf8')),current.version,{allowPrerelease:settings.allowPrerelease!==false});
    if(!release)return record({event:'up_to_date'});
    if(checkOnly)return record({event:'available',availableVersion:release.version,nextCheckAt:last?.nextCheckAt||0});
    record({event:'downloading',availableVersion:release.version});
    const bytes=await fetchBytes(release.url,{fetchImpl,limit:maxArchive,signal});
    if(bytes.length!==release.size||crypto.createHash('sha256').update(bytes).digest('hex')!==release.digest)throw Error('GitHub 安装包校验失败');
    const files=readArchive(bytes,release.version);signal?.throwIfAborted();
    if(readJson(path.join(installDir,'update-settings.json'))?.enabled===false)return record({event:'disabled'});
    const latest=readJson(path.join(installDir,'installed-version.json'));
    if(latest?.repository!==repository||latest.platform!=='macOS')throw Error('安装版本记录已改变');
    if(compareVersions(latest.version,release.version)>=0)return record({event:'up_to_date',currentVersion:latest.version});
    stage=path.join(cacheDir,'stage-'+crypto.randomUUID());extractArchive(files,stage);
    record({event:'installing',availableVersion:release.version});
    await install(stage,current);
    const updated=readJson(path.join(installDir,'installed-version.json'));
    if(readJson(path.join(installDir,'update-settings.json'))?.enabled===false&&updated?.version===current.version)return record({event:'disabled'});
    if(updated?.repository!==repository||updated.platform!=='macOS'||compareVersions(updated.version,release.version)<0)throw Error('更新后的版本确认失败');
    return record({event:'updated',currentVersion:updated.version,previousVersion:current.version});
  }catch(error){record({event:'error',message:error.message});throw error;}
  finally{if(stage)fs.rmSync(stage,{recursive:true,force:true});unlock();}
}
module.exports={repository,intervalMs,versionParts,compareVersions,selectRelease,fetchBytes,readArchive,extractArchive,writeJson,readJson,acquireLock,updateOnce};
