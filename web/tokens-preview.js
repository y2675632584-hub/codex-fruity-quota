const ids=['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003'];
let mode='live',increment=0;
const rows=document.getElementById('token-rows');
function createRows(){
 rows.replaceChildren();
 [['界面设计',ids[0],'local','local'],['刚开始的对话',ids[1],'local','local'],['安装与测试',ids[2],'local','local'],['远程对话',ids[0],'remote-host','local'],['云端对话',ids[0],'local','chatgpt']].forEach(([title,id,host,kind])=>{
  const row=document.createElement('div');row.className='token-row';row.setAttribute('data-app-action-sidebar-thread-row','');row.setAttribute('data-app-action-sidebar-thread-id',(kind==='local'?'local:':'chatgpt:')+id);row.setAttribute('data-app-action-sidebar-thread-host-id',host);row.setAttribute('data-app-action-sidebar-thread-kind',kind);row.setAttribute('role','button');row.tabIndex=0;
  const slot=document.createElement('div');slot.className='token-title-slot';const text=document.createElement('span');text.setAttribute('data-thread-title','');text.textContent=title;slot.append(text);
  const actions=document.createElement('button');actions.textContent='···';actions.setAttribute('aria-label','对话操作');row.append(slot,actions);rows.append(row);
  row.addEventListener('click',()=>{document.getElementById('test-report').textContent='对话点击正常 · '+title;});
 });
}
function update(){
 const totals=mode==='missing'?{}:{[ids[0]]:18486+increment,[ids[1]]:0,[ids[2]]:2400};
 const cumulative=mode==='missing'?{}:{[ids[0]]:123456789+increment,[ids[1]]:0,[ids[2]]:567800};
 const d=new Date();const dayKey=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const states=Object.fromEntries(ids.map(id=>[id,mode==='missing'?'unavailable':'ready']));
 window.__codexFruityTokens.update({ok:mode!=='failed',scope:'today',dayKey,states,totals,cumulative,checkedAt:Date.now()-(mode==='stale'?31000:0)});
 document.getElementById('test-report').textContent=mode==='live'?'三个本地对话 · 两个远程／云端对话暂无本地记录':mode==='missing'?'悬停显示暂不可用，不会冒充 0':mode==='failed'?'悬停显示读取失败，不展示旧数字':'悬停显示「待同步」';
}
document.getElementById('rail-host').replaceChildren(document.getElementById('rail-template').content.cloneNode(true));
window.installQuotaOrbit();createRows();window.installThreadTokens();
function updateQuota(){
 const weeklyOnly=document.getElementById('tokens-weekly-only').checked;
 const resetMode=document.getElementById('tokens-reset-mode').value;
 const now=Math.floor(Date.now()/1000);
 const resetExpirations=resetMode==='dated'?[now+7*86400,now+14*86400]:resetMode==='unlimited'?[null,null]:[];
 window.__codexOrbit.update({fiveHour:weeklyOnly?null:{usedPercent:35,resetsAt:now+5*3600},weekly:{usedPercent:50,resetsAt:now+7*86400},resetCount:resetMode==='zero'?0:2,resetExpirations,status:'live',fetchedAt:now});
}
document.getElementById('tokens-reset-mode').onchange=updateQuota;
document.getElementById('tokens-weekly-only').onchange=updateQuota;updateQuota();
update();
// Preview-only controls exercise the same pointer events as a real mouse hover.
for(const [button,index]of [['tokens-hover',0],['tokens-hover-zero',1],['tokens-hover-remote',3]])document.getElementById(button).onclick=()=>{
 const row=rows.children[index];row.scrollIntoView({block:'center'});const rect=row.getBoundingClientRect();
 requestAnimationFrame(()=>requestAnimationFrame(()=>row.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse',clientX:rect.left+20,clientY:rect.top+rect.height/2}))));
};
document.getElementById('tokens-leave').onclick=()=>document.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:null}));
document.getElementById('tokens-update').onclick=()=>{mode='live';increment+=12345;update();};
for(const [button,state]of [['tokens-missing','missing'],['tokens-fail','failed'],['tokens-stale','stale']])document.getElementById(button).onclick=()=>{mode=state;update();};
document.getElementById('tokens-rerender').onclick=()=>{createRows();update();};
document.getElementById('tokens-restore').onclick=()=>{mode='live';increment=0;update();};
document.getElementById('theme').onclick=()=>{document.documentElement.classList.toggle('dark');document.getElementById('theme').textContent=document.documentElement.classList.contains('dark')?'浅色外观':'深色外观';};
setInterval(()=>{if(mode==='live')update();},5000);
