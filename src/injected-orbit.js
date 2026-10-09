/* Placement is adapted from codex-usage-badge (MIT). See THIRD_PARTY_NOTICES.md. */
function installQuotaOrbit() {
  const key = '__codexOrbit';
  const version = 4;
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
    <path class="orbit-track" d="M24.544 70.456 A36 36 0 1 1 75.456 70.456" pathLength="100"/>
    <path class="orbit-fill" d="M24.544 70.456 A36 36 0 1 1 75.456 70.456" pathLength="100" visibility="hidden"/>
    <text class="orbit-resets" x="50" y="45" visibility="hidden"></text>
    <circle cx="32" cy="83" r="3.8"/><circle cx="44" cy="87" r="3.8"/>
    <circle cx="56" cy="87" r="3.8"/><circle cx="68" cy="83" r="3.8"/>
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
    #codex-orbit-badge circle{fill:var(--orbit-track)}
    #codex-orbit-badge circle.orbit-lit{fill:currentColor}
    #codex-orbit-badge circle.orbit-unknown{fill:none;stroke:var(--orbit-track);stroke-width:1.5}
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
    #codex-orbit-details .orbit-summary{white-space:pre-line}
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
    html.dark #codex-orbit-details .orbit-swatch,html[data-theme="dark"] #codex-orbit-details .orbit-swatch{background:var(--swatch-dark)}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details{color:var(--color-text-primary,#eee);background:var(--color-surface-elevated-secondary,#252525)}}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details .orbit-swatch{background:var(--swatch-dark)}}
    @media(prefers-reduced-motion:reduce){#codex-orbit-badge .orbit-fill{transition:none}}
  `;
  const details = document.createElement('div');
  details.id = 'codex-orbit-details';
  details.hidden = true;
  details.setAttribute('role', 'dialog');
  details.setAttribute('aria-label', 'Codex 额度与配色');
  details.innerHTML = `<div class="orbit-heading"><span>Codex 剩余额度</span><button type="button" class="orbit-close" aria-label="关闭额度详情">×</button></div>
    <div class="orbit-summary"></div><fieldset><legend>图标配色</legend><div class="orbit-colors"></div></fieldset>
    <p class="orbit-color-note">仅电量绿在剩余 ≤30% 时外圈变红，圆点和数字保持绿色。</p>
    <p class="orbit-save-status" role="status"></p>`;
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
    for(const appearance of ['light','dark']) {
      const property=`--orbit-palette-${appearance}`;
      if(palette === 'classic')badge.style.removeProperty(property);
      else badge.style.setProperty(property,palettes[palette][appearance]);
    }
    details.querySelectorAll('input[type=radio]').forEach(input=>{input.checked=input.value===palette;});
    const fill = badge.querySelector('.orbit-fill');
    fill.setAttribute('visibility', ring !== null && ring > 0 ? 'visible' : 'hidden');
    fill.setAttribute('stroke-dasharray', `${ring ?? 0} 100`);
    const text = badge.querySelector('.orbit-resets');
    text.textContent = count > 0 ? String(count) : '';
    text.setAttribute('visibility', count > 0 ? 'visible' : 'hidden');
    text.style.fontSize = count > 99 ? '21px' : '';
    const points = week === null ? null : Math.ceil(week / 25);
    badge.querySelectorAll('circle').forEach((dot, index) => dot.setAttribute('class', points === null ? 'orbit-unknown' : index < points ? 'orbit-lit' : ''));
    const resetLabel = count === null ? '暂不可用' : `${count} 次`;
    const description = `${ringLabel}剩余 ${percent(ring)}，周剩余 ${percent(week)}，可用重置 ${resetLabel}${state === 'stale' ? '，数据未同步' : ''}`;
    badge.setAttribute('aria-label', description);
    summary.textContent = `${ringLabel}    ${percent(ring)}\n${resetTime(ringWindow === 'weekly' ? value.weekly : value.fiveHour)}\n\n本周       ${percent(week)}\n${resetTime(value.weekly)}\n\n可用重置 ${resetLabel}\n${state === 'stale' ? '同步失败 · 上次成功数据' : state === 'unavailable' ? '等待账号额度数据' : '本机读取 · 点击不消耗重置次数'}`;
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
        palette, lowQuota:badge.dataset.low==='true', reason:placementReason };
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
