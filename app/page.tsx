'use client'
import { useEffect, useState } from 'react'

// Tailwind classes for each node state. Single source of truth so future
// states (e.g., 'error') drop in cleanly.
const NODE_CLS = {
  built:    'border-green-600 bg-green-900/40 text-green-200 hover:bg-green-900/60',
  planned:  'border-indigo-600 bg-indigo-900/40 text-indigo-200 hover:bg-indigo-900/60',
  // Neon orange — fires when an agent has written an agent_events row in
  // the last ~90s (see /api/data ACTIVE_WINDOW_SEC). Overrides 'built'.
  active:   'border-orange-500 bg-orange-600/30 text-orange-200 hover:bg-orange-600/50 shadow-[0_0_12px_rgba(251,146,60,0.45)] animate-pulse',
  infra:    'border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900/80',
  user:     'border-green-600 bg-green-900/40 text-green-200 hover:bg-green-900/60',
}

type State = 'built' | 'planned' | 'active' | 'infra' | 'user'

function Node({ label, sub, state }: { label: string; sub?: string; state: State }) {
  return (
    <div
      className={
        'w-full rounded-lg border px-4 py-2.5 text-sm font-semibold cursor-pointer ' +
        'select-none transition-colors duration-150 ' +
        NODE_CLS[state]
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-center">
          <div>{label}</div>
          {sub && <div className="text-xs font-normal mt-0.5 opacity-70">{sub}</div>}
        </div>
        <span className="text-xs opacity-40 flex-shrink-0">▶</span>
      </div>
    </div>
  )
}

function StatCard({
  label, value, warn, ceiling,
}: { label: string; value: string | number; warn?: boolean; ceiling?: number }) {
  return (
    <div className={`rounded-lg border p-4 ${warn ? 'border-red-700 bg-red-950/30' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${warn ? 'text-red-400' : 'text-zinc-100'}`}>{value}</div>
      {typeof ceiling === 'number' && (
        <div className="text-xs text-zinc-600 mt-0.5">ceiling: {ceiling}</div>
      )}
    </div>
  )
}

type DataResponse = {
  usage: { pulse: { haiku_fresh: number; haiku_cached: number }; crm: { haiku_fresh: number }; sonnet_total: number }
  events: { id: string; created_at: string; agent_name: string | null; kind: string; script: string | null; summary: string | null }[]
  errors: { id: string; created_at: string; source: string | null; script: string | null; level: string; line: string }[]
  active: { pulse: boolean; crm: boolean; manager: boolean; optimizer: boolean }
  active_window_sec: number
  as_of: string
}

export default function Page() {
  const [data, setData] = useState<DataResponse | null>(null)

  // Poll /api/data on mount + every 15s so agent cards flash neon orange
  // within ~15s of an agent writing an event row. Active window itself is
  // 90s — so an agent that fires once will stay highlighted for ~90s.
  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        const r = await fetch('/api/data', { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as DataResponse
        if (mounted) setData(d)
      } catch {
        // Network blip — next tick will retry. Don't show error state for transient fails.
      }
    }
    fetchData()
    const t = setInterval(fetchData, 15_000)
    return () => { mounted = false; clearInterval(t) }
  }, [])

  const pulseState: State = data?.active.pulse ? 'active' : 'built'
  const crmState: State   = data?.active.crm   ? 'active' : 'built'

  const pHF = data?.usage.pulse.haiku_fresh ?? 0
  const pHC = data?.usage.pulse.haiku_cached ?? 0
  const cHF = data?.usage.crm.haiku_fresh ?? 0
  const son = data?.usage.sonnet_total ?? 0
  const pHitPct = (pHF + pHC) > 0 ? Math.round((pHC / (pHF + pHC)) * 100) : 0

  // Activity totals (from events feed)
  const alertCount = (data?.events ?? []).filter(e => e.kind === 'alert_sent').length
  const fixCount   = (data?.events ?? []).filter(e => ['fix_proposed','fix_applied','fix_error'].includes(e.kind)).length
  const diagCount  = (data?.events ?? []).filter(e => !['alert_sent','fix_proposed','fix_applied','fix_error'].includes(e.kind)).length

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Agent Dashboard</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pulse + CRM + Manager + Optimizer · last 24h · live (15s refresh)
            </p>
          </div>
          <div className="text-xs text-zinc-600 font-mono">
            {data?.as_of ? new Date(data.as_of).toUTCString() : '—'}
          </div>
        </div>

        {/* Agent Hierarchy */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Agent Hierarchy</h2>

          {/* You */}
          <div className="flex flex-col items-center">
            <div className="w-full max-w-md mb-3"><Node label="You" state="user" /></div>
            <div className="w-px h-6 bg-zinc-700" />
            <div className="w-full mb-3"><Node label="Manager Agent" sub="routes asks, summarizes" state={data?.active.manager ? 'active' : 'planned'} /></div>

            {/* 3 columns */}
            <div className="w-full grid grid-cols-3 gap-6 mt-2">
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wider text-center">Project Agents</p>
                <Node label="Pulse · Sorcerer"  sub="Amazon FBA monitoring"   state={pulseState} />
                <Node label="CRMJuice · CRM"    sub="coaching-crm monitoring" state={crmState} />
                <Node label="Future Project"    state="planned" />
              </div>
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wider text-center">Function Agents</p>
                <Node label="Testing / QA"      state="planned" />
                <Node label="Customer Support"  state="planned" />
                <Node label="Finance / Books"   state="planned" />
              </div>
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 uppercase tracking-wider text-center">Personal</p>
                <Node label="Calendar / Email"  state="planned" />
                <Node label="Daily Digest"      state="planned" />
                <Node label="Research Brief"    state="planned" />
              </div>
            </div>

            {/* Shared learning */}
            <div className="w-px h-6 bg-zinc-700 mt-6" />
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Shared Learning</p>
            <div className="w-full max-w-2xl mb-2">
              <Node label="Common Knowledge (Notion)" sub="cross-agent gotchas, rules, postmortems" state="planned" />
            </div>

            {/* Infrastructure */}
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 mt-6">Infrastructure</p>
            <div className="w-full grid grid-cols-4 gap-4 mb-4">
              <Node label="Mac Mini"           sub="main workstation"        state="infra" />
              <Node label="Backup MacBook Air" sub="VPS watchdog · 10.1.10.108" state="infra" />
              <Node label="Hetzner VPS"        sub="compute · cron · loops"  state="infra" />
              <Node label="Railway"            sub="cloud compute · crons"   state="infra" />
            </div>
            <div className="w-full grid grid-cols-3 gap-4 max-w-3xl">
              <Node label="Supabase" sub="events · logs · cursors"     state="infra" />
              <Node label="Telegram" sub="interface per agent"          state="infra" />
              <Node label="Notion"   sub="live config + knowledge"      state="infra" />
            </div>

            {/* Legend */}
            <div className="flex gap-6 mt-6 text-xs text-zinc-500">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-green-600 inline-block" /> Built</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block animate-pulse" /> Active</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-indigo-700 inline-block" /> Planned</div>
            </div>
          </div>
        </section>

        {/* Claude usage */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Claude Usage (24h)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Pulse Haiku (fresh)"  value={pHF} warn={pHF > 500} ceiling={500} />
            <StatCard label="Pulse cache hit rate" value={`${pHitPct}%`} />
            <StatCard label="CRM Haiku (fresh)"    value={cHF} warn={cHF > 500} ceiling={500} />
            <StatCard label="Sonnet fixer sessions" value={son} warn={son > 5} ceiling={5} />
          </div>
        </section>

        {/* Activity */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Activity (24h)</h2>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Alerts sent"  value={alertCount} />
            <StatCard label="Fix actions" value={fixCount} />
            <StatCard label="Diagnoses"   value={diagCount} />
          </div>
        </section>

        {/* Event feed */}
        <details className="rounded-lg border border-zinc-800">
          <summary className="cursor-pointer p-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Event Feed (non-observation, last 24h) ▸ {(data?.events ?? []).length}
          </summary>
          <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-500"><tr>
                <th className="text-left py-1 pr-2">Time</th>
                <th className="text-left pr-2">Agent</th>
                <th className="text-left pr-2">Kind</th>
                <th className="text-left pr-2">Script</th>
                <th className="text-left">Summary</th>
              </tr></thead>
              <tbody>
                {(data?.events ?? []).map(e => (
                  <tr key={e.id} className="border-t border-zinc-900">
                    <td className="py-1 pr-2 font-mono text-zinc-500">{new Date(e.created_at).toISOString().slice(11, 19)}</td>
                    <td className="pr-2 text-zinc-400">{e.agent_name ?? '—'}</td>
                    <td className="pr-2 text-zinc-300">{e.kind}</td>
                    <td className="pr-2 text-zinc-500">{e.script ?? '—'}</td>
                    <td className="text-zinc-400">{(e.summary ?? '').slice(0, 120)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* Recent errors */}
        <details className="rounded-lg border border-zinc-800">
          <summary className="cursor-pointer p-3 text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Recent Errors from Railway Logs (24h) ▸ {(data?.errors ?? []).length}
          </summary>
          <div className="px-3 pb-3 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-500"><tr>
                <th className="text-left py-1 pr-2">Time</th>
                <th className="text-left pr-2">Source</th>
                <th className="text-left pr-2">Script</th>
                <th className="text-left pr-2">Level</th>
                <th className="text-left">Line</th>
              </tr></thead>
              <tbody>
                {(data?.errors ?? []).map(e => (
                  <tr key={e.id} className="border-t border-zinc-900">
                    <td className="py-1 pr-2 font-mono text-zinc-500">{new Date(e.created_at).toISOString().slice(11, 19)}</td>
                    <td className="pr-2 text-zinc-400">{e.source ?? '—'}</td>
                    <td className="pr-2 text-zinc-500">{e.script ?? '—'}</td>
                    <td className="pr-2 text-red-400">{e.level}</td>
                    <td className="text-zinc-400 font-mono truncate max-w-md">{(e.line ?? '').slice(0, 160)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  )
}
