'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  lastSync: string;
  onRefresh: () => void;
  disabled?: boolean;
  jiraConnected?: boolean;
  githubConnected?: boolean;
}

export function Header({ lastSync, onRefresh, disabled, jiraConnected, githubConnected }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="flex justify-between items-center pb-5 border-b border-gray-200">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          <h1 className="text-lg font-extrabold tracking-wide text-gray-900">DEVPULSE</h1>
          <span className="px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">
            Agent OS
          </span>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1 ml-2">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              pathname === '/'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            Battle Plan
          </Link>
          <Link
            href="/github"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              pathname === '/github'
                ? 'bg-slate-800 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub Intelligence
          </Link>
        </nav>
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

