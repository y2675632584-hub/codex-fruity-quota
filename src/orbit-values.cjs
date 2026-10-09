function isCodexLimit(snapshot) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    && (snapshot.limitId == null || snapshot.limitId === 'codex');
}
function sanitizeOrbitUsage(response, now = Date.now() / 1000) {
  const object = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
  // A present keyed view is authoritative; never pick another model's bucket.
  const buckets = object.rateLimitsByLimitId;
  const snapshot = buckets && typeof buckets === 'object' ? buckets.codex : object.rateLimits;
  const windows = isCodexLimit(snapshot) ? [snapshot.primary, snapshot.secondary] : [];
  const pick = minutes => {
    const item = windows.find(window => window && window.windowDurationMins === minutes);
    if (typeof item?.usedPercent !== 'number' || !Number.isFinite(item.usedPercent)) return null;
    const used = Math.max(0, Math.min(100, item.usedPercent));
    return { usedPercent:used, remainingPercent:100-used, windowDurationMins:minutes,
      resetsAt:Number.isFinite(item.resetsAt) && item.resetsAt > 0 ? item.resetsAt : null };
  };
  const count = object.rateLimitResetCredits?.availableCount;
  const value = { fiveHour:pick(300), weekly:pick(10080),
    ringWindow:windows.some(w => w?.windowDurationMins === 300) ? 'fiveHour' : pick(10080) ? 'weekly' : null,
    resetCount:Number.isInteger(count) && count >= 0 ? count : null,
    fetchedAt:now, source:'codex-app-server', status:'live' };
  if (value.fiveHour === null && value.weekly === null) value.status = 'unavailable';
  return value;
}
