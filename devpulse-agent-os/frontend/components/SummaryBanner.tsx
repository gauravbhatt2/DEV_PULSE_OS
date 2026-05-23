import React from 'react';
import { Summary, User } from '../types';

interface SummaryBannerProps {
  summary: Summary;
  user: User;
}

export function SummaryBanner({ summary, user }: SummaryBannerProps) {
  const healthBadgeClass = summary.healthStatus === 'Healthy'
    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : summary.healthStatus === 'Medium Risk'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-red-600 bg-red-50 border-red-200';

  return (
    <section className="bg-white border border-gray-200 rounded-2xl p-6 flex justify-between items-center shadow-sm gap-6 flex-wrap">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-400 font-medium">Your highest impact work is ready.</p>
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          Ready to focus, {user.name}
        </h2>
      </div>

      <div className="flex items-stretch gap-3 flex-wrap">
        {[
          { label: 'Total', value: summary.totalTasks, cls: 'text-gray-900' },
          { label: 'Critical', value: summary.criticalTasks, cls: 'text-red-500' },
          { label: 'Review', value: summary.reviewTasks, cls: 'text-amber-600' },
          { label: 'Focus', value: `${summary.focusHours}h`, cls: 'text-blue-600' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-xl py-2 px-4 min-w-[68px] gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</span>
            <strong className={`text-xl font-bold leading-tight ${cls}`}>{value}</strong>
          </div>
        ))}

        <div className="flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-xl py-2 px-4 min-w-[80px] gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Health</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${healthBadgeClass}`}>
            {summary.healthStatus}
          </span>
        </div>
      </div>
    </section>
  );
}
