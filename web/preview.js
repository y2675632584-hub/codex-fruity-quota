import './quota-orbit.js';
import { remaining, percentage } from './quota-model.js';

const $ = id => document.getElementById(id);
let mode = 'live';
let latest = null;
let busy = false;

function resetTime(timestamp) {
  if (typeof timestamp !== 'number') return '重置时间暂不可用';
  const date = new Date(timestamp * 1000);
  return `下次重置 ${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)}（本地时间）`;
}

function render(value) {
  for (const icon of document.querySelectorAll('quota-orbit')) icon.usage = value;
  $('detail-five').textContent = percentage(remaining(value?.fiveHour?.usedPercent));
  $('detail-week').textContent = percentage(remaining(value?.weekly?.usedPercent));
  $('detail-resets').textContent = value?.resetCount == null ? '暂不可用' : `${value.resetCount} 次`;
  $('five-reset').textContent = resetTime(value?.fiveHour?.resetsAt);
  $('week-reset').textContent = resetTime(value?.weekly?.resetsAt);
  $('status-light').className = value?.status === 'live' ? 'live' : '';
  const status = mode === 'demo' ? '演示数据 · 非真实额度' : value?.status === 'live' ? '已连接本机 Codex' : value?.status === 'stale' ? '同步失败 · 显示上次数据' : '额度暂不可用';
  $('source-label').textContent = status;
  $('detail-status').textContent = mode === 'demo' ? status : `${status}${value?.fetchedAt ? ' · ' + new Date(value.fetchedAt * 1000).toLocaleTimeString('zh-CN') : ''}`;
  $('data-note').textContent = mode === 'demo' ? '拖动滑块，查看圆弧与灰点的变化。' : value?.error ?? '通过本机 Codex 登录读取，每 60 秒更新。';
}

async function refresh() {
  if (busy || mode !== 'live') return;
  busy = true;
  $('refresh').disabled = true;
  try {
    const response = await fetch('/api/usage', { cache: 'no-store' });
    if (!response.ok) throw new Error('quota unavailable');
    latest = await response.json();
    if (mode === 'live') render(latest);
  } catch {
    if (mode === 'live') render({ ...latest, status: latest ? 'stale' : 'unavailable', error: '无法连接本机额度服务，请确认服务正在运行。' });
  } finally {
    busy = false;
    $('refresh').disabled = false;
  }
}

function demo() {
  const five = Number($('five').value), week = Number($('week').value);
  $('five-out').textContent = `${five}%`;
  $('week-out').textContent = `${week}%`;
  render({ fiveHour: { usedPercent: five }, weekly: { usedPercent: week }, resetCount: $('resets').value === '' ? null : Number($('resets').value), status: 'demo' });
}

$('demo').onclick = () => {
  mode = 'demo'; $('demo-controls').hidden = false;
  $('demo').classList.add('selected'); $('live').classList.remove('selected');
  $('refresh').hidden = true; demo();
};
$('live').onclick = () => {
  mode = 'live'; $('demo-controls').hidden = true;
  $('live').classList.add('selected'); $('demo').classList.remove('selected');
  $('refresh').hidden = false; render(latest); refresh();
};
for (const id of ['five', 'week', 'resets']) $(id).addEventListener('input', demo);
document.addEventListener('orbit-details', () => {
  $('details').hidden = !$('details').hidden;
  for (const icon of document.querySelectorAll('quota-orbit')) icon.expanded = !$('details').hidden;
});
function closeDetails() {
  $('details').hidden = true;
  for (const icon of document.querySelectorAll('quota-orbit')) icon.expanded = false;
}
$('close-details').onclick = closeDetails;
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetails(); });
$('theme').onclick = () => {
  document.body.classList.toggle('dark');
  $('theme').textContent = document.body.classList.contains('dark') ? '浅色外观' : '深色外观';
};
$('refresh').onclick = refresh;
render(null); refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
