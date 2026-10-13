import { remaining, resetCount, percentage } from './quota-model.js';

const arc = 'M 24.544 70.456 A 36 36 0 1 1 75.456 70.456';
const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host{display:inline-block;color:var(--orbit-ink,#222);--orbit-track:#c7c7cb;width:var(--orbit-size,52px);vertical-align:middle}
    button{appearance:none;border:0;background:transparent;color:inherit;display:block;padding:4px;width:100%;cursor:pointer;border-radius:12px}
    button:hover{background:var(--orbit-hover,rgba(127,127,127,.08))}
    button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
    svg{display:block;width:100%;overflow:visible}
    path{fill:none;stroke-width:6.5;stroke-linecap:round}
    .track{stroke:var(--orbit-track)}.fill{stroke:currentColor;transition:stroke-dasharray .3s ease}
    .week-track{stroke:var(--orbit-track)}.week-fill{stroke:currentColor;transition:stroke-dasharray .2s ease}
    :host([data-week-low="true"]) .week-fill{stroke:#e5484d}
    text{fill:currentColor;font:600 29px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-anchor:middle;dominant-baseline:central;font-variant-numeric:tabular-nums}
    :host([data-status=stale]) svg{opacity:.5}:host([data-status=unavailable]) .track{stroke-dasharray:3 6}
    @media(prefers-reduced-motion:reduce){.fill,.week-fill{transition:none}}
  </style>
  <button type="button" aria-label="读取额度中" aria-expanded="false">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="track" d="${arc}" pathLength="100"></path>
      <path class="fill" d="${arc}" pathLength="100" stroke-dasharray="0 100" visibility="hidden"></path>
      <text x="50" y="45" visibility="hidden"></text>
      <path class="week-track" d="M29 82 Q50 94 71 82" pathLength="100"></path>
      <path class="week-fill" d="M29 82 Q50 94 71 82" pathLength="100" visibility="hidden"></path>
    </svg>
  </button>`;

export class QuotaOrbit extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
    this.shadowRoot.querySelector('button').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('orbit-details', { bubbles: true, composed: true }));
    });
    this.usage = null;
  }
  set usage(value) {
    this._usage = value;
    const five = remaining(value?.fiveHour?.usedPercent);
    const week = remaining(value?.weekly?.usedPercent);
    this.dataset.weekLow=String(week!==null && week<20);
    const weeklyRing = value?.ringWindow === 'weekly' || (value?.ringWindow == null && !value?.fiveHour && !!value?.weekly);
    const ring = weeklyRing ? week : five;
    const count = resetCount(value?.resetCount);
    const fill = this.shadowRoot.querySelector('.fill');
    fill.setAttribute('visibility', ring !== null && ring > 0 ? 'visible' : 'hidden');
    fill.setAttribute('stroke-dasharray', `${ring ?? 0} 100`);
    const text = this.shadowRoot.querySelector('text');
    text.textContent = count > 0 ? String(count) : '';
    text.setAttribute('visibility', count > 0 ? 'visible' : 'hidden');
    if (count > 99) text.style.fontSize = '21px'; else text.style.fontSize = '';
    const weeklyFill=this.shadowRoot.querySelector('.week-fill'),weeklyTrack=this.shadowRoot.querySelector('.week-track');
    weeklyFill.setAttribute('visibility',week!==null&&week>0?'visible':'hidden');
    weeklyFill.setAttribute('stroke-dasharray',`${week??0} 100`);
    if(week===null)weeklyTrack.setAttribute('stroke-dasharray','2 5');else weeklyTrack.removeAttribute('stroke-dasharray');
    this.dataset.status = value?.status ?? 'unavailable';
    const label = `${weeklyRing ? '本周（外圈）' : '5 小时'}剩余 ${percentage(ring)}，周剩余 ${percentage(week)}，${count === null ? '重置次数暂不可用' : `可用重置 ${count} 次`}${value?.status === 'stale' ? '，数据未同步' : ''}`;
    const button = this.shadowRoot.querySelector('button');
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  get usage() { return this._usage; }
  set expanded(value) {
    this.shadowRoot.querySelector('button').setAttribute('aria-expanded', String(Boolean(value)));
  }
}
customElements.define('quota-orbit', QuotaOrbit);
