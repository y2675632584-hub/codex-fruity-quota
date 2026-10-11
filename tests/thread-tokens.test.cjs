'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {ThreadTokenReader,refreshThreadTokens,buildBootstrapScript}=require('../build/agent.cjs');
const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'];
const at=(day,hour)=>new Date(2026,9,day,hour).toISOString();
const meta=(id,day=10,extra={})=>({type:'session_meta',timestamp:at(day,9),payload:{id,timestamp:at(day,9),...extra}});
const count=(day,hour,value)=>({type:'event_msg',timestamp:at(day,hour),payload:{type:'token_count',info:{total_token_usage:{total_tokens:value,cached_input_tokens:100,reasoning_output_tokens:100},last_token_usage:{total_tokens:999}}}});
function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'fruity-tokens-'));fs.mkdirSync(path.join(home,'sessions'));
 const file=path.join(home,'state_5.sqlite'),db=new DatabaseSync(file);
 t.after(()=>{db.close();fs.rmSync(home,{recursive:true,force:true});});
 db.exec('PRAGMA journal_mode=WAL;CREATE TABLE threads(id TEXT PRIMARY KEY,rollout_path TEXT,tokens_used INTEGER,title TEXT)');
 let now=new Date(2026,9,11,12).getTime();
 const reader=new ThreadTokenReader({home,now:()=>now});
 function put(id,events,tokens=9000){const target=path.join(home,'sessions',id+'.jsonl');fs.writeFileSync(target,events.map(JSON.stringify).join('\n')+'\n');db.prepare('INSERT OR REPLACE INTO threads VALUES(?,?,?,?)').run(id,target,tokens,'PRIVATE_TITLE');return target;}
 return {home,file,db,reader,put,setNow:n=>{now=n;}};
}
test('today sums cumulative deltas across midnight, ignores duplicate snapshots and component counters',async t=>{
 const {reader,put,db}=fixture(t);put(ids[0],[meta(ids[0]),count(10,23,1000),count(11,1,1300),count(11,2,1300),count(11,11,1800)]);
 const s=await reader.read([ids[0],ids[0],"');DROP TABLE threads;--"]);
 assert.equal(s.scope,'today');assert.equal(s.dayKey,'2026-10-11');assert.equal(s.totals[ids[0]],800);assert.equal(s.states[ids[0]],'ready');
 assert.doesNotMatch(JSON.stringify(s),/PRIVATE_TITLE/);assert.equal(db.prepare('SELECT count(*) AS n FROM threads').get().n,1);
});
test('new session today starts at zero; no usage today is a genuine zero',async t=>{
 const {reader,put}=fixture(t);put(ids[0],[meta(ids[0],11),count(11,10,100),count(11,11,250)]);
 put(ids[1],[meta(ids[1]),count(10,23,1000)]);
 const s=await reader.read(ids);assert.equal(s.totals[ids[0]],250);assert.equal(s.totals[ids[1]],0);
});
test('a brand new local session without token events reports zero only when database confirms zero',async t=>{
 const {reader,put}=fixture(t);put(ids[0],[meta(ids[0],11)],0);put(ids[1],[meta(ids[1],11)],100);
 const s=await reader.read(ids);assert.equal(s.totals[ids[0]],0);assert.equal(s.states[ids[1]],'unavailable');
});
test('missing prior baseline, fork history and declining counters stay unavailable',async t=>{
 const {reader,put}=fixture(t);
 for(const events of [[meta(ids[0]),count(11,10,100)], [meta(ids[0],11,{forked_from_id:ids[1]}),count(11,10,100)], [meta(ids[0]),count(10,23,1000),count(11,10,500)]]){
  put(ids[0],events);reader.cache.clear();const s=await reader.read([ids[0]]);assert.equal(s.states[ids[0]],'unavailable');assert.equal(s.totals[ids[0]],undefined);
 }
});
test('incremental append is counted once, and partial lines wait for completion',async t=>{
 const {reader,put,file}=fixture(t);const target=put(ids[0],[meta(ids[0]),count(10,23,1000),count(11,10,1200)]);const before=fs.readFileSync(file);
 assert.equal((await reader.read(ids)).totals[ids[0]],200);
 const line=JSON.stringify(count(11,11,1500));fs.appendFileSync(target,line.slice(0,20));assert.equal((await reader.read(ids)).states[ids[0]],'unavailable');
 fs.appendFileSync(target,line.slice(20)+'\n');assert.equal((await reader.read(ids)).totals[ids[0]],500);assert.equal((await reader.read(ids)).totals[ids[0]],500);
 assert.deepEqual(fs.readFileSync(file),before);
});
test('large conversation bodies are skipped without discarding valid numeric events',async t=>{
 const {reader,put}=fixture(t);
 put(ids[0],[meta(ids[0]),count(10,23,1000),{timestamp:at(11,10),type:'response_item',payload:{type:'message',content:'PRIVATE '+ 'x'.repeat(2*1024*1024)}},{timestamp:at(11,10),type:'event_msg',payload:{type:'item_completed',item:'x'.repeat(2*1024*1024)}},{timestamp:at(11,10),type:'compacted',payload:{content:'x'.repeat(2*1024*1024)}},count(11,11,1200)]);
 const s=await reader.read(ids);assert.equal(s.totals[ids[0]],200);assert.doesNotMatch(JSON.stringify(s),/PRIVATE/);
});
test('local midnight resets daily total using the previous day baseline',async t=>{
 const {reader,put,setNow}=fixture(t);const target=put(ids[0],[meta(ids[0]),count(10,23,1000),count(11,11,1500)]);
 assert.equal((await reader.read(ids)).totals[ids[0]],500);
 setNow(new Date(2026,9,12,12).getTime());fs.appendFileSync(target,JSON.stringify(count(12,10,1700))+'\n');
 const s=await reader.read(ids);assert.equal(s.dayKey,'2026-10-12');assert.equal(s.totals[ids[0]],200);
});
test('concurrent future event retries without permanently poisoning cache',async t=>{
 const {reader,put,setNow}=fixture(t);put(ids[0],[meta(ids[0]),count(10,23,1000),count(11,13,1500)]);
 assert.equal((await reader.read(ids)).states[ids[0]],'unavailable');setNow(new Date(2026,9,11,14).getTime());
 assert.equal((await reader.read(ids)).totals[ids[0]],500);
});
test('unsafe and out-of-order records are unavailable instead of guessed',async t=>{
 const {reader,put}=fixture(t);
 for(const tail of [[count(11,10,Number.MAX_SAFE_INTEGER+2)],[count(11,11,1200),count(11,10,1300)]]){
  put(ids[0],[meta(ids[0]),count(10,23,1000),...tail]);reader.cache.clear();assert.equal((await reader.read(ids)).states[ids[0]],'unavailable');
 }
});
test('external rollout paths and missing files are not read',async t=>{
 const {reader,put,db,home}=fixture(t);const target=put(ids[0],[meta(ids[0]),count(10,23,1000)]);
 const outside=path.join(home,'private.jsonl');fs.renameSync(target,outside);db.prepare('UPDATE threads SET rollout_path=?').run(outside);
 assert.equal((await reader.read(ids)).states[ids[0]],'unavailable');fs.unlinkSync(outside);assert.equal((await reader.read(ids)).states[ids[0]],'unavailable');
});
test('unknown newer schema never falls back; missing database is never created',async t=>{
 const {reader,home}=fixture(t);const future=new DatabaseSync(path.join(home,'state_6.sqlite'));future.exec('CREATE TABLE other(id TEXT)');future.close();
 assert.equal((await reader.read(ids)).ok,false);const missing=path.join(home,'missing');assert.equal((await new ThreadTokenReader({home:missing}).read(ids)).ok,false);assert.equal(fs.existsSync(missing),false);
});
test('each window receives only hovered thread data, without generation',async()=>{
 const outputs=[[],[]],sessions=ids.map((id,i)=>({evaluate:async source=>{if(source.includes('requestedIds()'))return {result:{value:[id]}};outputs[i].push(source);}}));let requested;
 await refreshThreadTokens({sessions:new Map(sessions.map((s,i)=>[i,s]))},{read:async input=>{requested=input;return{ok:true,scope:'today',dayKey:'2026-10-11',checkedAt:Date.now(),totals:{[ids[0]]:2,[ids[1]]:3},states:{[ids[0]]:'ready',[ids[1]]:'ready'}};}});
 assert.deepEqual(requested,ids);assert.ok(outputs[0][0].includes(ids[0]));assert.ok(!outputs[0][0].includes(ids[1]));
 for(const item of outputs.flat())assert.doesNotMatch(item,/turn\/start|thread\/resume|account\/|PRIVATE/);
});
test('closed and disabled windows request no records',async()=>{
 let requested;const good={evaluate:async source=>source.includes('requestedIds()')?{result:{value:[]}}:{}};
 await refreshThreadTokens({sessions:new Map([['bad',{evaluate:async()=>{throw Error('closed');}}],['good',good]])},{read:async ids=>{requested=ids;return{ok:true,totals:{},states:{},checkedAt:Date.now()};}});assert.deepEqual(requested,[]);
});
test('bootstrap injects hover-only daily UI, no persistent token badge or database code',()=>{
 const s=buildBootstrapScript();assert.match(s,/今日 Token/);assert.match(s,/pointerover/);assert.match(s,/tooltip.hidden=true/);assert.match(s,/悬停对话时显示今日 Token/);
 assert.doesNotMatch(s,/DatabaseSync|SELECT id|installProjectColors|Codex 记录累计|thread-token-badge/);
});
