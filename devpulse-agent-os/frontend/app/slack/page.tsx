'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchSlackMessages, fetchSlackStatus, fetchSlackChannels } from '@/services/api';
import type { SlackMessage } from '@/types';
import type { SlackChannel } from '@/services/api';

type FilterMode = 'all' | 'tickets' | 'prs' | 'shas';

const CHANNEL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SLACK_DEFAULT_CHANNEL) ||
  'development';

export default function SlackIntelligencePage() {
  const [messages, setMessages]               = useState<SlackMessage[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [channel, setChannel]                 = useState(CHANNEL);
  const [filter, setFilter]                   = useState<FilterMode>('all');
  const [search, setSearch]                   = useState('');
  const [workspace, setWorkspace]             = useState<string | null>(null);
  const [botUser, setBotUser]                 = useState<string | null>(null);
  const [lastSynced, setLastSynced]           = useState<string>('—');
  const [syncing, setSyncing]                 = useState(false);
  const [channels, setChannels]               = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load workspace + channel list ────────────────────────────────────────────
  useEffect(() => {
    fetchSlackStatus()
      .then(s => { setWorkspace(s.workspace ?? null); setBotUser(s.bot_user ?? null); })
      .catch(() => {});
    fetchSlackChannels()
      .then(chs => setChannels(chs))
      .catch(() => {})
      .finally(() => setChannelsLoading(false));
  }, []);

  // ── Fetch messages ────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async (ch: string, silent = false) => {
    if (!silent) setLoading(true); else setSyncing(true);
    setError(null);
    try {
      const res = await fetchSlackMessages(ch, 50);
      setMessages(res.messages);
      setLastSynced(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch messages');
    } finally { setLoading(false); setSyncing(false); }
  }, []);

  useEffect(() => {
    loadMessages(channel);
    intervalRef.current = setInterval(() => loadMessages(channel, true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [channel, loadMessages]);

  const switchChannel = (name: string) => {
    if (name !== channel) { setChannel(name); setMessages([]); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filtered = messages.filter(msg => {
    const { tickets, pull_requests, commit_shas } = msg.ticket_indicators;
    const matchesFilter =
      filter === 'all'     ? true :
      filter === 'tickets' ? tickets.length > 0 :
      filter === 'prs'     ? pull_requests.length > 0 :
                             commit_shas.length > 0;
    const matchesSearch =
      !search ||
      msg.message_text.toLowerCase().includes(search.toLowerCase()) ||
      msg.developer_id.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const totalTickets = messages.reduce((n, m) => n + m.ticket_indicators.tickets.length, 0);
  const totalPRs     = messages.reduce((n, m) => n + m.ticket_indicators.pull_requests.length, 0);
  const totalSHAs    = messages.reduce((n, m) => n + m.ticket_indicators.commit_shas.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">

      {/* ── White top bar — matches Jira UI ───────────────────────────────────── */}
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
              <Link href="/github" className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-all flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub Intelligence
              </Link>
              {/* ACTIVE */}
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
                </svg>
                Slack Intelligence
              </span>
            </nav>
          </div>

          {/* Right: workspace meta */}
          <div className="flex items-center gap-3">
            {workspace && (
              <span className="text-xs text-gray-500">
                <span className="text-gray-700 font-medium">{workspace}</span>
                {botUser && <span> · @{botUser}</span>}
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-purple-400 animate-ping' : 'bg-purple-500 animate-pulse'}`} />
              {syncing ? 'Syncing…' : `Last sync ${lastSynced}`}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto flex h-[calc(100vh-57px)]">

        {/* LEFT SIDEBAR — channel list + stats + filter */}
        <aside className="w-64 border-r border-gray-200 bg-white flex flex-col p-4 gap-5 flex-shrink-0">

          {/* Dynamic Channel List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Channels</h2>
              <span className="text-[10px] text-gray-400">{channels.length}</span>
            </div>
            {channelsLoading ? (
              <div className="flex flex-col gap-1.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-8" />
                ))}
              </div>
            ) : channels.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">No channels found</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    id={`channel-btn-${ch.name}`}
                    onClick={() => switchChannel(ch.name)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all group ${
                      channel === ch.name
                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        ch.is_member ? 'bg-purple-500' : 'bg-gray-300'
                      }`} />
                      <span className="font-medium truncate"># {ch.name}</span>
                    </div>
                    {ch.num_members > 0 && (
                      <span className={`text-[10px] flex-shrink-0 ml-1 ${
                        channel === ch.name ? 'text-purple-500' : 'text-gray-400 group-hover:text-gray-500'
                      }`}>
                        {ch.num_members}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SLM Stats */}
          <div>
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">SLM Extracted</h2>
            <div className="flex flex-col gap-2">
              <StatBox label="Messages"    value={messages.length} color="purple" />
              <StatBox label="Ticket Refs" value={totalTickets}    color="blue" />
              <StatBox label="PR Refs"     value={totalPRs}        color="emerald" />
              <StatBox label="Commit SHAs" value={totalSHAs}       color="amber" />
            </div>
          </div>

          {/* Filter */}
          <div>
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Filter</h2>
            <div className="flex flex-col gap-1">
              {(['all', 'tickets', 'prs', 'shas'] as FilterMode[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === f
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {f === 'all'     ? '🔮 All Messages' :
                   f === 'tickets' ? '📋 Has Ticket Ref' :
                   f === 'prs'     ? '🔀 Has PR Ref' :
                                    '🔑 Has Commit SHA'}
                </button>
              ))}
            </div>
          </div>

          {/* Manual refresh */}
          <button
            onClick={() => loadMessages(channel)}
            disabled={loading}
            className="mt-auto w-full py-2 border border-purple-200 text-purple-600 hover:bg-purple-50 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            ⟳ Manual Sync
          </button>
        </aside>

        {/* MAIN — Message Feed */}
        <main className="flex-1 flex flex-col min-w-0 bg-gray-50">
          {/* Toolbar */}
          <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-100 transition-all">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                id="slack-search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search #${channel}…`}
                className="flex-1 bg-transparent text-xs text-gray-700 placeholder-gray-400 outline-none"
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {filtered.length} / {messages.length} messages
            </span>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex flex-col gap-3 p-5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-white border border-gray-100 rounded-xl h-20 shadow-sm" />
                ))}
              </div>
            )}

            {error && (
              <div className="m-5 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                <strong>Error:</strong> {error}
                <br />
                <span className="text-xs text-red-400 mt-1 block">
                  Make sure your bot is invited to <code className="font-mono bg-red-100 px-1 rounded">#{channel}</code> and has <code className="font-mono bg-red-100 px-1 rounded">channels:history</code> scope.
                </span>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <svg className="w-12 h-12 opacity-30" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd"/>
                </svg>
                <p className="text-sm font-medium text-gray-500">No messages found</p>
                <p className="text-xs text-gray-400">Try switching channel or clearing the filter</p>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="p-5 flex flex-col gap-3">
                {filtered.map((msg, idx) => (
                  <MessageCard key={`${msg.developer_id}-${msg.timestamp}-${idx}`} msg={msg} />
                ))}
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANEL — SLM Correlation Summary */}
        <aside className="w-72 border-l border-gray-200 bg-white flex flex-col p-4 gap-5 flex-shrink-0">
          <div>
            <h2 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">SLM Correlation</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              The local 1.5b SLM scans every message for Jira ticket IDs, PR numbers and commit SHAs. Matches are extracted from{' '}
              <span className="text-purple-600 font-mono font-semibold">#{channel}</span>.
            </p>
          </div>

          <CorrelationSection title="Jira Tickets" color="blue" icon="📋"
            items={messages.flatMap(m => m.ticket_indicators.tickets.map(t => ({ ref: t, user: m.developer_id, ts: m.timestamp })))}
          />
          <CorrelationSection title="Pull Requests" color="emerald" icon="🔀"
            items={messages.flatMap(m => m.ticket_indicators.pull_requests.map(p => ({ ref: `PR #${p}`, user: m.developer_id, ts: m.timestamp })))}
          />
          <CorrelationSection title="Commit SHAs" color="amber" icon="🔑"
            items={messages.flatMap(m => m.ticket_indicators.commit_shas.map(s => ({ ref: s.slice(0, 7), user: m.developer_id, ts: m.timestamp })))}
          />
        </aside>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    purple: 'text-purple-700 bg-purple-50 border-purple-200',
    blue:   'text-blue-700 bg-blue-50 border-blue-200',
    emerald:'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber:  'text-amber-700 bg-amber-50 border-amber-200',
  };
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${colors[color]}`}>
      <span className="text-[11px] font-medium">{label}</span>
      <span className="text-base font-bold leading-none">{value}</span>
    </div>
  );
}

function MessageCard({ msg }: { msg: SlackMessage }) {
  const { tickets, pull_requests, commit_shas } = msg.ticket_indicators;
  const hasIndicators = tickets.length > 0 || pull_requests.length > 0 || commit_shas.length > 0;

  const formattedTs = msg.timestamp
    ? new Date(msg.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      id={`slack-msg-${msg.developer_id}-${msg.timestamp}`}
      className={`rounded-xl border p-4 bg-white shadow-sm transition-all hover:shadow-md ${
        hasIndicators ? 'border-purple-200' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {msg.developer_id.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <span className="text-xs font-semibold text-gray-800">{msg.developer_id}</span>
            {formattedTs && <span className="ml-2 text-[10px] text-gray-400">{formattedTs}</span>}
          </div>
        </div>
        {hasIndicators && (
          <span className="flex-shrink-0 px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-600 text-[9px] font-bold rounded-full uppercase tracking-wide">
            SLM Matched
          </span>
        )}
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">{msg.message_text || '—'}</p>

      {hasIndicators && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tickets.map(t => <Chip key={t} label={t} color="blue" />)}
          {pull_requests.map(p => <Chip key={p} label={`PR #${p}`} color="emerald" />)}
          {commit_shas.map(s => <Chip key={s} label={s.slice(0, 7)} color="amber" mono />)}
        </div>
      )}
    </div>
  );
}

function Chip({ label, color, mono }: { label: string; color: string; mono?: boolean }) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    emerald:'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:  'bg-amber-50 border-amber-200 text-amber-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold ${mono ? 'font-mono' : ''} ${colors[color]}`}>
      {label}
    </span>
  );
}

function CorrelationSection({ title, color, icon, items }: {
  title: string; color: string; icon: string;
  items: { ref: string; user: string; ts: string }[];
}) {
  const borderColors: Record<string, string> = {
    blue: 'border-blue-200', emerald: 'border-emerald-200', amber: 'border-amber-200',
  };
  const textColors: Record<string, string> = {
    blue: 'text-blue-700', emerald: 'text-emerald-700', amber: 'text-amber-700',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{icon} {title}</h3>
        <span className={`text-xs font-bold ${textColors[color]}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">None detected yet</p>
      ) : (
        <div className={`flex flex-col gap-1 max-h-32 overflow-y-auto border-l-2 pl-2 ${borderColors[color]}`}>
          {items.slice(0, 15).map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={`font-mono text-[11px] font-semibold ${textColors[color]}`}>{item.ref}</span>
              <span className="text-[10px] text-gray-400 truncate ml-2 max-w-[80px]">{item.user}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
