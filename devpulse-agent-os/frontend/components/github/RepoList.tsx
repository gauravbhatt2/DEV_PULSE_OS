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
    TypeScript: 'bg-blue-400', JavaScript: 'bg-yellow-400', Python: 'bg-green-400',
    Go: 'bg-cyan-400', Rust: 'bg-orange-400', Java: 'bg-red-400', Ruby: 'bg-red-500',
    'C++': 'bg-pink-400', C: 'bg-gray-400', Shell: 'bg-emerald-400',
  };
  if (!lang) return null;
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0 ${colors[lang] || 'bg-slate-400'}`} />
  );
}

export default function RepoList({ repos, selectedRepo, onSelect, loading, search, onSearchChange }: RepoListProps) {
  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pb-3">
        <input
          type="text"
          placeholder="Search repositories…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 px-2">
        {loading && (
          <div className="space-y-2 px-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-8">
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
                  ? 'bg-blue-600/20 border border-blue-500/40 text-white'
                  : 'hover:bg-slate-800/80 text-slate-300 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <LanguageDot lang={repo.language} />
                <span className="text-xs font-medium truncate">{repo.name}</span>
                {repo.private && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-400 rounded flex-shrink-0">
                    private
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="text-[11px] text-slate-500 truncate">{repo.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-slate-600">
                  {repo.open_issues_count} issues
                </span>
                {repo.pushed_at && (
                  <span className="text-[10px] text-slate-600">
                    {new Date(repo.pushed_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-3 pt-2 border-t border-slate-800">
        <p className="text-[11px] text-slate-600">{repos.length} repositories connected</p>
      </div>
    </div>
  );
}
