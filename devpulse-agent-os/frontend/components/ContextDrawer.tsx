'use client';

import React, { useEffect } from 'react';
import { TicketContext, GitHubContextEvent } from '../types';

interface ContextDrawerProps {
  context: TicketContext | null;
  loading: boolean;
  onClose: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  const cls = p.includes('high') || p.includes('blocker') || p.includes('critical') || p.includes('urgent')
    ? 'bg-red-50 text-red-600 border-red-200'
    : p.includes('medium')
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-600 border-blue-200';
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${cls}`}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls = s.includes('progress')
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : s.includes('done') || s.includes('resolved')
    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : 'bg-gray-100 text-gray-500 border-gray-200';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}

function GitHubEventCard({ event }: { event: GitHubContextEvent }) {
  const isPR = event.event_type === 'pull_request';
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
          isPR ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-slate-100 text-slate-600 border-slate-200'
        }`}>
          {isPR ? 'Pull Request' : 'Push'}
        </span>
        {/* AI/regex match badge */}
        {event.match_type === 'ai' ? (
          <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded font-bold uppercase tracking-wide">
            ✦ AI
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-400 border border-gray-200 rounded font-medium uppercase tracking-wide">
            regex
          </span>
        )}
        <span className="text-[11px] text-gray-500 font-mono">{event.repository}</span>
        {event.branch && !isPR && (
          <span className="text-[10px] text-gray-400">
            on <span className="font-mono text-gray-600">{event.branch}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-400">{formatTime(event.created_at)}</span>
      </div>

      {isPR && event.pr_title && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-800">
            #{event.pr_number} — {event.pr_title}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
            event.pr_merged
              ? 'bg-purple-50 text-purple-600 border-purple-200'
              : event.pr_state === 'open'
              ? 'bg-green-50 text-green-600 border-green-200'
              : 'bg-gray-100 text-gray-500 border-gray-200'
          }`}>
            {event.pr_merged ? 'MERGED' : event.pr_state?.toUpperCase()}
          </span>
          {event.pr_url && (
            <a href={event.pr_url} target="_blank" rel="noreferrer"
               className="text-[10px] text-blue-500 hover:underline ml-auto">
              View PR ↗
            </a>
          )}
        </div>
      )}

      {event.commits && event.commits.length > 0 && (
        <div className="flex flex-col gap-1 pl-2 border-l-2 border-slate-200">
          {event.commits.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="font-mono text-[9.5px] text-slate-400 pt-0.5 shrink-0">{c.sha}</span>
              <span className="text-xs text-gray-700 leading-snug">{c.message}</span>
              <span className="text-[10px] text-gray-400 ml-auto shrink-0">{c.author}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContextDrawer({ context, loading, onClose }: ContextDrawerProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!loading && !context) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity"
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[560px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden border-l border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">Ticket Context</div>
              {context && <div className="text-[11px] text-gray-400 font-mono">{context.issue_key}</div>}
            </div>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-sm font-medium">Gathering context from Jira &amp; GitHub…</span>
              <span className="text-xs text-gray-300">Calling Groq AI for summary</span>
            </div>
          )}

          {context && !loading && (
            <>
              {/* AI Summary */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-indigo-600 px-2 py-0.5 bg-indigo-100 rounded border border-indigo-200">
                    ✦ AI Summary
                  </span>
                  <span className="text-[10px] text-indigo-400">powered by Groq</span>
                </div>
                <p className="text-sm text-indigo-900 leading-relaxed font-medium">{context.ai_summary}</p>
              </div>

              {/* Jira Info */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center shrink-0">
                    <span className="text-white text-[7px] font-black">J</span>
                  </div>
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Jira</span>
                </div>
                <div className="border border-gray-100 rounded-xl p-4 flex flex-col gap-3 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-[11px] text-blue-600 font-semibold mb-0.5">{context.jira.key}</div>
                      <div className="text-sm font-bold text-gray-900 leading-snug">{context.jira.summary}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={context.jira.status} />
                      <PriorityBadge priority={context.jira.priority} />
                    </div>
                  </div>
                  {context.jira.description && (
                    <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-50 pt-3">
                      {context.jira.description}
                    </p>
                  )}
                  {context.jira.url && (
                    <a href={context.jira.url} target="_blank" rel="noreferrer"
                       className="text-[11px] text-blue-500 hover:underline self-start">
                      Open in Jira ↗
                    </a>
                  )}
                </div>
              </div>

              {/* GitHub Activity */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">GitHub Activity</span>
                  <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                    {context.github.total_events} event{context.github.total_events !== 1 ? 's' : ''}
                  </span>
                </div>

                {context.github.total_events === 0 ? (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
                    No GitHub commits or PRs linked to {context.issue_key} yet.
                    <div className="text-xs mt-1 text-gray-300">
                      Push a commit mentioning &quot;{context.issue_key}&quot; or run Correlation to let AI find matches.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {context.github.events.map((ev) => (
                      <GitHubEventCard key={ev.event_id} event={ev} />
                    ))}
                  </div>
                )}
              </div>

              {/* Footer timestamp */}
              <div className="text-[10px] text-gray-300 text-right pb-2">
                Generated at {formatTime(context.generated_at)}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
