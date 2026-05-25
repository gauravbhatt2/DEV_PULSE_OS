import { DashboardData, LinkedActivityRecord, EventCounts, IntegrationStatus, TicketContext, SlackSyncResponse } from '../types';

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

// ─── Ticket Context ───────────────────────────────────────────────

export async function fetchTicketContext(issueKey: string): Promise<TicketContext> {
  return fetchJson<TicketContext>(`${API_V1}/context/${issueKey}`);
}

// ─── GitHub Intelligence ─────────────────────────────────────────────────────

import type {
  GitHubRepo,
  GitHubActivityEvent,
  GitHubCommit,
  GitHubPR,
  GitHubRepoDetails,
  CommitAnalysisResult,
} from '../types';

export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  return fetchJson<GitHubRepo[]>(`${API_V1}/v1/github/repos`);
}

export async function fetchGitHubActivity(limit = 50): Promise<GitHubActivityEvent[]> {
  return fetchJson<GitHubActivityEvent[]>(`${API_V1}/v1/github/activity?limit=${limit}`);
}

export async function fetchRepoDetails(owner: string, repo: string): Promise<GitHubRepoDetails> {
  return fetchJson<GitHubRepoDetails>(`${API_V1}/v1/github/repos/${owner}/${repo}/details`);
}

export async function fetchRepoCommits(owner: string, repo: string, perPage = 20): Promise<GitHubCommit[]> {
  return fetchJson<GitHubCommit[]>(`${API_V1}/v1/github/repos/${owner}/${repo}/commits?per_page=${perPage}`);
}

export async function fetchRepoPRs(owner: string, repo: string, state = 'open'): Promise<GitHubPR[]> {
  return fetchJson<GitHubPR[]>(`${API_V1}/v1/github/repos/${owner}/${repo}/pulls?state=${state}`);
}

export async function analyzeCommit(owner: string, repo: string, sha: string): Promise<CommitAnalysisResult> {
  return fetchJson<CommitAnalysisResult>(`${API_V1}/v1/github/analyze-commit`, {
    method: 'POST',
    body: JSON.stringify({ owner, repo, sha }),
  });
}

// ─── Slack Intelligence ──────────────────────────────────────────────────────

/**
 * Fetch the latest Slack channel messages enriched with SLM context indicators.
 * Maps to GET /api/v1/slack/sync?channel_name=<name>&limit=<n>
 */
export async function fetchSlackMessages(
  channelName: string,
  limit = 20,
): Promise<SlackSyncResponse> {
  return fetchJson<SlackSyncResponse>(
    `${API_V1}/v1/slack/sync?channel_name=${encodeURIComponent(channelName)}&limit=${limit}`,
  );
}

export interface SlackStatusResult {
  status: 'connected' | 'not_configured' | 'error';
  workspace: string | null;
  bot_user: string | null;
  bot_id: string | null;
}

/**
 * Ping GET /api/v1/slack/status — used by the dashboard badge to determine
 * whether to render the purple "• Slack Connected" indicator.
 */
export async function fetchSlackStatus(): Promise<SlackStatusResult> {
  return fetchJson<SlackStatusResult>(`${API_V1}/v1/slack/status`);
}

export interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  num_members: number;
}

/**
 * Fetch all public Slack channels visible to the bot.
 * Maps to GET /api/v1/slack/channels
 */
export async function fetchSlackChannels(): Promise<SlackChannel[]> {
  const res = await fetchJson<{ channels: SlackChannel[]; count: number }>(
    `${API_V1}/v1/slack/channels`,
  );
  return res.channels;
}
