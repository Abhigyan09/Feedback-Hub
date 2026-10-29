import { Ticket, TicketSeverity, TicketStatus } from '../types';

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function normalizeSeverity(severity: string): 'Urgent' | 'High' | 'Medium' | 'Low' {
  const s = severity?.toUpperCase();
  if (s === 'CRITICAL' || s === 'BLOCKER' || s === 'URGENT') return 'Urgent';
  if (s === 'HIGH') return 'High';
  if (s === 'MEDIUM') return 'Medium';
  return 'Low';
}

export function normalizeStatus(status: string): 'Open' | 'In Dev' | 'In QA' | 'Resolved' {
  const s = status?.toUpperCase();
  if (s === 'IN_DEV') return 'In Dev';
  if (s === 'IN_QA') return 'In QA';
  if (s === 'RESOLVED' || s === 'CLOSED') return 'Resolved';
  return 'Open';
}
