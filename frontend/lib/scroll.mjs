export const DEFAULT_STICKY_THRESHOLD = 96;

export function distanceFromBottom(target) {
  if (!target) return 0;
  return Math.max(0, target.scrollHeight - target.scrollTop - target.clientHeight);
}

export function isNearBottom(target, threshold = DEFAULT_STICKY_THRESHOLD) {
  return distanceFromBottom(target) <= threshold;
}
