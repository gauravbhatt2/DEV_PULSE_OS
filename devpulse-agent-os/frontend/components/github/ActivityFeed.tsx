'use client';

import { GitHubActivityEvent, GitHubCommit, GitHubPR } from '@/types';

type Tab = 'activity' | 'commits' | 'pulls';

interface ActivityFeedProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  activity: GitHubActivityEvent[];
  commits: GitHubCommit[];
  pulls: GitHubPR[];
  loading: boolean;
  repoSelected: boolean;
  onAnalyze: (sha: string) => void;
  analyzingShа: string | null;
}

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-slate-600">–</span>;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const label = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : 'just now';
  return <span className="text-slate-500 text-[11px]">{label}</span>;
}

function JiraBadge({ ticket, url }: { ticket: string | null; url: string | null }) {
  if (!ticket) return null;
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/15 border border-blue-500/30 rounded text-[10px] text-blue-400 hover:bg-blue-500/25 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      {ticket}
    </a>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    push: { label: 'push', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    pull_request: { label: 'PR', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    create: { label: 'create', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
    delete: { label: 'delete', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  };
  const s = map[type] || { label: type, cls: 'bg-slate-700 text-slate-400 border-slate-600' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    high: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${map[level] || map.medium}`}>
      {level} risk
    </span>
  );
}

export default function ActivityFeed({
  tab, onTabChange, activity, commits, pulls, loading, repoSelected, onAnalyze, analyzingShа,
}: ActivityFeedProps) {
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'activity', label: 'Live Feed', count: activity.length },
    { id: 'commits', label: 'Commits', count: commits.length },
    { id: 'pulls', label: 'Pull Requests', count: pulls.length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pb-3 border-b border-slate-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === t.id
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="px-1.5 py-0.5 bg-slate-700 rounded-full text-[10px] text-slate-400">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 space-y-2">
        {loading && (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/60 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !repoSelected && tab !== 'activity' && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-600">
            <svg className="w-10 h-10 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm">Select a repository</p>
          </div>
        )}

        {/* Activity tab */}
        {!loading && tab === 'activity' && activity.map(ev => (
          <div key={ev.id} className="group flex gap-3 p-3 bg-slate-800/40 hover:bg-slate-800/70 rounded-lg border border-slate-700/40 transition-all">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <EventTypeBadge type={ev.event_type} />
                <span className="text-xs text-slate-400 font-mono truncate">{ev.repository}</span>
                <RelativeTime iso={ev.created_at} />
              </div>
              <p className="text-sm text-slate-200 truncate">{ev.title || '—'}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {ev.author && <span className="text-[11px] text-slate-500">by {ev.author}</span>}
                {ev.sha && <span className="text-[11px] font-mono text-slate-600">{ev.sha}</span>}
                <JiraBadge ticket={ev.jira_ticket} url={ev.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {/* Commits tab */}
        {!loading && tab === 'commits' && commits.map(c => (
          <div key={c.sha} className="group flex gap-3 p-3 bg-slate-800/40 hover:bg-slate-800/70 rounded-lg border border-slate-700/40 transition-all">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt={c.author} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 flex items-center justify-center text-xs text-slate-400 mt-0.5">
                {(c.author || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-200 truncate">{c.message}</p>
                <button
                  onClick={() => onAnalyze(c.sha)}
                  disabled={analyzingShа === c.sha}
                  className="flex-shrink-0 px-2 py-1 text-[11px] font-medium bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 rounded-md transition-all disabled:opacity-50"
                >
                  {analyzingShа === c.sha ? '…' : 'Analyze'}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[11px] text-slate-500">{c.author}</span>
                <a href={c.html_url} target="_blank" rel="noreferrer"
                  className="text-[11px] font-mono text-slate-600 hover:text-slate-400"
                  onClick={e => e.stopPropagation()}>
                  {c.short_sha}
                </a>
                {c.date && <RelativeTime iso={c.date} />}
                {(c.additions > 0 || c.deletions > 0) && (
                  <span className="text-[11px]">
                    <span className="text-emerald-500">+{c.additions}</span>
                    <span className="text-red-500 ml-1">-{c.deletions}</span>
                  </span>
                )}
                <JiraBadge ticket={c.jira_ticket} url={c.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {/* PRs tab */}
        {!loading && tab === 'pulls' && pulls.map(pr => (
          <div key={pr.number} className="group flex gap-3 p-3 bg-slate-800/40 hover:bg-slate-800/70 rounded-lg border border-slate-700/40 transition-all">
            {pr.avatar_url ? (
              <img src={pr.avatar_url} alt={pr.author} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex-shrink-0 flex items-center justify-center text-xs text-slate-400 mt-0.5">
                {(pr.author || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <a href={pr.html_url} target="_blank" rel="noreferrer"
                  className="text-sm text-slate-200 hover:text-white truncate flex-1"
                  onClick={e => e.stopPropagation()}>
                  #{pr.number} {pr.title}
                </a>
                <span className={`flex-shrink-0 text-[11px] px-1.5 py-0.5 rounded border ${
                  pr.merged_at ? 'bg-purple-500/15 text-purple-400 border-purple-500/30' :
                  pr.state === 'open' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
                  'bg-red-500/15 text-red-400 border-red-500/30'
                }`}>
                  {pr.merged_at ? 'merged' : pr.state}
                  {pr.draft ? ' · draft' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[11px] text-slate-500">{pr.author}</span>
                <span className="text-[11px] text-slate-600">{pr.head_branch} → {pr.base_branch}</span>
                {pr.created_at && <RelativeTime iso={pr.created_at} />}
                {pr.changed_files > 0 && (
                  <span className="text-[11px] text-slate-500">{pr.changed_files} files</span>
                )}
                <JiraBadge ticket={pr.jira_ticket} url={pr.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {!loading && tab === 'activity' && activity.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-10">No events received yet. Push a commit to see activity.</p>
        )}
        {!loading && tab === 'commits' && repoSelected && commits.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-10">No commits found for this repository.</p>
        )}
        {!loading && tab === 'pulls' && repoSelected && pulls.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-10">No pull requests found.</p>
        )}
      </div>
    </div>
  );
}
