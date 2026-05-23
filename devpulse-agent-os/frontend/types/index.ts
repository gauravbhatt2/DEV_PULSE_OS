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
