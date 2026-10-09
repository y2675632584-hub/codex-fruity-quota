const $ = id => document.getElementById(id);
let mode = 'live', current = null, fetching = false;
function report() {
  const value = window.__codexOrbit?.status();
  $('test-report').textContent = !value ? '等待组件' : value.placed ? `固定定位成功 · 图标 ${value.badgeCount} 个 · 数据 ${value.status === 'live' ? '已同步' : value.status === 'stale' ? '过期' : '待同步'}` : '导航栏隐藏／缺失 · 图标已隐藏';
}
function createRail() {
  $('rail-host').replaceChildren($('rail-template').content.cloneNode(true));
}
function update(value) { window.__codexOrbit.update(value); report(); }
async function readLive() {
  if (fetching || mode !== 'live') return;
  fetching = true;
  try {
    const response = await fetch('/api/usage',{cache:'no-store'});
    if (!response.ok) throw Error('unavailable');
    current = await response.json();
    if (mode === 'live') {
      update(current);
      $('source').textContent = current.status === 'live' ? '已读取本机真实额度' : '真实额度暂不可用';
      $('connection-light').className = current.status === 'live' ? 'live' : '';
    }
  } catch {
    if (mode === 'live') { update({...current,status:current?'stale':'unavailable'});$('source').textContent='本机连接暂不可用';$('connection-light').className=''; }
  } finally { fetching = false; }
}
function demo() {
  const five=Number($('five').value),week=Number($('week').value);
  $('five-out').textContent=`${five}%`;$('week-out').textContent=`${week}%`;
  update({ringWindow:$('weekly-only').checked?'weekly':'fiveHour',fiveHour:$('weekly-only').checked?null:{usedPercent:five},weekly:{usedPercent:week},resetCount:$('resets').value===''?null:Number($('resets').value),fetchedAt:Date.now()/1000,status:'live'});
  $('source').textContent='演示数据 · 非真实额度';$('connection-light').className='';
}
createRail();
window.installQuotaOrbit();
$('demo').onclick=()=>{mode='demo';$('demo-controls').hidden=false;$('demo').classList.add('selected');$('live').classList.remove('selected');demo();};
$('live').onclick=()=>{mode='live';$('demo-controls').hidden=true;$('live').classList.add('selected');$('demo').classList.remove('selected');readLive();};
for(const id of ['five','week','resets','weekly-only'])$(id).addEventListener('input',demo);
$('rerender').onclick=()=>{createRail();setTimeout(report,180);};
$('toggle-rail').onclick=()=>{
  const rail=document.querySelector('nav[data-app-navigation-rail]');rail.hidden=!rail.hidden;
  $('toggle-rail').textContent=rail.hidden?'显示导航栏':'隐藏导航栏';window.__codexOrbit.place();report();
};
$('theme').onclick=()=>{document.documentElement.classList.toggle('dark');$('theme').textContent=document.documentElement.classList.contains('dark')?'浅色外观':'深色外观';};
readLive();setInterval(()=>{if(!document.hidden)readLive();report();},60000);
