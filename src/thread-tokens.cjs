// Read-only daily counters. Inspired by the pinned MIT ThreadTokenReader.
// No model RPCs. Extract only metadata identity/time and numerical TokenCount events.
class ThreadTokenReader {
  constructor({home=process.env.CODEX_HOME||require('node:path').join(require('node:os').homedir(),'.codex'),now=()=>Date.now(),maxBytes=128*1024*1024}={}) {
    this.home=home;this.now=now;this.maxBytes=maxBytes;this.cache=new Map();
  }
  async read(ids) {
    const checkedAt=this.now(),day=new Date(checkedAt);day.setHours(0,0,0,0);
    const end=new Date(day);end.setDate(end.getDate()+1);
    const dayKey=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
    const snapshot={ok:true,scope:'today',dayKey,checkedAt,totals:Object.create(null),states:Object.create(null)};
    const requested=[...new Set(Array.isArray(ids)?ids:[])].filter(id=>typeof id==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)).slice(0,100);
    if(!requested.length)return snapshot;
    let db;const fs=require('node:fs'),path=require('node:path');
    try {
      const file=fs.readdirSync(this.home).filter(n=>/^state_\d+\.sqlite$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]))[0];
      if(!file)throw Error('missing');
      const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(path.join(this.home,file),{readOnly:true,timeout:200});
      const rows=db.prepare(`SELECT id,rollout_path,tokens_used FROM threads WHERE id IN (${requested.map(()=>'?').join(',')})`).all(...requested);
      db.close();db=null;
      const roots=['sessions','archived_sessions'].map(n=>path.join(fs.realpathSync(this.home),n));
      for(const id of requested)snapshot.states[id]='unavailable';
      for(const row of rows) {
        try {
          if(typeof row.rollout_path!=='string')continue;
          const target=fs.realpathSync(row.rollout_path);
          if(!roots.some(root=>target.startsWith(root+path.sep))||!target.endsWith('.jsonl'))continue;
          const stat=fs.statSync(target);if(!stat.isFile()||stat.size>this.maxBytes)continue;
          let entry=this.cache.get(row.id);
          if(!entry||entry.defer||entry.path!==target||entry.dayKey!==dayKey||entry.ino!==stat.ino||stat.size<entry.offset||stat.size===entry.offset&&stat.mtimeMs!==entry.mtime) {
            entry={path:target,dayKey,ino:stat.ino,offset:0,mtime:0,buffer:'',skipping:false,meta:false,createdAt:null,forked:false,previous:null,previousTime:null,total:0,invalid:false,sawUsage:false,defer:false};
          }
          if(stat.size>entry.offset) {
            // Process a bounded append; do not load or persist conversation text.
            const stream=fs.createReadStream(target,{start:entry.offset,end:stat.size-1,encoding:'utf8',highWaterMark:65536});
            function skipLarge(line) {
              // Huge tool/message bodies are irrelevant. Classify only the envelope,
              // without parsing or retaining the body. Unknown envelopes stay unavailable.
              try {
                const prefix=line.slice(0,1024),payload=prefix.indexOf('"payload"');
                const envelope=JSON.parse(prefix.slice(0,payload)+'"payload":null}');
                const payloadType=/^"payload"\s*:\s*\{\s*"type"\s*:\s*"([^"\\]+)"/.exec(prefix.slice(payload))?.[1];
                const irrelevant=['response_item','compacted'].includes(envelope.type)||envelope.type==='event_msg'&&payloadType&&payloadType!=='token_count';
                if(payload<0||!irrelevant)entry.invalid=true;
              } catch {entry.invalid=true;}
            }
            for await(const chunk of stream) {
              entry.buffer+=chunk;
              let newline;
              while((newline=entry.buffer.indexOf('\n'))>=0) {
                const line=entry.buffer.slice(0,newline);entry.buffer=entry.buffer.slice(newline+1);
                if(entry.skipping){entry.skipping=false;continue;}
                if(line.length>1024*1024){skipLarge(line);continue;}
                if(!line.includes('"session_meta"')&&!line.includes('"token_count"'))continue;
                let event;try{event=JSON.parse(line);}catch{entry.invalid=true;continue;}
                if(event.type==='session_meta') {
                  if(event.payload?.id!==row.id){entry.invalid=true;continue;}
                  entry.meta=true;entry.createdAt=Date.parse(event.payload.timestamp||event.timestamp);
                  entry.forked=!!event.payload.forked_from_id||!!event.payload.history_base;
                  continue;
                }
                if(event.type!=='event_msg'||event.payload?.type!=='token_count'||!event.payload.info)continue;
                const value=event.payload.info.total_token_usage?.total_tokens,time=Date.parse(event.timestamp);
                if(!Number.isSafeInteger(value)||value<0||!Number.isFinite(time)){entry.invalid=true;continue;}
                entry.sawUsage=true;
                const inDay=time>=day.getTime()&&time<end.getTime()&&time<=checkedAt;
                // A concurrently appended event may be newer than this read's cutoff.
                // Retry it next time instead of permanently invalidating the cache.
                if(time>checkedAt){entry.defer=true;continue;}
                if(entry.previousTime!==null&&time<entry.previousTime){entry.invalid=true;continue;}
                if(entry.previous===null) {
                  // A new local session starts at zero. Older incomplete/forked histories cannot safely be reconstructed.
                  if(inDay&&!(entry.meta&&!entry.forked&&entry.createdAt>=day.getTime()&&entry.createdAt<=time)){entry.invalid=true;}
                  else if(inDay)entry.total+=value;
                } else if(inDay) {
                  if(value<entry.previous)entry.invalid=true;
                  else entry.total+=value-entry.previous;
                }
                entry.previous=value;
                entry.previousTime=time;
                if(!Number.isSafeInteger(entry.total))entry.invalid=true;
              }
              if(entry.buffer.length>1024*1024){if(!entry.skipping)skipLarge(entry.buffer);entry.buffer='';entry.skipping=true;}
            }
            entry.offset=stat.size;
          }
          entry.mtime=stat.mtimeMs;this.cache.set(row.id,entry);
          // A partial final line is still being written. Wait for the next complete snapshot.
          if(!entry.meta||entry.forked||entry.invalid||entry.defer||entry.skipping||entry.buffer.trim())continue;
          if(!entry.sawUsage&&row.tokens_used!==0)continue;
          snapshot.totals[row.id]=entry.total;snapshot.states[row.id]='ready';
        } catch { this.cache.delete(row.id); }
      }
      // Retain a bounded cache of hovered threads, not all account history.
      while(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);
    } catch { snapshot.ok=false;for(const id of requested)snapshot.states[id]='unavailable'; }
    finally {try{db?.close();}catch{}}
    return snapshot;
  }
}
async function refreshThreadTokens(injector,reader) {
  const sessions=[...injector.sessions.values()];if(!sessions.length)return;
  const requests=await Promise.all(sessions.map(async session=>{
    try {const result=await session.evaluate('window.__codexFruityTokens?.requestedIds() ?? []');return {session,ids:Array.isArray(result?.result?.value)?result.result.value:[]};}
    catch{return {session,ids:[]};}
  }));
  const snapshot=await reader.read(requests.flatMap(r=>r.ids));
  await Promise.all(requests.map(async ({session,ids})=>{
    const totals=Object.fromEntries(ids.filter(id=>Object.hasOwn(snapshot.totals,id)).map(id=>[id,snapshot.totals[id]]));
    const states=Object.fromEntries(ids.filter(id=>Object.hasOwn(snapshot.states??{},id)).map(id=>[id,snapshot.states[id]]));
    try {await session.evaluate(`window.__codexFruityTokens?.update(${JSON.stringify({...snapshot,totals,states})})`);}catch{}
  }));
}
