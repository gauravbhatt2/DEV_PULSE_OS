import React from 'react';
import { EventCounts } from '../types';

interface EventCounterProps {
  counts: EventCounts | null;
  loading?: boolean;
  /** Number of Slack messages fetched in the last sync — appended to the pipeline grid */
  slackMessages?: number;
}

export function EventCounter({ counts, loading, slackMessages }: EventCounterProps) {
  const metrics = counts
    ? [
        { label: 'GitHub Events', value: counts.github_events, color: 'text-gray-900', icon: '🐙' },
        { label: 'Jira Events', value: counts.jira_events, color: 'text-blue-600', icon: '📋' },
        { label: 'Linked', value: counts.linked_activity, color: 'text-emerald-600', icon: '🔗' },
        { label: 'CI/CD Runs', value: counts.cicd_pipelines, color: 'text-amber-600', icon: '⚙️' },
      ]
    : [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-4">Event Pipeline</h3>
      {loading ? (
        <div className="text-center py-4 text-gray-400 text-sm animate-pulse">Loading…</div>
      ) : counts === null ? (
        <div className="text-center py-4 text-gray-300 text-xs">Connect backend to see metrics</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {metrics.map(({ label, value, color, icon }) => (
              <div key={label} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-base">{icon}</span>
                <div>
                  <div className={`text-lg font-bold leading-none ${color}`}>{value}</div>
                  <div className="text-[10px] text-gray-400 font-medium mt-0.5">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Slack Messages row — full-width, only shown when data is present */}
          <div
            id="event-pipeline-slack-row"
            className="mt-3 flex items-center gap-2 p-2 bg-purple-50 rounded-lg border border-purple-100"
          >
            {/* Chat-bubble SVG icon */}
            <svg
              className="w-4 h-4 flex-shrink-0 text-purple-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <div className="text-lg font-bold leading-none text-purple-700">
                {slackMessages ?? counts.slack_threads ?? 0}
              </div>
              <div className="text-[10px] text-purple-400 font-medium mt-0.5">Slack Messages</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
