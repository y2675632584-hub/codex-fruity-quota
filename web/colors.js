import './quota-orbit.js';

const palettes = {
  classic:{name:'经典黑',light:'#242426',dark:'#eeeef2'},
  blue:{name:'晴空蓝',light:'#527cb5',dark:'#8eaee0'},
  purple:{name:'雾紫',light:'#8e74ad',dark:'#bd9ddf'},
  battery:{name:'电量绿',light:'#269b45',dark:'#34c759'},
  peach:{name:'蜜桃粉',light:'#bd7969',dark:'#eead99'},
  amber:{name:'暖琥珀',light:'#a9853d',dark:'#dec27d'}
};
const $ = id => document.getElementById(id);
const storageKey = 'codex-fruity-color-prototype';
let selection='classic', appearance='light', quotaMode='standard';
try { const stored=localStorage.getItem(storageKey);if(Object.hasOwn(palettes,stored))selection=stored; } catch {}

for (const [id,palette] of Object.entries(palettes)) {
  document.querySelector(`[data-chip="${id}"]`).style.setProperty('--chip-color',palette.light);
}
document.querySelector(`input[name="palette"][value="${selection}"]`).checked=true;

function render() {
  const palette=palettes[selection], remaining=Number($('remaining').value);
  const warning=selection==='battery' && remaining<=30;
  const ink=palette[appearance];
  const usage={ringWindow:quotaMode==='weekly'?'weekly':'fiveHour',
    fiveHour:quotaMode==='weekly'?null:{usedPercent:100-remaining},
    weekly:{usedPercent:quotaMode==='weekly'?100-remaining:50},
    resetCount:$('show-resets').checked?2:0,status:'live'};
  document.querySelector('.preview-panel').classList.toggle('dark-preview',appearance==='dark');
  document.documentElement.style.setProperty('--accent',palette.light);
  for (const id of ['hero-icon','sidebar-icon']) {
    const icon=$(id);
    icon.usage=usage;
    icon.style.setProperty('--orbit-ink',ink);
    icon.style.setProperty('--orbit-track',appearance==='dark'?'#5b5b64':'#c7c7cb');
    const fill=icon.shadowRoot.querySelector('.fill');
    fill.style.stroke=warning?'var(--warning)':'currentColor';
    const button=icon.shadowRoot.querySelector('button');
    button.disabled=true;button.style.cursor='default';
    icon.setAttribute('role','img');icon.setAttribute('aria-label',button.getAttribute('aria-label'));
  }
  $('selected-name').textContent=palette.name;
  $('ring-number').textContent=String(remaining);
  $('remaining-output').textContent=`${remaining}%`;
  $('ring-state').dataset.warning=String(warning);
  $('ring-state').textContent=warning?(remaining===0?'额度已用尽 · 外圈仅显示灰色底环':'低额度提醒 · 外圈已变红'):
    selection==='battery'?'剩余 30% 及以下，外圈自动变红':'保持所选配色';
  $('slider-note').textContent=quotaMode==='weekly'?'没有 5 小时额度时，外圈和四点都表示周额度。':'外圈表示 5 小时额度；四点示意周额度剩余 50%。';
  document.querySelectorAll('[data-remaining]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.remaining)===remaining)));
  document.querySelectorAll('[data-appearance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===appearance)));
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===quotaMode)));
}
document.querySelectorAll('input[name="palette"]').forEach(input=>input.addEventListener('change',()=>{
  selection=input.value;
  try { localStorage.setItem(storageKey,selection); } catch {}
  render();
}));
document.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>{appearance=button.dataset.appearance;render();}));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{quotaMode=button.dataset.mode;render();}));
document.querySelectorAll('[data-remaining]').forEach(button=>button.addEventListener('click',()=>{$('remaining').value=button.dataset.remaining;render();}));
for(const id of ['remaining','show-resets'])$(id).addEventListener('input',render);
$('reset-colors').addEventListener('click',()=>{
  selection='classic';document.querySelector('input[value="classic"]').checked=true;
  try { localStorage.setItem(storageKey,selection); } catch {}
  render();
});
render();
