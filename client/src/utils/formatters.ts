import { getSyncedNow, normalizeSeverity, normalizeStatus } from './edgeCaseHelpers';

export { normalizeSeverity, normalizeStatus };

/**
 * Safely formats timestamps into relative human-readable strings.
 * Compensates for client/server clock skew using getSyncedNow() and Math.max(0, ...),
 * preventing negative durations (e.g. "-5m ago") or "NaNm ago" on malformed date strings.
 */
export function formatTimeAgo(dateString?: string | null, referenceNow = getSyncedNow()): string {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return 'Just now';
  }
  const parsed = new Date(dateString).getTime();
  if (!Number.isFinite(parsed)) return 'Just now';

  const diffMs = Math.max(0, referenceNow - parsed);
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  const dateObj = new Date(parsed);
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
