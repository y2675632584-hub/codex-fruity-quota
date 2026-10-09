export function remaining(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return 100 - Math.min(100, Math.max(0, value));
}

// Each completely consumed quarter turns one point grey.
export function litPoints(usedPercent) {
  const left = remaining(usedPercent);
  return left === null ? null : Math.ceil(left / 25);
}

export function resetCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function percentage(value) {
  return value === null ? '暂不可用' : `${Math.round(value)}%`;
}
