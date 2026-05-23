'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { SummaryBanner } from '@/components/SummaryBanner';
import { BattlePlanCard } from '@/components/BattlePlanCard';
import { JiraBacklogTable } from '@/components/JiraBacklogTable';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { LinkedActivityPanel } from '@/components/LinkedActivityPanel';
import { EventCounter } from '@/components/EventCounter';
import { ToastContainer, ToastMessage, ToastType } from '@/components/Toast';
import {
  fetchBattlePlan,
  startIssue,
  markIssueDone,
  fetchEventCounts,
  fetchLinkedActivity,
  fetchIntegrationStatus,
  triggerCorrelation,
} from '@/services/api';
import { DashboardData, BattlePlanItem, ActivityEvent, LinkedActivityRecord, EventCounts, IntegrationStatus } from '@/types';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [busyTaskKey, setBusyTaskKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [hoveredTaskKey, setHoveredTaskKey] = useState<string | null>(null);

  const [linkedRecords, setLinkedRecords] = useState<LinkedActivityRecord[]>([]);
  const [linkedLoading, setLinkedLoading] = useState(false);
  const [eventCounts, setEventCounts] = useState<EventCounts | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);

  // ─── Load persisted activities ──────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem('devpulse_activities');
      if (saved) setActivities(JSON.parse(saved));
    } catch {}
  }, []);

  // ─── Load integration status & event counts on mount ────────────────────────
  useEffect(() => {
    void loadSidebarData();
  }, []);

  const loadSidebarData = useCallback(async () => {
    try {
      const [counts, status, linked] = await Promise.allSettled([
        fetchEventCounts(),
        fetchIntegrationStatus(),
        fetchLinkedActivity(0, 20),
      ]);

      if (counts.status === 'fulfilled') setEventCounts(counts.value);
      if (status.status === 'fulfilled') setIntegrationStatus(status.value);
      if (linked.status === 'fulfilled') setLinkedRecords(linked.value);
    } catch {}
  }, []);

  // ─── Toast helpers ──────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ─── Activity helpers ────────────────────────────────────────────────────────
  const addActivity = useCallback((issueKey: string, status: string) => {
    const newAct: ActivityEvent = { issueKey, status, timestamp: Date.now() };
    setActivities((prev) => {
      const updated = [newAct, ...prev].slice(0, 15);
      localStorage.setItem('devpulse_activities', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // ─── Load battle plan ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchBattlePlan();
      setData(result);
      if (result.notice) {
        showToast(result.notice, 'info');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to backend';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
      void loadSidebarData();
    }
  }, [loadSidebarData, showToast]);

  // ─── Issue actions ────────────────────────────────────────────────────────────
  const handleAction = useCallback(async (action: 'start' | 'open' | 'done', task: BattlePlanItem) => {
    if (action === 'open') {
      const base = data?.jiraBaseUrl || 'https://atlassian.net';
      window.open(`${base}/browse/${task.key}`, '_blank');
      return;
    }

    setBusyTaskKey(task.key);
    setBusyAction(action);

    try {
      if (action === 'start') {
        const result = await startIssue(task.key);
        if (result.changed) {
          showToast(result.message, 'success');
          addActivity(task.key, result.status);
          await loadData();
        } else {
          showToast(result.message, 'info');
        }
      } else if (action === 'done') {
        const result = await markIssueDone(task.key);
        if (result.changed) {
          showToast(result.message, 'success');
          addActivity(task.key, result.status);
          await loadData();
        } else {
          showToast(result.message, 'info');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed';
      showToast(msg, 'error');
    } finally {
      setBusyTaskKey(null);
      setBusyAction(null);
    }
  }, [data, loadData, addActivity, showToast]);

  // ─── Correlation trigger ─────────────────────────────────────────────────────
  const handleCorrelate = useCallback(async () => {
    setLinkedLoading(true);
    try {
      const result = await triggerCorrelation();
      showToast(
        `Correlation pass: ${result.links_created} new links created (${result.events_processed} events scanned)`,
        result.links_created > 0 ? 'success' : 'info',
      );
      const linked = await fetchLinkedActivity(0, 20);
      setLinkedRecords(linked);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Correlation failed';
      showToast(msg, 'error');
    } finally {
      setLinkedLoading(false);
    }
  }, [showToast]);

  const jiraConnected = integrationStatus?.jira.status === 'connected';
  const githubConnected = integrationStatus?.github.status === 'connected';

  return (
    <div className="min-h-screen bg-[#f6f8fc]">
      <div className="max-w-[1280px] mx-auto px-5 py-8">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        {/* Header */}
        <Header
          lastSync={data?.summary.lastSync || '--:--'}
          onRefresh={loadData}
          disabled={loading}
          jiraConnected={jiraConnected}
          githubConnected={githubConnected}
        />

        {/* Welcome / Empty State */}
        {!data && !loading && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-6">
            <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm flex flex-col gap-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 w-fit">
                AI RECOMMENDED
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">
                  Start your day with clarity
                </h1>
                <p className="text-sm text-slate-500 leading-7">
                  DevPulse Agent OS analyzes your Jira backlog and GitHub activity, then tells you
                  exactly what to work on first — and why. Commits are auto-linked to Jira tickets.
                </p>
              </div>
              <button
                onClick={loadData}
                className="w-fit inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Generate Battle Plan
              </button>

              {/* Core Flow Explainer */}
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Core Correlation Flow</p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 font-mono">
                  {['GitHub Commit', '→', 'Webhook', '→', 'Extract DEV-101', '→', 'Match Jira', '→', 'Link Activity', '→', 'Dashboard'].map((step, i) => (
                    <span key={i} className={step === '→' ? 'text-slate-300' : 'bg-white border border-slate-200 px-2 py-0.5 rounded'}>
                      {step}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <aside className="flex flex-col gap-5">
              <EventCounter counts={eventCounts} />
              <LinkedActivityPanel
                records={linkedRecords}
                loading={linkedLoading}
                onCorrelate={handleCorrelate}
              />
            </aside>
          </div>
        )}

        {/* Loading State */}
        {loading && !data && (
          <div className="mt-16 text-center p-10 text-gray-500 font-semibold animate-pulse">
            Syncing with Jira…
          </div>
        )}

        {/* Dashboard Content */}
        {data && (
          <div className="mt-6 flex flex-col gap-6">
            <SummaryBanner summary={data.summary} user={data.user} />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
              {/* Left: Battle Plan */}
              <section className="flex flex-col gap-4">
                <h3 className="text-xs font-bold text-gray-700 border-b border-gray-200 pb-2 uppercase tracking-wide">
                  Optimal Work Sequence
                </h3>

                {data.battlePlan.length === 0 ? (
                  <div className="p-10 text-center text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                    No active tasks. Time to pick up something new!
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.battlePlan.map((task) => (
                      <BattlePlanCard
                        key={task.id}
                        task={task}
                        onAction={handleAction}
                        busyTaskKey={busyTaskKey}
                        busyAction={busyAction}
                        isHovered={hoveredTaskKey === task.key}
                        onHover={setHoveredTaskKey}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Right: Sidebar */}
              <aside className="flex flex-col gap-5 sticky top-6">
                {/* Event Counts */}
                <EventCounter counts={eventCounts} />

                {/* Jira Backlog + Activity */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <h3 className="text-xs font-bold text-gray-700 border-b border-gray-200 pb-2 mb-4 uppercase tracking-wide">
                    Active Sprint Backlog
                  </h3>
                  <JiraBacklogTable tasks={data.taskList} />
                  <ActivityTimeline activities={activities} />
                </div>

                {/* GitHub ↔ Jira Correlation */}
                <LinkedActivityPanel
                  records={linkedRecords}
                  loading={linkedLoading}
                  onCorrelate={handleCorrelate}
                />
              </aside>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="flex justify-between items-center border-t border-gray-200 pt-5 mt-8 text-xs text-gray-400">
          <div>DevPulse Agent OS · Enterprise Developer Workflow Intelligence</div>
          <div className="flex items-center gap-3">
            <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
              Systems Nominal
            </span>
            <a href="/docs" target="_blank" className="text-blue-400 hover:text-blue-600 transition-colors">
              API Docs ↗
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
