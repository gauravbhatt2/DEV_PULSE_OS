'use client';

import React from 'react';
import { SlackCorrelation } from '../types';

interface SlackCorrelationFeedProps {
  correlations: SlackCorrelation[];
  loading?: boolean;
}

/**
 * SlackCorrelationFeed
 *
 * Renders sequential "unified flow" connection tiles when the local 1.5b SLM
 * detects a Slack message that references a Jira ticket and/or Git ref.
 *
 * Each tile displays the three-stage pipeline:
 *   [Git Commit] ──▶ [Jira Ticket] ──▶ [Slack Discussion]
 */
export function SlackCorrelationFeed({ correlations, loading }: SlackCorrelationFeedProps) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <CorrelationHeader />
        <div className="text-center py-6 text-gray-400 text-sm animate-pulse">
          SLM scanning Slack threads…
        </div>
      </div>
    );
  }

  if (!correlations || correlations.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <CorrelationHeader />
        <div className="text-center py-6 border border-dashed border-purple-100 rounded-lg bg-purple-50/30">
          <div className="text-2xl mb-2">💬</div>
          <p className="text-gray-500 text-sm font-medium">No Slack correlations yet.</p>
          <p className="text-gray-400 text-xs mt-1 leading-relaxed">
            When the SLM detects a Slack message mentioning a ticket (e.g.&nbsp;
            <code className="font-mono bg-gray-100 px-1 rounded">SCRUM-3</code>) or a PR,
            the unified flow tile will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <CorrelationHeader count={correlations.length} />
      <div className="flex flex-col gap-3 max-h-80 overflow-y-auto pr-1">
        {correlations.map((correlation, idx) => (
          <CorrelationTile key={`${correlation.ticket_id}-${idx}`} correlation={correlation} />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CorrelationHeader({ count }: { count?: number }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          {/* Purple chat icon */}
          <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
              clipRule="evenodd"
            />
          </svg>
          SLM Correlation Feed
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Git ↔ Jira ↔{' '}
          <span className="text-purple-500 font-semibold">Slack</span> — auto-linked by local&nbsp;SLM
        </p>
      </div>
      {count !== undefined && count > 0 && (
        <span className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-bold rounded-full uppercase tracking-wide">
          {count} match{count > 1 ? 'es' : ''}
        </span>
      )}
    </div>
  );
}

function CorrelationTile({ correlation }: { correlation: SlackCorrelation }) {
  const formattedTs = correlation.slack_ts
    ? new Date(correlation.slack_ts).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div
      id={`slack-correlation-${correlation.ticket_id}`}
      className="border border-purple-100 bg-gradient-to-r from-purple-50/40 to-white rounded-xl p-4 hover:border-purple-200 hover:shadow-sm transition-all duration-200"
    >
      {/* Three-stage pipeline flow */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Stage 1: Git Commit / PR */}
        <PipelineNode
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
          }
          label="Git Commit"
          value={correlation.git_ref || '—'}
          colorClass="bg-gray-100 border-gray-200 text-gray-700"
          iconColorClass="text-gray-600"
        />

        {/* Arrow */}
        <Arrow />

        {/* Stage 2: Jira Ticket */}
        <PipelineNode
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.757a5.215 5.215 0 0 0 5.214 5.214h2.13v2.066a5.218 5.218 0 0 0 5.215 5.215V6.762a1.005 1.005 0 0 0-1.022-1.005zM23.017 0H11.475A5.215 5.215 0 0 0 16.69 5.214h2.129v2.058A5.218 5.218 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.017 0z" />
            </svg>
          }
          label="Jira Ticket"
          value={correlation.ticket_id}
          colorClass="bg-blue-50 border-blue-200 text-blue-700"
          iconColorClass="text-blue-500"
        />

        {/* Arrow */}
        <Arrow />

        {/* Stage 3: Slack Discussion */}
        <PipelineNode
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
          }
          label="Slack Discussion"
          value={`@${correlation.slack_user}`}
          colorClass="bg-purple-50 border-purple-200 text-purple-700"
          iconColorClass="text-purple-500"
        />
      </div>

      {/* Slack message snippet */}
      <blockquote className="border-l-2 border-purple-300 pl-3 text-xs text-gray-600 italic leading-relaxed line-clamp-2">
        &ldquo;{correlation.slack_snippet || '—'}&rdquo;
      </blockquote>

      {/* Footer: repo + timestamp */}
      <div className="flex items-center justify-between mt-2.5">
        {correlation.repository && (
          <span className="font-mono text-[10px] text-gray-400">{correlation.repository}</span>
        )}
        {formattedTs && (
          <span className="text-[10px] text-gray-400 ml-auto">{formattedTs}</span>
        )}
      </div>
    </div>
  );
}

function PipelineNode({
  icon,
  label,
  value,
  colorClass,
  iconColorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorClass: string;
  iconColorClass: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium ${colorClass}`}>
      <span className={iconColorClass}>{icon}</span>
      <div className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wider opacity-60">{label}</span>
        <span className="font-mono font-bold text-[11px]">{value}</span>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <span className="text-gray-300 font-bold text-sm select-none flex-shrink-0" aria-hidden>
      ──▶
    </span>
  );
}
