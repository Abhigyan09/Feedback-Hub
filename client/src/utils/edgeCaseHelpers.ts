/**
 * Defensive Edge Case Helpers for Feedback-Hub
 * Provides safe numeric, division, date, clock skew, and array operations to guard
 * against NaN, zero-division, undefined/null dereferences, and time drift.
 */

// Global Server Clock Offset state (in milliseconds)
// serverTimeOffset = serverTime - clientLocalTime
let serverTimeOffset = 0;

/**
 * Updates the client/server time synchronization offset based on
 * HTTP 'Date' or 'X-Server-Time' response headers.
 */
export function updateServerTimeOffset(serverDateHeader?: string | null): number {
  if (!serverDateHeader) return serverTimeOffset;
  const serverMs = new Date(serverDateHeader).getTime();
  if (Number.isFinite(serverMs)) {
    serverTimeOffset = serverMs - Date.now();
  }
  return serverTimeOffset;
}

/**
 * Returns current estimated server clock offset in milliseconds.
 */
export function getServerTimeOffset(): number {
  return serverTimeOffset;
}

/**
 * Manually set or reset clock offset (useful for unit testing).
 */
export function setServerTimeOffset(offsetMs: number): void {
  serverTimeOffset = offsetMs;
}

/**
 * Returns synchronized current time in milliseconds, compensating for
 * client/server clock drift.
 */
export function getSyncedNow(): number {
  return Date.now() + serverTimeOffset;
}

/**
 * Safely parses a date string, returning fallback timestamp if null, undefined,
 * empty string, or an invalid date string.
 */
export function parseSafeDate(dateString?: string | null, fallbackMs: number = getSyncedNow()): number {
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    return fallbackMs;
  }
  const parsed = new Date(dateString).getTime();
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

/**
 * Normalizes ticket severity levels into standard priority tiers.
 */
export function normalizeSeverity(severity?: string | null): 'Urgent' | 'High' | 'Medium' | 'Low' {
  if (!severity || typeof severity !== 'string') return 'Low';
  const s = severity.toUpperCase().trim();
  if (s === 'CRITICAL' || s === 'BLOCKER' || s === 'URGENT' || s === 'P0') return 'Urgent';
  if (s === 'HIGH' || s === 'P1') return 'High';
  if (s === 'MEDIUM' || s === 'P2') return 'Medium';
  return 'Low';
}

/**
 * Normalizes ticket status strings into standard lifecycle states.
 */
export function normalizeStatus(status?: string | null): 'Open' | 'In Dev' | 'In QA' | 'Resolved' {
  if (!status || typeof status !== 'string') return 'Open';
  const s = status.toUpperCase().trim();
  if (s === 'IN_DEV') return 'In Dev';
  if (s === 'IN_QA') return 'In QA';
  if (s === 'RESOLVED' || s === 'CLOSED') return 'Resolved';
  return 'Open';
}

/**
 * Calculates safe SLA due timestamp with dynamic severity fallbacks:
 * Urgent (P0) = 1h, High (P1) = 4h, Medium (P2) = 2h, Low = 24h.
 * Protects against null, empty string, or invalid date values.
 */
export function getSafeSlaDueAt(ticket: {
  sla_due_at?: string | null;
  created_at?: string | null;
  severity?: string | null;
}): number {
  if (ticket.sla_due_at) {
    const parsedDue = new Date(ticket.sla_due_at).getTime();
    if (Number.isFinite(parsedDue)) return parsedDue;
  }
  const createdMs = parseSafeDate(ticket.created_at, getSyncedNow());
  const sev = normalizeSeverity(ticket.severity);
  const slaDurationMs = sev === 'Urgent'
    ? 1 * 3600000
    : sev === 'High'
    ? 4 * 3600000
    : sev === 'Medium'
    ? 2 * 3600000
    : 24 * 3600000;
  return createdMs + slaDurationMs;
}

/**
 * Returns a finite number or fallback if value is null, undefined, NaN, or infinite.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Safe division that returns fallback when denominator is 0, NaN, or non-finite.
 */
export function safeDivision(numerator: number, denominator: number, fallback = 0): number {
  const num = safeNumber(numerator, 0);
  const den = safeNumber(denominator, 0);
  if (den === 0 || !Number.isFinite(den) || !Number.isFinite(num)) {
    return fallback;
  }
  const result = num / den;
  return Number.isFinite(result) ? result : fallback;
}

/**
 * Safe percentage calculation clamped between 0 and 100.
 */
export function safePercentage(part: number, total: number, fallback = 0): number {
  const tot = safeNumber(total, 0);
  if (tot <= 0) return fallback;
  const pct = Math.round(safeDivision(part, tot, 0) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Ensures a typed array is returned even if input is null, undefined, or empty.
 */
export function safeArray<T>(value: T[] | readonly T[] | null | undefined): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Calculates non-negative elapsed duration in milliseconds, safely guarding against
 * clock skew (future dates) or malformed date inputs.
 */
export function safeTimeDiff(dateString?: string | null, referenceNow = getSyncedNow()): number {
  if (!dateString || typeof dateString !== 'string') return 0;
  const timestamp = new Date(dateString).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, referenceNow - timestamp);
}

/**
 * Safely computes resolution duration in milliseconds.
 * Protects against null, undefined, invalid dates, and client/server clock skew.
 */
export function getSafeResolutionDuration(ticket: {
  created_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
}): number | null {
  const endTimestamp = ticket.resolved_at || ticket.closed_at || ticket.updated_at;
  if (!endTimestamp) return null;
  const startMs = parseSafeDate(ticket.created_at, 0);
  const endMs = parseSafeDate(endTimestamp, 0);
  if (startMs === 0 || endMs === 0) return null;
  return Math.max(0, endMs - startMs);
}

/**
 * Safely formats resolution duration into human-readable text.
 * Falls back to "Resolution time unavailable" if timestamps are missing or invalid.
 */
export function formatResolutionDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return 'Resolution time unavailable';
  }
  const totalMins = Math.floor(durationMs / 60000);
  if (totalMins < 1) return '< 1m to resolve';
  if (totalMins < 60) return `${totalMins}m to resolve`;
  const hours = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `${hours}h ${remainingMins}m to resolve` : `${hours}h to resolve`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h to resolve` : `${days}d to resolve`;
}

export interface ProcessedLogs {
  rawText: string;
  truncatedText: string;
  isTruncated: boolean;
  totalBytes: number;
}

/**
 * Truncates raw console / telemetry logs to the first 50KB to prevent
 * browser freezing or crashes on massive (e.g. 5MB) recursive JSON dumps.
 */
export function processLogTraces(
  logs?: Array<{ type?: string; message?: string; timestamp?: string }> | string | null,
  maxBytes: number = 50 * 1024
): ProcessedLogs {
  if (!logs) {
    return { rawText: '', truncatedText: '', isTruncated: false, totalBytes: 0 };
  }

  let rawText = '';
  if (typeof logs === 'string') {
    rawText = logs;
  } else if (Array.isArray(logs)) {
    rawText = logs
      .map(l => {
        const time = l.timestamp ? `[${l.timestamp}] ` : '';
        const type = l.type ? `[${l.type.toUpperCase()}] ` : '';
        const msg = typeof l.message === 'object' ? JSON.stringify(l.message, null, 2) : (l.message || '');
        return `${time}${type}${msg}`;
      })
      .join('\n');
  }

  const totalBytes = typeof Blob !== 'undefined'
    ? new Blob([rawText]).size
    : (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(rawText).length : rawText.length);

  const isTruncated = totalBytes > maxBytes;
  const truncatedText = isTruncated ? rawText.slice(0, maxBytes) : rawText;

  return {
    rawText,
    truncatedText,
    isTruncated,
    totalBytes
  };
}

/**
 * Downloads full raw telemetry log trace to disk as a text file.
 */
export function downloadRawLog(rawContent: string, filename = 'telemetry_console_dump.log'): void {
  if (typeof window === 'undefined' || !window.document) return;
  const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validates that an image URL begins with safe schemes (https:, http:, data:image/, blob:)
 * to guard against XSS injection via javascript: URLs.
 */
export function isSafeImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  );
}

/**
 * Safely escapes special regex characters in a search string:
 * [ ] ( ) { } * + ? . \ ^ $ |
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Safely checks if target text matches the search query.
 * Uses plain String.prototype.includes() in lowercase, safely handling
 * special regex characters (e.g. [FH-502], test.*, api\, ?query=true) without syntax errors.
 */
export function safeSearchMatch(target?: string | null, query?: string | null): boolean {
  if (!target || !query) return false;
  const cleanTarget = String(target).toLowerCase();
  const cleanQuery = String(query).trim().toLowerCase();
  if (!cleanQuery) return true;
  return cleanTarget.includes(cleanQuery);
}
