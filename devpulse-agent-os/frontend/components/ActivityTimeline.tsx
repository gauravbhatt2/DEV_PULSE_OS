import React from 'react';
import { ActivityEvent } from '../types';

interface ActivityTimelineProps {
  activities: ActivityEvent[];
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">Recent Activity</h3>
      <div className="flex flex-col gap-2">
        {activities.length === 0 ? (
          <p className="text-gray-400 text-xs py-1">No recent activity.</p>
        ) : (
          activities.map((act, index) => (
            <div key={index} className="grid grid-cols-[60px_1fr] items-center gap-2 text-xs text-gray-500">
              <span className="text-gray-400 font-medium tabular-nums">{formatTime(act.timestamp)}</span>
              <span className="text-gray-800">
                <span className="font-mono text-blue-600 font-semibold mr-1">{act.issueKey}</span>
                moved to{' '}
                <span className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ml-0.5">
                  {act.status}
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
