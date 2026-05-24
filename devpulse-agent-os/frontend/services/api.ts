import { DashboardData, LinkedActivityRecord, EventCounts, IntegrationStatus, TicketContext } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_V1 = `${API_BASE}/api`;

export interface IssueActionResult {
  issueKey: string;
  status: string;
  changed: boolean;
  alreadyActive?: boolean;
  message: string;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || err.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ─── Battle Plan ─────────────────────────────────────────────────────────────

export async function fetchBattlePlan(): Promise<DashboardData> {
  return fetchJson<DashboardData>(`${API_V1}/battle-plan`);
}

// ─── Issue Actions ───────────────────────────────────────────────────────────

export async function startIssue(issueKey: string): Promise<IssueActionResult> {
  return fetchJson<IssueActionResult>(`${API_V1}/issues/${issueKey}/start`, { method: 'POST' });
}

export async function markIssueDone(issueKey: string): Promise<IssueActionResult> {
  return fetchJson<IssueActionResult>(`${API_V1}/issues/${issueKey}/done`, { method: 'POST' });
}

export interface CorrelationResult {
  events_processed: number;
  links_created: number;
  errors: number;
  triggered_at: string;
}

// ─── Events & Correlation ────────────────────────────────────────────────────

export async function fetchEventCounts(): Promise<EventCounts> {
  return fetchJson<EventCounts>(`${API_BASE}/events`);
}

export async function fetchLinkedActivity(skip = 0, limit = 50): Promise<LinkedActivityRecord[]> {
  return fetchJson<LinkedActivityRecord[]>(`${API_BASE}/linked-activity?skip=${skip}&limit=${limit}`);
}

export async function triggerCorrelation(): Promise<CorrelationResult> {
  return fetchJson<CorrelationResult>(`${API_V1}/correlate`, { method: 'POST' });
}

// ─── Integration Status ──────────────────────────────────────────────────────

export async function fetchIntegrationStatus(): Promise<IntegrationStatus> {
  return fetchJson<IntegrationStatus>(`${API_V1}/v1/dashboard/integration-status`);
}

export async function fetchDashboardPriorities() {
  return fetchJson(`${API_V1}/v1/dashboard/priorities`);
}

export async function fetchVelocityAnalytics() {
  return fetchJson(`${API_V1}/v1/analytics/velocity`);
}

export async function fetchAgentHealth() {
  return fetchJson(`${API_V1}/v1/agents/health`);
}

export async function fetchJiraIssues() {
  return fetchJson(`${API_V1}/jira/issues`);
}

// ─── Ticket Context ───────────────────────────────────────────────────────────

export async function fetchTicketContext(issueKey: string): Promise<TicketContext> {
  return fetchJson<TicketContext>(`${API_V1}/context/${issueKey}`);
}

