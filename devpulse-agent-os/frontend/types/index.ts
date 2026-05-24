// ─────────────────────────────────────────────
// Core Data Types for DevPulse Agent OS
// ─────────────────────────────────────────────

export interface User {
  name: string;
  email: string;
}

export interface Summary {
  totalTasks: number;
  criticalTasks: number;
  reviewTasks: number;
  focusHours: number;
  healthScore: number;
  healthStatus: string;
  lastSync: string;
}

export interface TaskListItem {
  id: string;
  key: string;
  summary: string;
  description?: string;
  status: string;
  priority: string;
  reason: string;
  estimatedEffort: number;
  color: string;
}

export interface BattlePlanItem extends TaskListItem {
  timeSlot: string;
}

export interface DashboardData {
  jiraBaseUrl: string;
  user: User;
  summary: Summary;
  battlePlan: BattlePlanItem[];
  taskList: TaskListItem[];
  notice?: string;
}

export interface ActivityEvent {
  issueKey: string;
  status: string;
  timestamp: number;
}

export interface LinkedActivityRecord {
  id: number;
  github_event_id: number;
  github_event_type: string | null;
  jira_ticket_id: string;
  jira_ticket_url: string | null;
  description: string | null;
  repository: string;
  commit_message: string;
  pr_title: string;
  created_at: string | null;
}

export interface EventCounts {
  github_events: number;
  jira_events: number;
  linked_activity: number;
  cicd_pipelines: number;
  slack_threads: number;
}

export interface IntegrationStatus {
  github: {
    configured: boolean;
    status: string;
    app_id: string;
    accessible_repos?: number;
  };
  jira: {
    configured: boolean;
    status: string;
    domain: string | null;
    user?: string;
  };
  checked_at: string;
}

// ─────────────────────────────────────────────
// GitHub Intelligence Types
// ─────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  visibility: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  language: string | null;
  open_issues_count: number;
  stargazers_count: number;
  forks_count: number;
  updated_at: string | null;
  pushed_at: string | null;
}

export interface GitHubActivityEvent {
  id: number;
  event_type: string;
  repository: string;
  title: string;
  author: string;
  sha: string;
  branch: string;
  pr_number: number | null;
  pr_state: string | null;
  jira_ticket: string | null;
  jira_url: string | null;
  created_at: string | null;
}

export interface GitHubCommit {
  sha: string;
  short_sha: string;
  message: string;
  author: string;
  avatar_url: string | null;
  html_url: string;
  date: string | null;
  files_changed: number;
  additions: number;
  deletions: number;
  jira_ticket: string | null;
  jira_url: string | null;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string;
  avatar_url: string | null;
  html_url: string;
  base_branch: string;
  head_branch: string;
  created_at: string | null;
  updated_at: string | null;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  jira_ticket: string | null;
  jira_url: string | null;
}

export interface RepoContributor {
  login: string;
  avatar_url: string;
  contributions: number;
  html_url: string;
}

export interface RepoBranch {
  name: string;
  protected: boolean;
}

export interface GitHubRepoDetails extends GitHubRepo {
  branches: RepoBranch[];
  contributors: RepoContributor[];
}

export interface CommitAnalysis {
  summary: string;
  what_changed: string;
  why_it_changed: string;
  impact: string;
  risk_level: 'low' | 'medium' | 'high';
  risk_reason: string;
  affected_modules: string[];
  _fallback?: boolean;
}

export interface CommitAnalysisResult {
  sha: string;
  short_sha: string;
  message: string;
  repository: string;
  author: string;
  date: string | null;
  files_changed: { filename: string; status: string; additions: number; deletions: number }[];
  jira_ticket: string | null;
  jira_url: string | null;
  analysis: CommitAnalysis;
  analyzed_at: string;
}
