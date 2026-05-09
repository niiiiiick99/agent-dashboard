import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ── helpers ─────────────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  const colors: Record<string, string> = {
    error:    'bg-red-900/60 text-red-300 border-red-700',
    traceback:'bg-red-900/60 text-red-300 border-red-700',
    warn:     'bg-yellow-900/60 text-yellow-300 border-yellow-700',
    info:     'bg-zinc-800 text-zinc-400 border-zinc-600',
    crm:      'bg-blue-900/60 text-blue-300 border-blue-700',
    pulse:    'bg-purple-900/60 text-purple-300 border-purple-700',
    alert_sent:          'bg-orange-900/60 text-orange-300 border-orange-700',
    fix_proposed:        'bg-teal-900/60 text-teal-300 border-teal-700',
    fix_applied:         'bg-green-900/60 text-green-300 border-green-700',
    fix_error:           'bg-red-900/60 text-red-300 border-red-700',
    diagnosis:           'bg-indigo-900/60 text-indigo-300 border-indigo-700',
    fix_skipped_not_allowlisted: 'bg-zinc-800 text-zinc-400 border-zinc-600',
  }
  const cls = colors[color] ?? 'bg-zinc-800 text-zinc-400 border-zinc-600'
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs border font-mono ${cls}`}>
      {text}
    </span>
  )
}

function reltime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function Dashboard() {
  const since24h = new Date(Date.now() - 86400 * 1000).toISOString()

  const [
    pulseHaikuFresh,
    pulseHaikuCached,
    crmHaikuFresh,
    sonnetAll,
    recentEvents,
    recentErrors,
  ] = await Promise.all([
    supabase.from('agent_events').select('id', { count: 'exact', head: true })
      .eq('kind', 'observation').is('agent_name', null).is('details->>_cached', null)
      .gte('created_at', since24h),
    supabase.from('agent_events').select('id', { count: 'exact', head: true })
      .eq('kind', 'observation').is('agent_name', null).eq('details->>_cached', 'true')
      .gte('created_at', since24h),
    supabase.from('agent_events').select('id', { count: 'exact', head: true })
      .eq('kind', 'observation').eq('agent_name', 'crm').is('details->>_cached', null)
      .gte('created_at', since24h),
    supabase.from('agent_events').select('id', { count: 'exact', head: true })
      .in('kind', ['fix_proposed','fix_error','fix_applied'])
      .gte('created_at', since24h),
    supabase.from('agent_events').select('id,created_at,agent_name,kind,script,summary')
      .gte('created_at', since24h).neq('kind', 'observation')
      .order('created_at', { ascending: false }).limit(60),
    supabase.from('log_entries').select('id,created_at,source,script,level,line')
      .in('level', ['error','traceback']).gte('created_at', since24h)
      .order('created_at', { ascending: false }).limit(20),
  ])

  const pHF = pulseHaikuFresh.count ?? 0
  const pHC = pulseHaikuCached.count ?? 0
  const cHF = crmHaikuFresh.count ?? 0
  const son = sonnetAll.count ?? 0
  const pTotal = pHF + pHC
  const pHitPct = pTotal ? Math.round(pHC / pTotal * 100) : 0

  const events = recentEvents.data ?? []
  const errors = recentErrors.data ?? []

  const alertCount    = events.filter(e => e.kind === 'alert_sent').length
  const fixCount      = events.filter(e => ['fix_proposed','fix_applied','fix_error'].includes(e.kind)).length
  const diagnosisCount = events.filter(e => e.kind === 'diagnosis').length

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Agent Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Pulse + CRM · last 24h · auto-refresh on load</p>
        </div>
        <div className="text-xs text-zinc-600 font-mono">{new Date().toUTCString()}</div>
      </div>

      {/* Claude usage cards */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Claude Usage (24h)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Pulse Haiku (fresh)" value={pHF} warn={pHF > 500} ceiling={500} />
          <StatCard label="Pulse cache hit rate" value={`${pHitPct}%`} />
          <StatCard label="CRM Haiku (fresh)" value={cHF} warn={cHF > 500} ceiling={500} />
          <StatCard label="Sonnet fixer sessions" value={son} warn={son > 5} ceiling={5} />
        </div>
      </section>

      {/* Activity summary */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Activity (24h)</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Alerts sent" value={alertCount} />
          <StatCard label="Fix actions" value={fixCount} />
          <StatCard label="Diagnoses" value={diagnosisCount} />
        </div>
      </section>

      {/* Recent events */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Event Feed (non-observation, last 24h)
        </h2>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-3 py-2 font-normal">When</th>
                <th className="text-left px-3 py-2 font-normal">Agent</th>
                <th className="text-left px-3 py-2 font-normal">Kind</th>
                <th className="text-left px-3 py-2 font-normal">Script</th>
                <th className="text-left px-3 py-2 font-normal">Summary</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={e.id} className={i % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                  <td className="px-3 py-1.5 text-zinc-500 whitespace-nowrap">{reltime(e.created_at)}</td>
                  <td className="px-3 py-1.5"><Badge text={e.agent_name ?? 'pulse'} color={e.agent_name ?? 'pulse'} /></td>
                  <td className="px-3 py-1.5"><Badge text={e.kind} color={e.kind} /></td>
                  <td className="px-3 py-1.5 text-zinc-400 font-mono">{e.script ?? '—'}</td>
                  <td className="px-3 py-1.5 text-zinc-300 max-w-xs truncate">{e.summary}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-zinc-600">No events in last 24h</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent errors from log_entries */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Recent Errors from Railway Logs (24h)
        </h2>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-3 py-2 font-normal">When</th>
                <th className="text-left px-3 py-2 font-normal">Level</th>
                <th className="text-left px-3 py-2 font-normal">Script</th>
                <th className="text-left px-3 py-2 font-normal">Line</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={e.id} className={i % 2 === 0 ? 'bg-zinc-900/30' : ''}>
                  <td className="px-3 py-1.5 text-zinc-500 whitespace-nowrap">{reltime(e.created_at)}</td>
                  <td className="px-3 py-1.5"><Badge text={e.level} color={e.level} /></td>
                  <td className="px-3 py-1.5 text-zinc-400 font-mono">{e.script ?? e.source ?? '—'}</td>
                  <td className="px-3 py-1.5 text-zinc-300 font-mono truncate max-w-sm" title={e.line}>
                    {e.line?.slice(0, 120)}
                  </td>
                </tr>
              ))}
              {errors.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-600">No errors in last 24h</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, warn, ceiling }: {
  label: string; value: string | number; warn?: boolean; ceiling?: number
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${warn ? 'border-red-700 bg-red-900/10' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-red-400' : 'text-white'}`}>{value}</p>
      {ceiling !== undefined && (
        <p className="text-xs text-zinc-600 mt-0.5">ceiling: {ceiling}</p>
      )}
    </div>
  )
}
