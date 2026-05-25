'use client';

import { useState } from 'react';
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
    low:    { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500', width: 'w-1/4',  label: '🟢 Low' },
    medium: { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     bar: 'bg-amber-400',   width: 'w-1/2',  label: '🟡 Medium' },
    high:   { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         bar: 'bg-red-500',     width: 'w-full', label: '🔴 High' },
  }[level] || { color: 'text-gray-600', bg: 'bg-gray-100 border-gray-200', bar: 'bg-gray-400', width: 'w-1/3', label: level };

  return (
    <div className={`p-3 rounded-xl border ${config.bg}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">Risk Level</span>
        <span className={`text-xs font-bold uppercase ${config.color}`}>{config.label}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${config.bar} ${config.width} transition-all`} />
      </div>
    </div>
  );
}

export default function AnalysisPanel({ analysis, repoDetails, loading, analyzing, error }: AnalysisPanelProps) {
  const [viewPatchFile, setViewPatchFile] = useState<{filename: string, patch: string} | null>(null);

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600 font-medium">Analyzing commit with AI…</p>
        <p className="text-xs text-gray-400">Sending diff to Groq LLM</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-600 font-semibold mb-1">Analysis failed</p>
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  if (!analysis && !repoDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-400">
        <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm text-gray-500">Click <span className="text-violet-600 font-semibold">Analyze</span> on any commit</p>
        <p className="text-xs text-gray-400">AI will explain the code change</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── AI Analysis ── */}
      {analysis && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-400 font-mono">{analysis.short_sha}</p>
              <p className="text-sm text-gray-800 font-semibold mt-0.5 line-clamp-2">{analysis.message}</p>
            </div>
            {analysis.analysis._fallback && (
              <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2">
                keyword fallback
              </span>
            )}
          </div>

          {/* AI Summary */}
          <div className="p-3.5 bg-violet-50 border border-violet-200 rounded-xl">
            <p className="text-[10px] text-violet-600 font-bold uppercase tracking-wider mb-1.5">AI Summary</p>
            <p className="text-sm text-gray-700 leading-relaxed">{analysis.analysis.summary}</p>
          </div>

          <RiskIndicator level={analysis.analysis.risk_level} />

          <div className="space-y-3">
            {[
              { label: 'What Changed',  value: analysis.analysis.what_changed },
              { label: 'Why It Changed', value: analysis.analysis.why_it_changed },
              { label: 'Impact',         value: analysis.analysis.impact },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">{label}</p>
                <p className="text-xs text-gray-600 leading-relaxed">{value}</p>
              </div>
            ))}
          </div>

          {(analysis.analysis.affected_modules?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-1.5">Affected Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {(analysis.analysis.affected_modules || []).map(m => (
                  <span key={m} className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 text-[11px] rounded-md font-mono">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Jira correlation tile ── */}
          {analysis.jira_ticket && (
            <a href={analysis.jira_url || '#'} target="_blank" rel="noreferrer"
              className="flex items-center gap-3 p-3.5 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors group">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm">
                J
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-blue-700 font-bold">{analysis.jira_ticket}</p>
                <p className="text-[10px] text-blue-500">Linked Jira ticket · click to open ↗</p>
              </div>
              <svg className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
            </a>
          )}

          {/* Files changed */}
          {(analysis.files_changed?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-1.5">
                Files Changed ({analysis.files_changed?.length ?? 0})
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100">
                {(analysis.files_changed || []).map(f => (
                  <div key={f.filename} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={`text-[10px] w-14 text-center rounded-full px-1 py-0.5 font-semibold ${
                      f.status === 'added'   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      f.status === 'removed' ? 'bg-red-50 text-red-600 border border-red-200' :
                                              'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>{f.status}</span>
                    <span className="text-[11px] font-mono text-gray-600 truncate flex-1">{f.filename}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold flex-shrink-0">+{f.additions}</span>
                    <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">-{f.deletions}</span>
                    {f.patch && (
                      <button
                        onClick={() => setViewPatchFile({ filename: f.filename, patch: f.patch! })}
                        className="ml-1 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md transition-colors font-medium"
                      >
                        Diff
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Repo details (no analysis yet) ── */}
      {!analysis && repoDetails && (
        <>
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
            <p className="text-sm font-semibold text-gray-800">{repoDetails.name}</p>
            {repoDetails.description && (
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{repoDetails.description}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Issues', value: repoDetails.open_issues_count, color: 'text-orange-600' },
              { label: 'Stars',  value: repoDetails.stargazers_count,  color: 'text-amber-600' },
              { label: 'Forks',  value: repoDetails.forks_count,       color: 'text-blue-600' },
            ].map(s => (
              <div key={s.label} className="p-2.5 bg-white border border-gray-200 rounded-xl text-center shadow-sm">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>

          {(repoDetails.branches?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-1.5">Branches ({repoDetails.branches?.length ?? 0})</p>
              <div className="flex flex-wrap gap-1.5">
                {(repoDetails.branches || []).slice(0, 8).map(b => (
                  <span key={b.name} className={`px-2 py-0.5 text-[11px] rounded-md font-mono border ${
                    b.protected
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-gray-100 border-gray-200 text-gray-600'
                  }`}>
                    {b.name}{b.protected ? ' 🔒' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(repoDetails.contributors?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-1.5">Top Contributors</p>
              <div className="space-y-2">
                {(repoDetails.contributors || []).slice(0, 5).map(c => (
                  <div key={c.login} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <img src={c.avatar_url} alt={c.login} className="w-6 h-6 rounded-full ring-1 ring-gray-200" />
                    <a href={c.html_url} target="_blank" rel="noreferrer"
                      className="text-xs text-gray-700 hover:text-gray-900 flex-1 truncate font-medium">
                      {c.login}
                    </a>
                    <span className="text-[10px] text-gray-400 font-mono">{c.contributions}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Code diff popup ── */}
      {viewPatchFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setViewPatchFile(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Code diff</p>
                <h3 className="text-sm font-mono text-gray-800 font-semibold">{viewPatchFile.filename}</h3>
              </div>
              <button onClick={() => setViewPatchFile(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto text-[11px] font-mono leading-relaxed space-y-0.5 bg-gray-50 rounded-b-2xl">
              {viewPatchFile.patch.split('\n').map((line, i) => {
                let color = 'text-gray-600';
                let bg = 'bg-transparent';
                if (line.startsWith('+'))      { color = 'text-emerald-700'; bg = 'bg-emerald-50'; }
                else if (line.startsWith('-')) { color = 'text-red-600';     bg = 'bg-red-50'; }
                else if (line.startsWith('@@')){ color = 'text-violet-600';  bg = 'bg-violet-50'; }
                return (
                  <div key={i} className={`px-2 py-0.5 rounded whitespace-pre-wrap break-all ${bg} ${color}`}>
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
