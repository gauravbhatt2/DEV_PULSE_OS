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
  if (!iso) return <span className="text-gray-400">–</span>;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  const label = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : mins > 0 ? `${mins}m ago` : 'just now';
  return <span className="text-gray-400 text-[11px]">{label}</span>;
}

function JiraBadge({ ticket, url }: { ticket: string | null; url: string | null }) {
  if (!ticket) return null;
  return (
    <a
      href={url || '#'}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px] text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      <span className="w-3 h-3 bg-blue-600 rounded-sm inline-flex items-center justify-center text-white text-[8px] font-bold">J</span>
      {ticket}
    </a>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    push:         { label: 'push',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    pull_request: { label: 'PR',     cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    create:       { label: 'create', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    delete:       { label: 'delete', cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const s = map[type] || { label: type, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function ActivityFeed({
  tab, onTabChange, activity, commits, pulls, loading, repoSelected, onAnalyze, analyzingShа,
}: ActivityFeedProps) {
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'activity', label: 'Live Feed',     count: activity.length },
    { id: 'commits',  label: 'Commits',       count: commits.length },
    { id: 'pulls',    label: 'Pull Requests', count: pulls.length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pb-3 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onTabChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === t.id
                ? 'bg-gray-900 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                tab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
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
              <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !repoSelected && tab !== 'activity' && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <svg className="w-10 h-10 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <p className="text-sm text-gray-500">Select a repository</p>
          </div>
        )}

        {/* ── Activity tab ── */}
        {!loading && tab === 'activity' && activity.map(ev => (
          <div key={ev.id} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <EventTypeBadge type={ev.event_type} />
                <span className="text-xs text-gray-500 font-mono truncate">{ev.repository}</span>
                <RelativeTime iso={ev.created_at} />
              </div>
              <p className="text-sm text-gray-800 truncate font-medium">{ev.title || '—'}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {ev.author && <span className="text-[11px] text-gray-500">by {ev.author}</span>}
                {ev.sha    && <span className="text-[11px] font-mono text-gray-400">{ev.sha}</span>}
                <JiraBadge ticket={ev.jira_ticket} url={ev.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {/* ── Commits tab ── */}
        {!loading && tab === 'commits' && commits.map(c => (
          <div key={c.sha} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all">
            {c.avatar_url ? (
              <img src={c.avatar_url} alt={c.author} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-gray-100" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-xs text-gray-600 font-bold mt-0.5">
                {(c.author || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-800 truncate font-medium leading-snug">{c.message}</p>
                <button
                  onClick={() => onAnalyze(c.sha)}
                  disabled={analyzingShа === c.sha}
                  className="flex-shrink-0 px-2.5 py-1 text-[11px] font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-all disabled:opacity-50 shadow-sm"
                >
                  {analyzingShа === c.sha ? '…' : 'Analyze'}
                </button>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[11px] text-gray-500">{c.author}</span>
                <a href={c.html_url} target="_blank" rel="noreferrer"
                  className="text-[11px] font-mono text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={e => e.stopPropagation()}>
                  {c.short_sha}
                </a>
                {c.date && <RelativeTime iso={c.date} />}
                {(c.additions > 0 || c.deletions > 0) && (
                  <span className="text-[11px]">
                    <span className="text-emerald-600 font-medium">+{c.additions}</span>
                    <span className="text-red-500 font-medium ml-1">-{c.deletions}</span>
                  </span>
                )}
                <JiraBadge ticket={c.jira_ticket} url={c.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {/* ── PRs tab ── */}
        {!loading && tab === 'pulls' && pulls.map(pr => (
          <div key={pr.number} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all">
            {pr.avatar_url ? (
              <img src={pr.avatar_url} alt={pr.author} className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-gray-100" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center text-xs text-gray-600 font-bold mt-0.5">
                {(pr.author || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <a href={pr.html_url} target="_blank" rel="noreferrer"
                  className="text-sm text-gray-800 hover:text-gray-900 font-medium truncate flex-1 leading-snug"
                  onClick={e => e.stopPropagation()}>
                  #{pr.number} {pr.title}
                </a>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  pr.merged_at    ? 'bg-purple-50 text-purple-700 border-purple-200' :
                  pr.state === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {pr.merged_at ? 'merged' : pr.state}{pr.draft ? ' · draft' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[11px] text-gray-500">{pr.author}</span>
                <span className="text-[11px] text-gray-400 font-mono">{pr.head_branch} → {pr.base_branch}</span>
                {pr.created_at && <RelativeTime iso={pr.created_at} />}
                {pr.changed_files > 0 && (
                  <span className="text-[11px] text-gray-400">{pr.changed_files} files</span>
                )}
                <JiraBadge ticket={pr.jira_ticket} url={pr.jira_url} />
              </div>
            </div>
          </div>
        ))}

        {/* Empty states */}
        {!loading && tab === 'activity' && activity.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No events received yet. Push a commit to see activity.</p>
        )}
        {!loading && tab === 'commits' && repoSelected && commits.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No commits found for this repository.</p>
        )}
        {!loading && tab === 'pulls' && repoSelected && pulls.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">No pull requests found.</p>
        )}
      </div>
    </div>
  );
}
