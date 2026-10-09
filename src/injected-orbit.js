/* Placement is adapted from codex-usage-badge (MIT). See THIRD_PARTY_NOTICES.md. */
function installQuotaOrbit() {
  const key = '__codexOrbit';
  const version = 3;
  if (window[key]?.version === version) { window[key].place(); return; }
  window[key]?.destroy?.();
  const badge = document.createElement('div');
  badge.id = 'codex-orbit-badge';
  badge.tabIndex = 0;
  badge.setAttribute('role', 'button');
  badge.setAttribute('aria-label', '正在读取 Codex 额度');
  badge.setAttribute('aria-expanded', 'false');
  badge.setAttribute('aria-describedby', 'codex-orbit-details');
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
    #codex-orbit-badge { --orbit-track:#bfc2c5; --orbit-ink:var(--color-text-primary,#222);
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
    #codex-orbit-badge circle{fill:var(--orbit-track)}
    #codex-orbit-badge circle.orbit-lit{fill:currentColor}
    #codex-orbit-badge circle.orbit-unknown{fill:none;stroke:var(--orbit-track);stroke-width:1.5}
    #codex-orbit-badge text{fill:currentColor;font:600 29px -apple-system,BlinkMacSystemFont,sans-serif;
      text-anchor:middle;dominant-baseline:central;font-variant-numeric:tabular-nums}
    #codex-orbit-badge[data-state="unavailable"] .orbit-track{stroke-dasharray:3 6}
    #codex-orbit-badge[data-state="stale"] svg{opacity:.45}
    html.dark #codex-orbit-badge,html[data-theme="dark"] #codex-orbit-badge{--orbit-ink:var(--color-text-primary,#eee);--orbit-track:#56595d}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-badge{--orbit-ink:var(--color-text-primary,#eee);--orbit-track:#56595d}}
    #codex-orbit-details{box-sizing:border-box;position:fixed;z-index:2147483000;
      width:240px;max-width:calc(100vw - 16px);padding:14px 16px;border:1px solid #8884;border-radius:12px;
      color:var(--color-text-primary,#222);background:var(--color-surface-elevated-secondary,#fafafa);
      box-shadow:0 5px 22px #0002;font:12px/1.8 -apple-system,BlinkMacSystemFont,sans-serif;
      white-space:pre-line;pointer-events:none;-webkit-app-region:no-drag;}
    html.dark #codex-orbit-details,html[data-theme="dark"] #codex-orbit-details{color:var(--color-text-primary,#eee);background:var(--color-surface-elevated-secondary,#252525)}
    @media(prefers-color-scheme:dark){html:not(.light):not([data-theme="light"]) #codex-orbit-details{color:var(--color-text-primary,#eee);background:var(--color-surface-elevated-secondary,#252525)}}
    @media(prefers-reduced-motion:reduce){#codex-orbit-badge .orbit-fill{transition:none}}
  `;
  const details = document.createElement('div');
  details.id = 'codex-orbit-details';
  details.hidden = true;
  details.setAttribute('role', 'tooltip');
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
    details.textContent = `Codex 剩余额度\n\n${ringLabel}    ${percent(ring)}\n${resetTime(ringWindow === 'weekly' ? value.weekly : value.fiveHour)}\n\n本周       ${percent(week)}\n${resetTime(value.weekly)}\n\n可用重置 ${resetLabel}\n${state === 'stale' ? '同步失败 · 上次成功数据' : state === 'unavailable' ? '等待账号额度数据' : '本机读取 · 点击不消耗重置次数'}`;
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
  const onLeave = () => { if (!pinned) hideDetails(); };
  const onKey = event => {
    if (event.key === 'Escape') { pinned = false; hideDetails(); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); }
  };
  const onVisibility = () => { pinned = false; hideDetails(); };
  badge.addEventListener('mouseenter', showDetails);
  badge.addEventListener('mouseleave', onLeave);
  badge.addEventListener('focus', showDetails);
  badge.addEventListener('blur', onLeave);
  badge.addEventListener('click', onClick);
  badge.addEventListener('keydown', onKey);
  window.addEventListener('resize', schedulePlacement);
  document.addEventListener('visibilitychange', onVisibility);
  window[key] = {
    version, place,
    update(next) { value = { ...value, ...next }; render(); place(); },
    status() {
      return { version, placed: badge.parentElement === rail && visible(badge) && !badge.hidden,
        badgeCount:document.querySelectorAll('#codex-orbit-badge').length,
        ringWindow:value.ringWindow ?? (value.fiveHour ? 'fiveHour' : value.weekly ? 'weekly' : null), status:value.status, fetchedAt:value.fetchedAt ?? null, fiveRemaining:remaining(value.fiveHour),
        weeklyRemaining:remaining(value.weekly), resetCount:value.resetCount,
        reason:placementReason };
    },
    destroy() {
      disposed = true; observer.disconnect(); resizeObserver.disconnect();
      clearTimeout(placementTimer); clearInterval(freshnessTimer);
      window.removeEventListener('resize', schedulePlacement);
      document.removeEventListener('visibilitychange', onVisibility);
      badge.remove(); details.remove(); style.remove(); delete window[key];
    }
  };
  render(); place();
}
