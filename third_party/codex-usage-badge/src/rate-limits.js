const hasField = (value, key) => value != null && Object.hasOwn(value, key);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function mergeWindow(current, patch) {
  if (patch === undefined) return current ?? null;
  if (!isRecord(patch)) return null;
  const sameWindow = current && (!Number.isFinite(patch.windowDurationMins) || current.windowDurationMins === patch.windowDurationMins);
  return sameWindow ? { ...current, ...patch } : { ...patch };
}
function mergeRateLimitSnapshot(current, patch) {
  if (patch === undefined) return current ?? null;
  if (!isRecord(patch)) return null;
  if (current?.planType && patch.planType && current.planType !== patch.planType) current = null;
  return { ...current, ...patch,
    primary: mergeWindow(current?.primary, patch.primary),
    secondary: mergeWindow(current?.secondary, patch.secondary) };
}
function mergeRateLimitsResponse(current, patch) {
  if (patch === undefined) return current ?? null;
  if (!isRecord(patch)) return null;
  // A refresh is a complete snapshot (caller passes null); notifications are deltas.
  // Never carry windows or credits across account changes.
  const changedAccount = hasField(patch, 'accountId') && hasField(current, 'accountId') && patch.accountId !== current.accountId;
  const base = changedAccount ? {} : current ?? {};
  const merged = { ...base, ...patch };
  merged.rateLimits = base.rateLimits ?? null;
  if (hasField(patch, 'rateLimits') && isCodexLimit(patch.rateLimits)) {
    merged.rateLimits = mergeRateLimitSnapshot(base.rateLimits, patch.rateLimits);
    if (isRecord(base.rateLimitsByLimitId)) merged.rateLimitsByLimitId = { ...base.rateLimitsByLimitId, codex: merged.rateLimits };
  }
  if (hasField(patch, 'rateLimitsByLimitId')) {
    if (!isRecord(patch.rateLimitsByLimitId)) {
      merged.rateLimitsByLimitId = null;
      if (!hasField(patch, 'rateLimits')) merged.rateLimits = null;
    }
    else {
      merged.rateLimitsByLimitId = { ...base.rateLimitsByLimitId, ...merged.rateLimitsByLimitId };
      for (const [id, snapshot] of Object.entries(patch.rateLimitsByLimitId)) {
        // The keyed Codex bucket is authoritative when both formats are returned.
        const previous = base.rateLimitsByLimitId?.[id] ?? (id === 'codex' ? base.rateLimits : null);
        Object.defineProperty(merged.rateLimitsByLimitId, id, {value:mergeRateLimitSnapshot(previous, snapshot),enumerable:true,configurable:true,writable:true});
      }
      if (hasField(patch.rateLimitsByLimitId, 'codex')) merged.rateLimits = merged.rateLimitsByLimitId.codex;
    }
  }
  return merged;
}
function pickCodexSnapshot(response) {
  if (!isRecord(response)) return null;
  if (hasField(response.rateLimitsByLimitId, 'codex')) {
    const keyed = response.rateLimitsByLimitId.codex;
    return isRecord(keyed) && isCodexLimit(keyed) ? keyed : null;
  }
  if (hasField(response, 'rateLimits')) return isRecord(response.rateLimits) && isCodexLimit(response.rateLimits) ? response.rateLimits : null;
  return isCodexLimit(response) ? response : null;
}
