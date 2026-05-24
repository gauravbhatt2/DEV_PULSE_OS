'use client';

import { CommitAnalysisResult, GitHubRepoDetails } from '@/types';

interface AnalysisPanelProps {
  analysis: CommitAnalysisResult | null;
  repoDetails: GitHubRepoDetails | null;
  loading: boolean;
  analyzing: boolean;
  error: string | null;
}

function RiskIndicator({ level }: { level: string }) {
  const config = {
    low: { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', bar: 'bg-emerald-500', width: 'w-1/4' },
    medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', bar: 'bg-yellow-500', width: 'w-1/2' },
    high: { color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', bar: 'bg-red-500', width: 'w-full' },
  }[level] || { color: 'text-slate-400', bg: 'bg-slate-700 border-slate-600', bar: 'bg-slate-500', width: 'w-1/3' };

  return (
    <div className={`p-3 rounded-lg border ${config.bg}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400">Risk Level</span>
        <span className={`text-xs font-semibold uppercase ${config.color}`}>{level}</span>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${config.bar} ${config.width}`} />
      </div>
    </div>
  );
}

export default function AnalysisPanel({ analysis, repoDetails, loading, analyzing, error }: AnalysisPanelProps) {
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Analyzing commit with AI…</p>
        <p className="text-xs text-slate-600">Sending diff to Groq LLM</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
        <p className="text-sm text-red-400 font-medium mb-1">Analysis failed</p>
        <p className="text-xs text-red-500/80">{error}</p>
      </div>
    );
  }

  if (!analysis && !repoDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-600">
        <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm">Click <span className="text-violet-400 font-medium">Analyze</span> on any commit</p>
        <p className="text-xs text-slate-700">AI will explain the code change</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* AI Analysis section */}
      {analysis && (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-slate-500 font-mono">{analysis.short_sha}</p>
              <p className="text-sm text-slate-300 font-medium mt-0.5 line-clamp-2">{analysis.message}</p>
            </div>
            {analysis.analysis._fallback && (
              <span className="text-[10px] text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded flex-shrink-0 ml-2">
                keyword fallback
              </span>
            )}
          </div>

          {/* Summary card */}
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
            <p className="text-xs text-violet-400 font-medium mb-1">AI Summary</p>
            <p className="text-sm text-slate-200 leading-relaxed">{analysis.analysis.summary}</p>
          </div>

          <RiskIndicator level={analysis.analysis.risk_level} />

          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">What Changed</p>
              <p className="text-xs text-slate-400 leading-relaxed">{analysis.analysis.what_changed}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Why It Changed</p>
              <p className="text-xs text-slate-400 leading-relaxed">{analysis.analysis.why_it_changed}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Impact</p>
              <p className="text-xs text-slate-400 leading-relaxed">{analysis.analysis.impact}</p>
            </div>
          </div>

          {analysis.analysis.affected_modules.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Affected Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.analysis.affected_modules.map(m => (
                  <span key={m} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-[11px] rounded-md font-mono">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.jira_ticket && (
            <a href={analysis.jira_url || '#'} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors">
              <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">J</div>
              <div>
                <p className="text-xs text-blue-400 font-medium">{analysis.jira_ticket}</p>
                <p className="text-[10px] text-slate-500">Linked Jira ticket ↗</p>
              </div>
            </a>
          )}

          {analysis.files_changed.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Files Changed ({analysis.files_changed.length})</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {analysis.files_changed.map(f => (
                  <div key={f.filename} className="flex items-center gap-2 py-1 border-b border-slate-800">
                    <span className={`text-[10px] w-14 text-center rounded px-1 ${
                      f.status === 'added' ? 'bg-emerald-500/15 text-emerald-400' :
                      f.status === 'removed' ? 'bg-red-500/15 text-red-400' :
                      'bg-yellow-500/15 text-yellow-400'
                    }`}>{f.status}</span>
                    <span className="text-[11px] font-mono text-slate-400 truncate flex-1">{f.filename}</span>
                    <span className="text-[10px] text-emerald-500 flex-shrink-0">+{f.additions}</span>
                    <span className="text-[10px] text-red-500 flex-shrink-0">-{f.deletions}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Repo details section (when no analysis yet) */}
      {!analysis && repoDetails && (
        <>
          <div>
            <p className="text-sm font-medium text-slate-200">{repoDetails.name}</p>
            {repoDetails.description && (
              <p className="text-xs text-slate-500 mt-0.5">{repoDetails.description}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Issues', value: repoDetails.open_issues_count },
              { label: 'Stars', value: repoDetails.stargazers_count },
              { label: 'Forks', value: repoDetails.forks_count },
            ].map(s => (
              <div key={s.label} className="p-2.5 bg-slate-800/60 rounded-lg text-center">
                <p className="text-sm font-semibold text-slate-200">{s.value}</p>
                <p className="text-[11px] text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          {repoDetails.branches.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Branches ({repoDetails.branches.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {repoDetails.branches.slice(0, 8).map(b => (
                  <span key={b.name} className={`px-2 py-0.5 text-[11px] rounded font-mono ${
                    b.protected ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {b.name}
                    {b.protected && ' 🔒'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {repoDetails.contributors.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Top Contributors</p>
              <div className="space-y-2">
                {repoDetails.contributors.slice(0, 5).map(c => (
                  <div key={c.login} className="flex items-center gap-2">
                    <img src={c.avatar_url} alt={c.login} className="w-6 h-6 rounded-full" />
                    <a href={c.html_url} target="_blank" rel="noreferrer"
                      className="text-xs text-slate-400 hover:text-slate-200 flex-1 truncate">
                      {c.login}
                    </a>
                    <span className="text-[11px] text-slate-600">{c.contributions} commits</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
