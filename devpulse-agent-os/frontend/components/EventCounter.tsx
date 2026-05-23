import React from 'react';
import { EventCounts } from '../types';

interface EventCounterProps {
  counts: EventCounts | null;
  loading?: boolean;
}

export function EventCounter({ counts, loading }: EventCounterProps) {
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
      )}
    </div>
  );
}
