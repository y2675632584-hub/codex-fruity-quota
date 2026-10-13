/* Placement is adapted from codex-usage-badge (MIT). See THIRD_PARTY_NOTICES.md. */
function installQuotaOrbit() {
  const key = '__codexOrbit';
  const version = 8;
  if (window[key]?.version === version) { window[key].place(); return; }
  window[key]?.destroy?.();
  const badge = document.createElement('div');
  badge.id = 'codex-orbit-badge';
  badge.tabIndex = 0;
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-label', '正在读取 Codex 额度');
  badge.setAttribute('aria-expanded', 'false');
  badge.setAttribute('aria-controls', 'codex-orbit-details');
  badge.setAttribute('aria-haspopup', 'dialog');
  const palettes = {
    classic:{name:'经典黑',light:'#242426',dark:'#eeeef2'},
    blue:{name:'晴空蓝',light:'#527cb5',dark:'#8eaee0'},
    purple:{name:'雾紫',light:'#8e74ad',dark:'#bd9ddf'},
    battery:{name:'电量绿',light:'#269b45',dark:'#34c759'},
    peach:{name:'蜜桃粉',light:'#bd7969',dark:'#eead99'},
    amber:{name:'暖琥珀',light:'#a9853d',dark:'#dec27d'}
  };
  const storageKey = 'codex-fruity-quota:palette';
  const validPalette = id => typeof id === 'string' && Object.hasOwn(palettes,id);
  let palette = 'classic';
  try { const saved=localStorage.getItem(storageKey); if(validPalette(saved))palette=saved; } catch {}
  badge.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <path class="orbit-track" d="M24.544155877 75.455844123 A36 36 0 1 1 75.455844123 75.455844123" pathLength="100"/>
    <path class="orbit-fill" d="M24.544155877 75.455844123 A36 36 0 1 1 75.455844123 75.455844123" pathLength="100" visibility="hidden"/>
    <text class="orbit-resets" x="50" y="50" visibility="hidden"></text>
    <path class="orbit-week-track" d="M33.656342009 82.07623487 A36 36 0 0 0 66.343657991 82.07623487" pathLength="100"/>
    <path class="orbit-week-fill" d="M33.656342009 82.07623487 A36 36 0 0 0 66.343657991 82.07623487" pathLength="100" visibility="hidden"/>
  </svg>`;
  const style = document.createElement('style');
  style.id = 'codex-orbit-style';
  style.textContent = `
    #codex-orbit-badge { --orbit-track:#bfc2c5; --orbit-ink:var(--orbit-palette-light,var(--color-text-primary,#222));
      color:var(--orbit-ink); box-sizing:border-box; position:relative; width:44px; height:52px;
      flex:0 0 52px; align-self:center; margin:0 0 4px; padding:4px;
      display:flex; align-items:center; justify-content:center; border-radius:11px;
      cursor:pointer; user-select:none; -webkit-app-region:no-drag; }
    #codex-orbit-badge[hidden],#codex-orbit-details[hidden]{display:none!important}
    #codex-orbit-badge:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
    #codex-orbit-badge:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
    #codex-orbit-badge svg{display:block;width:36px;height:36px;overflow:visible}
    #codex-orbit-badge path{fill:none;stroke-width:6.5;stroke-linecap:round}
    #codex-orbit-badge .orbit-track{stroke:var(--orbit-track)}
    #codex-orbit-badge .orbit-fill{stroke:currentColor;transition:stroke-dasharray .25s ease}
    #codex-orbit-badge[data-low="true"] .orbit-fill{stroke:#e5484d}
    #codex-orbit-badge .orbit-week-track{stroke:var(--orbit-track)}
    #codex-orbit-badge .orbit-week-fill{stroke:currentColor;transition:stroke-dasharray .25s ease}
    #codex-orbit-badge[data-week-low="true"] .orbit-week-fill{stroke:#e5484d}
    #codex-orbit-badge text{fill:currentColor;font:600 29px -apple-system,BlinkMacSystemFont,sans-serif;
      text-anchor:middle;dominant-baseline:central;font-variant-numeric:tabular-nums}
    #codex-orbit-badge[data-state="unavailable"] .orbit-track{stroke-dasharray:3 6}
    #codex-orbit-badge[data-state="stale"] svg{opacity:.45}
    html.dark #codex-orbit-badge,html[data-theme="dark"] #codex-orbit-badge{--orbit-ink:var(--orbit-palette-dark,var(--color-text-primary,#eee));--orbit-track:#56595d}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-badge{--orbit-ink:var(--orbit-palette-dark,var(--color-text-primary,#eee));--orbit-track:#56595d}}
    #codex-orbit-details{box-sizing:border-box;position:fixed;z-index:2147483000;
      width:280px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:16px;border:1px solid #8884;border-radius:16px;
      color:var(--color-text-primary,#222);background:var(--color-surface-elevated-secondary,#fafafa);
      box-shadow:0 5px 22px #0002;font:12px/1.8 -apple-system,BlinkMacSystemFont,sans-serif;
      -webkit-app-region:no-drag;}
    #codex-orbit-details .orbit-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;font-size:14px;font-weight:600}
    #codex-orbit-details .orbit-close{width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:20px/1 sans-serif}
    #codex-orbit-details .orbit-close:hover{background:#8882}
    #codex-orbit-details .orbit-quota{margin-bottom:18px}
    #codex-orbit-details .orbit-quota-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;font-variant-numeric:tabular-nums}
    #codex-orbit-details .orbit-quota-track{height:7px;border-radius:4px;background:#8883;overflow:hidden}
    #codex-orbit-details .orbit-quota-fill{display:block;height:100%;border-radius:inherit;background:var(--orbit-details-light,currentColor);transition:width .25s ease}
    #codex-orbit-details .orbit-quota-reset{font-size:11px;opacity:.65;margin-top:6px}
    #codex-orbit-details .orbit-reset-summary{white-space:pre-line}
    #codex-orbit-details .orbit-reset-expirations{white-space:pre-line;margin-top:10px;font-size:11px}
    #codex-orbit-details fieldset{border:0;border-top:1px solid #8883;margin:14px 0 0;padding:12px 0 0;min-width:0}
    #codex-orbit-details legend{float:left;width:100%;padding:0;margin:0 0 8px;font-weight:600}
    #codex-orbit-details .orbit-colors{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;clear:both}
    #codex-orbit-details .orbit-choice{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;margin:0;border:1px solid #8883;border-radius:10px;padding:9px 2px;cursor:pointer;font-size:11px;line-height:1.5}
    #codex-orbit-details .orbit-choice:hover{background:#8881}
    #codex-orbit-details .orbit-choice:has(input:checked){border-color:currentColor;background:#8881}
    #codex-orbit-details .orbit-check{visibility:hidden;position:absolute;right:5px;top:3px;font-size:10px}
    #codex-orbit-details .orbit-choice:has(input:checked) .orbit-check{visibility:visible}
    #codex-orbit-details input[type=radio]{position:absolute;opacity:0;width:1px;height:1px}
    #codex-orbit-details .orbit-swatch{width:18px;height:18px;border-radius:50%;background:var(--swatch-light)}
    #codex-orbit-details .orbit-choice:has(input:focus-visible),#codex-orbit-details .orbit-close:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    #codex-orbit-details .orbit-color-note,#codex-orbit-details .orbit-save-status{font-size:11px;line-height:1.6;opacity:.75;margin:10px 0 0}
    #codex-orbit-details .orbit-save-status:empty{display:none}
    html.dark #codex-orbit-details,html[data-theme="dark"] #codex-orbit-details{color:var(--color-text-primary,#eee);background:var(--color-surface-elevated-secondary,#252525)}
    html.dark #codex-orbit-details .orbit-quota-fill,html[data-theme="dark"] #codex-orbit-details .orbit-quota-fill{background:var(--orbit-details-dark,currentColor)}
    html.dark #codex-orbit-details .orbit-swatch,html[data-theme="dark"] #codex-orbit-details .orbit-swatch{background:var(--swatch-dark)}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details{color:var(--color-text-primary,#eee);background:var(--color-surface-elevated-secondary,#252525)}}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details .orbit-swatch{background:var(--swatch-dark)}}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details .orbit-quota-fill{background:var(--orbit-details-dark,currentColor)}}
    #codex-orbit-details[data-week-low="true"] .orbit-week .orbit-quota-fill{background:#e5484d}
    #codex-orbit-details[data-week-low="true"] .orbit-week .orbit-quota-percent{color:#e5484d}
    @media(prefers-reduced-motion:reduce){#codex-orbit-badge .orbit-fill,#codex-orbit-badge .orbit-week-fill,#codex-orbit-details .orbit-quota-fill{transition:none}}
  `;
  const details = document.createElement('div');
  details.id = 'codex-orbit-details';
  details.hidden = true;
  details.setAttribute('role', 'dialog');
  details.setAttribute('aria-label', 'Codex 额度与配色');
  details.innerHTML = `<div class="orbit-heading"><span>Codex 剩余额度</span><button type="button" class="orbit-close" aria-label="关闭额度详情">×</button></div>
    <div class="orbit-summary">
      <div class="orbit-quota orbit-hour"><div class="orbit-quota-header"><span>5 小时</span><span class="orbit-quota-percent"></span></div><div class="orbit-quota-track" role="progressbar" aria-label="5 小时剩余额度" aria-valuemin="0" aria-valuemax="100"><span class="orbit-quota-fill"></span></div><div class="orbit-quota-reset"></div></div>
      <div class="orbit-quota orbit-week"><div class="orbit-quota-header"><span>本周</span><span class="orbit-quota-percent"></span></div><div class="orbit-quota-track" role="progressbar" aria-label="本周剩余额度" aria-valuemin="0" aria-valuemax="100"><span class="orbit-quota-fill"></span></div><div class="orbit-quota-reset"></div></div>
      <div class="orbit-reset-summary"></div><div class="orbit-reset-expirations"></div>
    </div><fieldset><legend>图标配色</legend><div class="orbit-colors"></div></fieldset>
    <p class="orbit-color-note">仅电量绿在剩余 ≤30% 时外圈变红；周额度低于 20% 时，所有配色的周额度线与详情条都变红。</p>
    <fieldset><legend>对话用量</legend><label><input type="checkbox" class="orbit-token-toggle"> 悬停对话时显示 Token</label><p class="orbit-color-note">显示今日与累计用量，不消耗 Token。</p></fieldset>
    <p class="orbit-save-status" role="status"></p>`;
  const tokenToggle=details.querySelector('.orbit-token-toggle');
  tokenToggle.addEventListener('change',()=>window.__codexFruityTokens?.setEnabled(tokenToggle.checked));
  const summary = details.querySelector('.orbit-summary');
  const saveStatus = details.querySelector('.orbit-save-status');
  for(const [id,entry] of Object.entries(palettes)) {
    const label=document.createElement('label');label.className='orbit-choice';
    label.style.setProperty('--swatch-light',entry.light);label.style.setProperty('--swatch-dark',entry.dark);
    const input=document.createElement('input');input.type='radio';input.name='codex-fruity-palette';input.value=id;
    const swatch=document.createElement('span');swatch.className='orbit-swatch';swatch.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.textContent=entry.name;
    const check=document.createElement('span');check.className='orbit-check';check.textContent='✓';check.setAttribute('aria-hidden','true');
    label.append(input,swatch,name,check);details.querySelector('.orbit-colors').appendChild(label);
    input.addEventListener('change',()=>{
      if(!input.checked)return;
      palette=id;
      try { localStorage.setItem(storageKey,id);saveStatus.textContent='配色已保存'; }
      catch { saveStatus.textContent='配色已应用；当前环境无法保存，重开后会恢复默认。'; }
      render();
    });
  }
  let value = { fiveHour: null, weekly: null, resetCount: null, status: 'unavailable' };
  let rail = null, disposed = false, placementTimer = null, pinned = false, placementReason = 'waiting';
  const visible = element => {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const remaining = windowValue => typeof windowValue?.usedPercent === 'number' && Number.isFinite(windowValue.usedPercent)
    ? 100 - Math.min(100, Math.max(0, windowValue.usedPercent)) : null;
  const percent = amount => amount === null ? '暂不可用' : `${Math.round(amount)}%`;
  function resetTime(windowValue) {
    if (!Number.isFinite(windowValue?.resetsAt)) return '重置时间暂不可用';
    const date = new Date(windowValue.resetsAt * 1000);
    if (!Number.isFinite(date.getTime())) return '重置时间暂不可用';
    return `重置 ${date.toLocaleString(undefined, { month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' })}`;
  }
  function creditExpiryText(count) {
    if (!(count > 0)) return '';
    const groups = new Map();
    const expirations = Array.isArray(value.resetExpirations) ? value.resetExpirations : [];
    let known = 0;
    for (const expiry of expirations.slice(0, Math.min(count, 100))) {
      if (expiry !== null && (!Number.isSafeInteger(expiry) || expiry <= 0 || expiry > 8640000000000)) continue;
      groups.set(expiry, (groups.get(expiry) ?? 0) + 1); known++;
    }
    const lines = [...groups].sort(([a],[b]) => (a ?? Infinity) - (b ?? Infinity)).map(([expiry,number]) => {
      const label = expiry === null ? '无到期限制' : new Date(expiry * 1000).toLocaleString(undefined,
        {year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      return `${label}（${number} 张）`;
    });
    if (known < count) lines.push(`到期时间暂不可用（${count-known} 张）`);
    return `重置卡到期\n${lines.join('\n')}`;
  }
  function positionDetails() {
    const rect = badge.getBoundingClientRect();
    details.style.left = `${Math.max(8, Math.min(rect.right + 10, innerWidth - details.offsetWidth - 8))}px`;
    details.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - details.offsetHeight - 8))}px`;
  }
  function hideDetails() {
    pinned = false;
    details.hidden = true;
    badge.setAttribute('aria-expanded', 'false');
  }
  function showDetails() {
    if (disposed || !visible(badge) || document.hidden) return;
    details.hidden = false;
    badge.setAttribute('aria-expanded', 'true');
    tokenToggle.checked=window.__codexFruityTokens?.isEnabled() ?? true;
    positionDetails();
  }
  function render() {
    const five = remaining(value.fiveHour), week = remaining(value.weekly);
    const ringWindow = value.ringWindow ?? (value.fiveHour ? 'fiveHour' : value.weekly ? 'weekly' : null);
    const ring = ringWindow === 'weekly' ? week : five;
    const ringLabel = ringWindow === 'weekly' ? '本周（外圈）' : '5 小时';
    const count = Number.isInteger(value.resetCount) && value.resetCount >= 0 ? value.resetCount : null;
    const state = value.status === 'stale' ? 'stale' : (five === null && week === null) ? 'unavailable' : 'live';
    badge.dataset.state = state;
    badge.dataset.palette = palette;
    badge.dataset.low = String(palette === 'battery' && ring !== null && ring <= 30);
    badge.dataset.weekLow = details.dataset.weekLow = String(week !== null && week < 20);
    for(const appearance of ['light','dark']) {
      const property=`--orbit-palette-${appearance}`;
      if(palette === 'classic'){badge.style.removeProperty(property);details.style.removeProperty(`--orbit-details-${appearance}`);}
      else {badge.style.setProperty(property,palettes[palette][appearance]);details.style.setProperty(`--orbit-details-${appearance}`,palettes[palette][appearance]);}
    }
    details.querySelectorAll('input[type=radio]').forEach(input=>{input.checked=input.value===palette;});
    const fill = badge.querySelector('.orbit-fill');
    fill.setAttribute('visibility', ring !== null && ring > 0 ? 'visible' : 'hidden');
    fill.setAttribute('stroke-dasharray', `${ring ?? 0} 100`);
    const text = badge.querySelector('.orbit-resets');
    text.textContent = count > 0 ? String(count) : '';
    text.setAttribute('visibility', count > 0 ? 'visible' : 'hidden');
    text.style.fontSize = count > 99 ? '21px' : '';
    const weeklyFill=badge.querySelector('.orbit-week-fill');
    weeklyFill.setAttribute('visibility',week!==null&&week>0?'visible':'hidden');
    weeklyFill.setAttribute('stroke-dasharray',`${week??0} 100`);
    const weeklyTrack=badge.querySelector('.orbit-week-track');
    if(week===null)weeklyTrack.setAttribute('stroke-dasharray','2 5');else weeklyTrack.removeAttribute('stroke-dasharray');
    const resetLabel = count === null ? '暂不可用' : `${count} 次`;
    const description = `${ringLabel}剩余 ${percent(ring)}，周剩余 ${percent(week)}，可用重置 ${resetLabel}${state === 'stale' ? '，数据未同步' : ''}`;
    badge.setAttribute('aria-label', description);
    summary.querySelector('.orbit-hour').hidden=ringWindow==='weekly'&&!value.fiveHour;
    for(const [selector,amount,windowValue] of [['.orbit-hour',five,value.fiveHour],['.orbit-week',week,value.weekly]]){
      const block=summary.querySelector(selector),track=block.querySelector('.orbit-quota-track');
      block.querySelector('.orbit-quota-percent').textContent=percent(amount);
      block.querySelector('.orbit-quota-fill').style.width=`${amount??0}%`;
      block.querySelector('.orbit-quota-reset').textContent=resetTime(windowValue);
      if(amount===null)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(amount));
      track.setAttribute('aria-valuetext',percent(amount));
      track.style.opacity=state==='stale'?'.45':'1';
    }
    summary.querySelector('.orbit-reset-summary').textContent=`可用重置 ${resetLabel}\n${state === 'stale' ? '同步失败 · 上次成功数据' : state === 'unavailable' ? '等待账号额度数据' : '本机读取 · 点击不消耗重置次数'}`;
    const expirationBlock=summary.querySelector('.orbit-reset-expirations');
    expirationBlock.textContent=creditExpiryText(count);
    expirationBlock.hidden=!(count>0);
    if (!details.hidden) positionDetails();
  }
  function place() {
    if (disposed || !document.body) return;
    if (!style.isConnected) (document.head ?? document.documentElement).appendChild(style);
    if (!details.isConnected) document.body.appendChild(details);
    const nextRail = [...document.querySelectorAll('nav[data-app-navigation-rail]')].find(visible);
    if (rail !== nextRail) {
      if (rail) resizeObserver.unobserve(rail);
      rail = nextRail ?? null;
      if (rail) resizeObserver.observe(rail);
    }
    // Reuse the upstream placement: insert a sibling before help/profile footer.
    // Leave all React-owned elements in their original parents.
    const footer = rail && [...rail.children].filter(element => element !== badge && visible(element) && getComputedStyle(element).position !== 'absolute').at(-1);
    if (document.getElementById('codex-usage-badge')) {
      placementReason = 'other-badge-detected'; badge.hidden = true; hideDetails(); return;
    }
    if (!rail || !footer) { placementReason = rail ? 'footer-not-found' : 'navigation-rail-not-found'; badge.hidden = true; hideDetails(); return; }
    placementReason = 'footer-placement';
    badge.hidden = false;
    if (badge.parentElement !== rail || badge.nextElementSibling !== footer) rail.insertBefore(badge, footer);
    if (!details.hidden) positionDetails();
  }
  function schedulePlacement() {
    if (disposed || placementTimer !== null) return;
    placementTimer = setTimeout(() => { placementTimer = null; place(); }, 100);
  }
  const observer = new MutationObserver(records => {
    if (records.some(record => !badge.contains(record.target) && !details.contains(record.target) && record.target !== style)) schedulePlacement();
  });
  const resizeObserver = new ResizeObserver(schedulePlacement);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  const freshnessTimer = setInterval(() => {
    if (value.status === 'live' && Number.isFinite(value.fetchedAt) && Date.now() / 1000 - value.fetchedAt > 150) {
      value = { ...value, status:'stale' }; render();
    }
  }, 15000);
  const onClick = () => { pinned = !pinned; pinned ? showDetails() : hideDetails(); };
  const onKey = event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); }
  };
  const onVisibility = () => { pinned = false; hideDetails(); };
  const closeDetails = () => { hideDetails();badge.focus(); };
  const onEscape = event => { if(event.key==='Escape'&&!details.hidden){event.preventDefault();event.stopPropagation();closeDetails();} };
  const onOutside = event => { if(!details.hidden&&!badge.contains(event.target)&&!details.contains(event.target))hideDetails(); };
  const onStorage = event => {
    if(event.key!==storageKey&&event.key!==null)return;
    palette=validPalette(event.newValue)?event.newValue:'classic';saveStatus.textContent='';render();
  };
  details.querySelector('.orbit-close').addEventListener('click',closeDetails);
  badge.addEventListener('click', onClick);
  badge.addEventListener('keydown', onKey);
  window.addEventListener('resize', schedulePlacement);
  window.addEventListener('storage', onStorage);
  document.addEventListener('pointerdown', onOutside);
  document.addEventListener('keydown', onEscape);
  document.addEventListener('visibilitychange', onVisibility);
  window[key] = {
    version, place,
    update(next) { value = { ...value, ...next }; render(); place(); },
    status() {
      return { version, placed: badge.parentElement === rail && visible(badge) && !badge.hidden,
        badgeCount:document.querySelectorAll('#codex-orbit-badge').length,
        ringWindow:value.ringWindow ?? (value.fiveHour ? 'fiveHour' : value.weekly ? 'weekly' : null), status:value.status, fetchedAt:value.fetchedAt ?? null, fiveRemaining:remaining(value.fiveHour),
        weeklyRemaining:remaining(value.weekly), resetCount:value.resetCount,
        palette, lowQuota:badge.dataset.low==='true', lowWeeklyQuota:badge.dataset.weekLow==='true', reason:placementReason };
    },
    destroy() {
      disposed = true; observer.disconnect(); resizeObserver.disconnect();
      clearTimeout(placementTimer); clearInterval(freshnessTimer);
      window.removeEventListener('resize', schedulePlacement);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('visibilitychange', onVisibility);
      badge.remove(); details.remove(); style.remove(); delete window[key];
    }
  };
  render(); place();
}
