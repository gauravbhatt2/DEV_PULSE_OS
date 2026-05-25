'use client';

import { GitHubRepo } from '@/types';

interface RepoListProps {
  repos: GitHubRepo[];
  selectedRepo: GitHubRepo | null;
  onSelect: (repo: GitHubRepo) => void;
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
}

function LanguageDot({ lang }: { lang: string | null }) {
  const colors: Record<string, string> = {
    TypeScript: 'bg-blue-500', JavaScript: 'bg-yellow-400', Python: 'bg-green-500',
    Go: 'bg-cyan-500', Rust: 'bg-orange-500', Java: 'bg-red-500', Ruby: 'bg-red-600',
    'C++': 'bg-pink-500', C: 'bg-gray-500', Shell: 'bg-emerald-500',
  };
  if (!lang) return null;
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0 ${colors[lang] || 'bg-gray-400'}`} />;
}

export default function RepoList({ repos, selectedRepo, onSelect, loading, search, onSearchChange }: RepoListProps) {
  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all">
          <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            type="text"
            placeholder="Search repositories…"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-0.5 px-2">
        {loading && (
          <div className="space-y-2 px-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            {repos.length === 0 ? 'No repositories found' : 'No matches'}
          </p>
        )}

        {!loading && filtered.map(repo => {
          const isSelected = selectedRepo?.full_name === repo.full_name;
          return (
            <button
              key={repo.id}
              onClick={() => onSelect(repo)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${
                isSelected
                  ? 'bg-blue-50 border border-blue-200 text-blue-900'
                  : 'hover:bg-gray-50 text-gray-700 border border-transparent hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <LanguageDot lang={repo.language} />
                <span className="text-xs font-medium truncate">{repo.name}</span>
                {repo.private && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded border border-gray-200 flex-shrink-0">
                    private
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="text-[11px] text-gray-400 truncate">{repo.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-gray-400">{repo.open_issues_count} issues</span>
                {repo.pushed_at && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(repo.pushed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pt-2 border-t border-gray-100">
        <p className="text-[11px] text-gray-400">{repos.length} repositories connected</p>
      </div>
    </div>
  );
}
