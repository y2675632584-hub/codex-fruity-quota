/* Hover identity/layout approach adapted from codex-usage-badge (MIT). */
function installThreadTokens() {
  const KEY='__codexFruityTokens',VERSION=3;
  const ROW='[data-app-action-sidebar-thread-row][data-app-action-sidebar-thread-id]';
  if(window[KEY]?.version===VERSION)return;
  window[KEY]?.destroy?.();
  const preferenceKey='codex-fruity-quota:thread-tokens';
  let enabled=true;try{enabled=localStorage.getItem(preferenceKey)!=='off';}catch{}
  let snapshot={ok:false,totals:{},cumulative:{},states:{},checkedAt:null,dayKey:null},hovered=null,pointer=null,timer=null,disposed=false;
  const tooltip=document.createElement('div');tooltip.id='codex-fruity-thread-tokens-tooltip';tooltip.hidden=true;tooltip.setAttribute('role','tooltip');
  const style=document.createElement('style');style.id='codex-fruity-thread-tokens-style';
  style.textContent=`#codex-fruity-thread-tokens-tooltip{position:fixed;z-index:2147483000;pointer-events:none;box-sizing:border-box;max-width:min(310px,calc(100vw - 16px));padding:11px 14px;border:1px solid #8883;border-radius:11px;box-shadow:0 4px 18px #0002;background:var(--color-surface-elevated-secondary,#fafafa);color:var(--color-text-primary,#222);white-space:pre-line;font:12px/1.7 -apple-system,BlinkMacSystemFont,sans-serif;font-variant-numeric:tabular-nums}#codex-fruity-thread-tokens-tooltip[hidden]{display:none!important}html.dark #codex-fruity-thread-tokens-tooltip,html[data-theme="dark"] #codex-fruity-thread-tokens-tooltip{background:var(--color-surface-elevated-secondary,#252525);color:var(--color-text-primary,#eee)}@media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-fruity-thread-tokens-tooltip{background:var(--color-surface-elevated-secondary,#252525);color:var(--color-text-primary,#eee)}}`;
  function attach(){if(!document.body||disposed)return;if(!style.isConnected)(document.head??document.documentElement).append(style);if(!tooltip.isConnected)document.body.append(tooltip);}
  function identity(row){
    const match=/^local:([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.exec(row?.getAttribute('data-app-action-sidebar-thread-id')??'');
    return match&&row.getAttribute('data-app-action-sidebar-thread-host-id')==='local'&&row.getAttribute('data-app-action-sidebar-thread-kind')==='local'?match[1]:null;
  }
  function dayKey(){const d=new Date();return[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
  function position(){if(!hovered?.isConnected){clear();return;}const r=hovered.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(r.right+8,innerWidth-tooltip.offsetWidth-8))}px`;tooltip.style.top=`${Math.max(8,Math.min(r.top,innerHeight-tooltip.offsetHeight-8))}px`;}
  function formatCount(value){
    if(!Number.isSafeInteger(value)||value<0)return '暂不可用';
    const [scale,unit]=value>=1e8?[1e8,'亿']:value>=1e4?[1e4,'万']:value>=1e3?[1e3,'千']:[1,''];
    // Truncate to two decimals so a value below the next unit cannot round up to it.
    return String(Number((Math.floor(value/scale*100)/100).toFixed(2)))+unit;
  }
  function render(){
    if(tooltip.hidden)return;
    const id=identity(hovered);let daily='暂不可用',cumulative='暂不可用';
    if(id){
      if(snapshot.checkedAt===null||snapshot.ok&&!snapshot.states[id])daily=cumulative='读取中…';
      else if(snapshot.ok){
        if(Date.now()-snapshot.checkedAt>15000||snapshot.checkedAt>Date.now()+1000)daily=cumulative='待同步';
        else {
          daily=snapshot.dayKey!==dayKey()?'读取中…':snapshot.scope==='today'&&snapshot.states[id]==='ready'?formatCount(snapshot.totals[id]):'暂不可用';
          cumulative=formatCount(snapshot.cumulative[id]);
        }
      }
    }
    tooltip.textContent=`今日 Token  ${daily}\n累计 Token  ${cumulative}`;position();
  }
  function clear(){clearTimeout(timer);timer=null;hovered=null;pointer=null;tooltip.hidden=true;}
  function rowAtPointer(){if(!enabled||!pointer||document.hidden)return null;return document.elementFromPoint(pointer.x,pointer.y)?.closest(ROW)??null;}
  function track(event){
    if(event.pointerType==='touch'||event.buttons){clear();return;}
    pointer={x:event.clientX,y:event.clientY};const row=rowAtPointer();
    if(row===hovered){render();return;}
    clearTimeout(timer);tooltip.hidden=true;hovered=row;
    if(!row)return;
    timer=setTimeout(()=>{timer=null;if(rowAtPointer()!==hovered||!hovered?.isConnected)return;attach();tooltip.hidden=false;render();},180);
  }
  function onOut(event){if(!event.relatedTarget)clear();}
  function setEnabled(next){enabled=next===true;try{localStorage.setItem(preferenceKey,enabled?'on':'off');}catch{}clear();}
  function onPreference(event){if(event.key===preferenceKey||event.key===null){try{enabled=localStorage.getItem(preferenceKey)!=='off';}catch{enabled=true;}clear();}}
  function onKey(event){if(event.key==='Escape')clear();}
  function onLayout(event){if(event.type==='scroll'&&event.target instanceof Element&&!event.target.contains(hovered))return;clear();}
  const freshness=setInterval(()=>{attach();if(hovered&&!hovered.isConnected)clear();else render();},1000);
  document.addEventListener('pointerover',track,true);document.addEventListener('pointermove',track,true);
  document.addEventListener('pointerout',onOut,true);document.addEventListener('pointerdown',clear,true);
  document.addEventListener('keydown',onKey);document.addEventListener('visibilitychange',clear);
  document.addEventListener('scroll',onLayout,true);window.addEventListener('resize',onLayout);
  window.addEventListener('blur',clear);window.addEventListener('storage',onPreference);
  window[KEY]={version:VERSION,isEnabled:()=>enabled,setEnabled,
    requestedIds(){const id=identity(hovered);return enabled&&id?[id]:[];},
    update(next){snapshot={ok:next?.ok===true,scope:next?.scope,dayKey:typeof next?.dayKey==='string'?next.dayKey:null,checkedAt:Number.isFinite(next?.checkedAt)?next.checkedAt:null,totals:next?.totals&&typeof next.totals==='object'?next.totals:{},cumulative:next?.cumulative&&typeof next.cumulative==='object'?next.cumulative:{},states:next?.states&&typeof next.states==='object'?next.states:{}};render();},
    status(){return{version:VERSION,enabled,visible:!tooltip.hidden,source:'today-local-recorded-tokens',dayKey:snapshot.dayKey,checkedAt:snapshot.checkedAt};},
    destroy(){disposed=true;clear();clearInterval(freshness);document.removeEventListener('pointerover',track,true);document.removeEventListener('pointermove',track,true);document.removeEventListener('pointerout',onOut,true);document.removeEventListener('pointerdown',clear,true);document.removeEventListener('keydown',onKey);document.removeEventListener('visibilitychange',clear);document.removeEventListener('scroll',onLayout,true);window.removeEventListener('resize',onLayout);window.removeEventListener('blur',clear);window.removeEventListener('storage',onPreference);tooltip.remove();style.remove();delete window[KEY];}
  };
  attach();
}
