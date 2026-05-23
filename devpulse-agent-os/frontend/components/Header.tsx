import React from 'react';

interface HeaderProps {
  lastSync: string;
  onRefresh: () => void;
  disabled?: boolean;
  jiraConnected?: boolean;
  githubConnected?: boolean;
}

export function Header({ lastSync, onRefresh, disabled, jiraConnected, githubConnected }: HeaderProps) {
  return (
    <header className="flex justify-between items-center pb-5 border-b border-gray-200">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        <h1 className="text-lg font-extrabold tracking-wide text-gray-900">DEVPULSE</h1>
        <span className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">
          Agent OS
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* GitHub status */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium ${
          githubConnected
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-gray-50 border-gray-200 text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${githubConnected ? 'bg-emerald-500' : 'bg-gray-300'}`} />
          GitHub {githubConnected ? 'Connected' : 'Not Configured'}
        </div>

        {/* Jira status */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium ${
          jiraConnected
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-gray-50 border-gray-200 text-gray-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${jiraConnected ? 'bg-blue-500' : 'bg-gray-300'}`} />
          Jira {jiraConnected ? 'Connected' : 'Not Configured'}
        </div>

        {/* Last sync + refresh */}
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 font-medium">Last Sync: {lastSync}</span>
          <button
            onClick={onRefresh}
            disabled={disabled}
            className="ml-1 bg-gray-50 border border-gray-200 text-gray-500 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            ⟳ Refresh
          </button>
        </div>
      </div>
    </header>
  );
}
