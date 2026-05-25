'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchGitHubRepos,
  fetchGitHubActivity,
  fetchRepoCommits,
  fetchRepoPRs,
  fetchRepoDetails,
  analyzeCommit,
} from '@/services/api';
import type {
  GitHubRepo,
  GitHubActivityEvent,
  GitHubCommit,
  GitHubPR,
  GitHubRepoDetails,
  CommitAnalysisResult,
} from '@/types';
import RepoList from '@/components/github/RepoList';
import ActivityFeed from '@/components/github/ActivityFeed';
import AnalysisPanel from '@/components/github/AnalysisPanel';

type Tab = 'activity' | 'commits' | 'pulls';

export default function GitHubDashboardPage() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  const [tab, setTab] = useState<Tab>('activity');
  const [activity, setActivity] = useState<GitHubActivityEvent[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [pulls, setPulls] = useState<GitHubPR[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const [repoDetails, setRepoDetails] = useState<GitHubRepoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [analysis, setAnalysis] = useState<CommitAnalysisResult | null>(null);
  const [analyzingSha, setAnalyzingSha] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── Load repos ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setReposLoading(true);
      setReposError(null);
      try {
        const data = await fetchGitHubRepos();
        setRepos(data);
      } catch (e) {
        setReposError(e instanceof Error ? e.message : 'Failed to load repositories');
      } finally {
        setReposLoading(false);
      }
    };
    load();
  }, []);

  // ── Load activity + poll ────────────────────────────────────────────────────
  const loadActivity = useCallback(async () => {
    try {
      const data = await fetchGitHubActivity(50);
      setActivity(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadActivity();
    const id = setInterval(loadActivity, 30_000);
    return () => clearInterval(id);
  }, [loadActivity]);

  // ── Load repo-specific data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.full_name.split('/');
    const loadAll = async () => {
      setFeedLoading(true);
      setDetailsLoading(true);
      setAnalysis(null);
      setAnalysisError(null);
      try {
        const [commitsData, pullsData, detailsData] = await Promise.allSettled([
          fetchRepoCommits(owner, repo, 30),
          fetchRepoPRs(owner, repo, 'all'),
          fetchRepoDetails(owner, repo),
        ]);
        if (commitsData.status === 'fulfilled') setCommits(commitsData.value);
        if (pullsData.status === 'fulfilled') setPulls(pullsData.value);
        if (detailsData.status === 'fulfilled') setRepoDetails(detailsData.value);
      } finally {
        setFeedLoading(false);
        setDetailsLoading(false);
      }
    };
    loadAll();
  }, [selectedRepo]);

  const handleRepoSelect = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    setTab('commits');
    setCommits([]);
    setPulls([]);
    setRepoDetails(null);
  };

  const handleAnalyze = useCallback(async (sha: string) => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.full_name.split('/');
    setAnalyzingSha(sha);
    setAnalysis(null);
    setAnalysisError(null);
    try {
      const result = await analyzeCommit(owner, repo, sha);
      setAnalysis(result);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzingSha(null);
    }
  }, [selectedRepo]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* ── White top bar — matches Jira UI ─────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm font-extrabold tracking-wide text-gray-900">DEVPULSE</span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                Agent OS
              </span>
            </div>
            <nav className="flex items-center gap-1">
              <Link href="/" className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all">
                Battle Plan
              </Link>
              {/* ACTIVE */}
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub Intelligence
              </span>
              <Link href="/slack" className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-purple-600 hover:bg-purple-50 transition-all flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
                </svg>
                Slack Intelligence
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live · auto-refresh 30s
            </div>
            {reposError && (
              <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                {reposError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 3-column layout ──────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto flex h-[calc(100vh-57px)]">

        {/* LEFT: Repo sidebar */}
        <aside className="w-64 border-r border-gray-200 bg-white flex flex-col pt-3 flex-shrink-0">
          <div className="px-3 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Repositories</h2>
            <span className="text-[10px] text-gray-400">{repos.length}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <RepoList
              repos={repos}
              selectedRepo={selectedRepo}
              onSelect={handleRepoSelect}
              loading={reposLoading}
              search={repoSearch}
              onSearchChange={setRepoSearch}
            />
          </div>
        </aside>

        {/* CENTER: Activity feed */}
        <main className="flex-1 flex flex-col min-w-0 pt-3 border-r border-gray-200 bg-gray-50">
          <div className="px-4 pb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {selectedRepo ? selectedRepo.name : 'All Activity'}
            </h2>
            {selectedRepo && (
              <a href={selectedRepo.html_url} target="_blank" rel="noreferrer"
                className="text-[11px] text-gray-400 hover:text-gray-700 flex items-center gap-1 transition-colors">
                View on GitHub ↗
              </a>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <ActivityFeed
              tab={tab}
              onTabChange={setTab}
              activity={activity}
              commits={commits}
              pulls={pulls}
              loading={feedLoading}
              repoSelected={!!selectedRepo}
              onAnalyze={handleAnalyze}
              analyzingShа={analyzingSha}
            />
          </div>
        </main>

        {/* RIGHT: Analysis panel */}
        <aside className="w-80 flex flex-col pt-3 flex-shrink-0 bg-white border-l border-gray-200">
          <div className="px-4 pb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {analysis ? 'AI Analysis' : 'Engineering Insights'}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <AnalysisPanel
              analysis={analysis}
              repoDetails={repoDetails}
              loading={detailsLoading}
              analyzing={!!analyzingSha}
              error={analysisError}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
