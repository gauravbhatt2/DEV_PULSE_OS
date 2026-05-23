import React from 'react';
import { TaskListItem } from '../types';

interface JiraBacklogTableProps {
  tasks: TaskListItem[];
}

export function JiraBacklogTable({ tasks }: JiraBacklogTableProps) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-4 text-gray-400 text-xs border border-dashed border-gray-200 rounded-lg">
        No active tasks.
      </div>
    );
  }

  const priorityBadge: Record<string, string> = {
    P0: 'bg-red-100 text-red-600',
    P1: 'bg-amber-100 text-amber-700',
    P2: 'bg-blue-100 text-blue-600',
  };

  return (
    <div className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase ${priorityBadge[task.priority] || priorityBadge.P2}`}>
            {task.priority}
          </span>
          <span className="font-mono text-blue-600 text-xs font-semibold min-w-[70px]">{task.key}</span>
          <span className="text-xs text-gray-700 truncate flex-1">{task.summary}</span>
          <span className="text-[11px] text-gray-400 whitespace-nowrap">{task.status}</span>
        </div>
      ))}
    </div>
  );
}
