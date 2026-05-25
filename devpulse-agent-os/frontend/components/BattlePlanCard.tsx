import React from 'react';
import { BattlePlanItem } from '../types';

interface BattlePlanCardProps {
  task: BattlePlanItem;
  onAction: (action: 'start' | 'open' | 'done', task: BattlePlanItem) => void;
  onViewContext: (taskKey: string) => void;
  busyTaskKey: string | null;
  busyAction: string | null;
  isHovered: boolean;
  onHover: (taskKey: string | null) => void;
}

export function BattlePlanCard({ task, onAction, onViewContext, busyTaskKey, busyAction, isHovered, onHover }: BattlePlanCardProps) {
  const isP0 = task.priority === 'P0';
  const isBusy = busyTaskKey === task.key;

  const statusLower = String(task.status || '').toLowerCase();
  const statusClass = statusLower === 'in progress'
    ? 'bg-blue-50 text-blue-600 border-blue-200'
    : statusLower.includes('done') || statusLower === 'resolved'
      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
      : 'bg-gray-100 text-gray-500 border-gray-200';

  const priorityStyleMap: Record<string, string> = {
    P0: 'bg-red-50 text-red-600 border-red-200',
    P1: 'bg-amber-50 text-amber-700 border-amber-200',
    P2: 'bg-blue-50 text-blue-600 border-blue-200',
  };
  const pStyle = priorityStyleMap[task.priority] || priorityStyleMap.P2;

  return (
    <div
      onMouseEnter={() => onHover(task.key)}
      onMouseLeave={() => onHover(null)}
      className={`bg-white border rounded-xl p-4 flex flex-col gap-3 transition-shadow ${
        isP0 ? 'border-l-4 border-l-red-500' : ''
      } ${isHovered ? 'shadow-md border-gray-300' : 'border-gray-200 hover:shadow-md'}`}
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className={`text-[9.5px] px-2 py-0.5 font-bold rounded border uppercase tracking-wider ${pStyle}`}>
            {task.priority}
          </span>
          <span className="font-mono text-blue-600 font-semibold text-xs">{task.key}</span>
        </div>
        <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium border ${statusClass}`}>
          {task.status}
        </span>
      </div>

      <div className="text-sm font-semibold text-gray-900 leading-snug">{task.summary}</div>

      {task.description && (
        <div className="text-xs text-gray-500 leading-relaxed line-clamp-2">{task.description}</div>
      )}

      <div className="text-xs text-gray-400">
        <span className="font-medium text-gray-500">Slot:</span> {task.timeSlot} ·{' '}
        <span className="font-medium text-gray-500">Effort:</span> {task.estimatedEffort}h
      </div>

      <div className="bg-slate-50 border border-slate-200 border-l-2 border-l-blue-500 rounded p-2.5 text-xs text-gray-500 flex flex-col gap-1">
        <span className="text-[9.5px] uppercase tracking-wide text-blue-600 font-bold">Why Selected</span>
        <span>{task.reason}</span>
      </div>

      <div className="flex gap-2 flex-wrap mt-1">
        <button
          onClick={() => onAction('start', task)}
          disabled={isBusy}
          className="bg-blue-50 border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors hover:bg-blue-100 disabled:opacity-50"
        >
          {isBusy && busyAction === 'start' ? 'Starting…' : '▶ Start Now'}
        </button>
        <button
          onClick={() => onAction('open', task)}
          disabled={isBusy}
          className="bg-gray-50 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors hover:bg-gray-100 disabled:opacity-50"
        >
          ↗ Open Jira
        </button>
        <button
          onClick={() => onAction('done', task)}
          disabled={isBusy}
          className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          {isBusy && busyAction === 'done' ? 'Completing…' : '✓ Mark Done'}
        </button>
        <button
          onClick={() => onViewContext(task.key)}
          className="ml-auto bg-indigo-50 border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-lg font-semibold text-xs transition-colors hover:bg-indigo-100 flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          View Context
        </button>
      </div>
    </div>
  );
}
