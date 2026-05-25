import React from 'react';
import { LinkedActivityRecord } from '../types';

interface LinkedActivityPanelProps {
  records: LinkedActivityRecord[];
  loading?: boolean;
  onCorrelate?: () => void;
}

export function LinkedActivityPanel({ records, loading, onCorrelate }: LinkedActivityPanelProps) {
  const getEventTypeIcon = (type: string | null) => {
    if (type === 'push') return '📦';
    if (type === 'pull_request') return '🔀';
    return '⚡';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">GitHub ↔ Jira Correlation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Regex matched + <span className="text-indigo-500 font-semibold">✦ AI</span> matched</p>
        </div>
        {onCorrelate && (
          <button
            onClick={onCorrelate}
            className="text-xs bg-blue-50 border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-100 transition-colors"
          >
            ⟳ Run Correlation
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm animate-pulse">Loading correlation data…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
          <p className="text-gray-400 text-sm">No linked activity yet.</p>
          <p className="text-gray-300 text-xs mt-1">
            Push a commit with a ticket ID (e.g. &quot;DEV-101 Fix login bug&quot;) to see correlations.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {records.map((record) => (
            <div
              key={record.id}
              className="border border-gray-100 rounded-lg p-3 hover:border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-base leading-none">{getEventTypeIcon(record.github_event_type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Jira Ticket */}
                      {record.jira_ticket_url ? (
                        <a
                          href={record.jira_ticket_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs font-bold text-blue-600 hover:underline"
                        >
                          {record.jira_ticket_id}
                        </a>
                      ) : (
                        <span className="font-mono text-xs font-bold text-blue-600">{record.jira_ticket_id}</span>
                      )}
                      {/* GitHub Event Type Badge */}
                      {record.github_event_type && (
                        <span className="text-[9.5px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium uppercase tracking-wide">
                          {record.github_event_type}
                        </span>
                      )}
                      {/* AI / Regex match badge */}
                      {record.match_type === 'ai' ? (
                        <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded font-bold uppercase tracking-wide">
                          ✦ AI
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-400 border border-gray-200 rounded font-medium uppercase tracking-wide">
                          regex
                        </span>
                      )}
                      {/* Repository */}
                      {record.repository && (
                        <span className="text-[10px] text-gray-400 font-mono">{record.repository}</span>
                      )}
                    </div>
                    {/* Commit message or PR title */}
                    <p className="text-xs text-gray-600 mt-1 truncate">
                      {record.pr_title || record.commit_message || record.description || '—'}
                    </p>
                  </div>
                </div>
                {/* Timestamp */}
                <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                  {record.created_at
                    ? new Date(record.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
