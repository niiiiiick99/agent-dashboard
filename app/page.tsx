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

      {/* System Topology */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">System Topology</h2>
        <div className="space-y-3">

          {/* Row 1: Machines */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Mac Mini */}
            <TopoCard title="Mac Mini" subtitle="Nick's main workstation" color="zinc" dot="green">
              <TopoItem label="Claude Code CLI" note="runs sessions here" />
              <TopoItem label="Watchdog" note="NOT here — on backup MBA" dim />
            </TopoCard>

            {/* Backup MacBook Air */}
            <TopoCard title="Backup MacBook Air" subtitle="10.1.10.108 · watchdog host" color="zinc" dot="green">
              <TopoItem label="vps_watchdog.sh" note="launchd · every 5 min" />
              <TopoItem label="Checks" note="SSH · systemd · Supabase heartbeat" />
              <TopoItem label="Alerts via" note="Telegram → you" />
            </TopoCard>

            {/* VPS */}
            <TopoCard title="VPS · Hetzner" subtitle="178.104.245.76 · Ubuntu" color="violet" dot="green">
              <TopoItem label="pulse-agent" note="systemd · port —" />
              <TopoItem label="crm-agent" note="systemd · port —" />
              <TopoItem label="crm-cloudflared" note="Cloudflare quick-tunnel" />
            </TopoCard>
          </div>

          {/* Row 2: Agents detail */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

            {/* Pulse Agent */}
            <TopoCard title="pulse-agent" subtitle="Monitors Sorcerer / Amazon FBA" color="purple" dot="green">
              <TopoItem label="Cycle" note="30 min · classify errors · send alerts" />
              <TopoItem label="Railway log shipper" note="every 5 min → Supabase log_entries" />
              <TopoItem label="Haiku classifier" note="triage error/traceback lines" />
              <TopoItem label="Sonnet fixer" note="auto-fix + PR when on allowlist" />
              <TopoItem label="Knowledge refresh" note="nightly · Voyage AI embeddings" />
              <TopoItem label="Morning digest" note="9am ET → Telegram + email" />
              <TopoItem label="Watches" note="run_pipeline · run_fast_sync · reprice_ebay · +" />
            </TopoCard>

            {/* CRM Agent */}
            <TopoCard title="crm-agent" subtitle="Monitors coaching-crm Next.js app" color="blue" dot="green">
              <TopoItem label="Cycle" note="30 min · classify errors · send alerts" />
              <TopoItem label="Haiku classifier" note="triage coaching-crm log errors" />
              <TopoItem label="Cloudflare tunnel" note="quick-tunnel → Telegram when URL rotates" />
              <TopoItem label="Morning digest" note="9am ET → Telegram + email" />
              <TopoItem label="Watches" note="cron-instagram · cron-whop · cron-gmail · coaching-crm" />
            </TopoCard>
          </div>

          {/* Row 3: Cloud services */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* Railway */}
            <TopoCard title="Railway" subtitle="Cloud compute" color="zinc" dot="green">
              <TopoItem label="sorcerer-jobs" note="run_pipeline · run_fast_sync · reprice_ebay · +" />
              <TopoItem label="coaching-crm" note="Next.js app · cron-instagram · cron-whop · cron-gmail" />
              <TopoItem label="agent-dashboard" note="this dashboard" />
            </TopoCard>

            {/* Supabase */}
            <TopoCard title="Supabase" subtitle="pxtbtajkjxiquvgmebul · shared DB" color="emerald" dot="green">
              <TopoItem label="agent_events" note="pulse + crm write here · dashboard reads" />
              <TopoItem label="log_entries" note="Railway logs shipped every 5 min" />
              <TopoItem label="railway_log_cursors" note="tracks per-service log offset" />
              <TopoItem label="knowledge_embeddings" note="Voyage AI 512-d vectors (pgvector)" />
            </TopoCard>

            {/* Notion */}
            <TopoCard title="Notion" subtitle="Knowledge + config source" color="zinc" dot="green">
              <TopoItem label="Role / Identity" note="agent system prompt (live edit)" />
              <TopoItem label="People" note="Telegram IDs + permissions" />
              <TopoItem label="Projects + Scripts" note="per-script context for fixer" />
              <TopoItem label="Knowledge + Common" note="embedded nightly via Voyage AI" />
              <TopoItem label="Resources" note="API inventory" />
            </TopoCard>
          </div>

          {/* Row 4: External APIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TopoCard title="Telegram" subtitle="Primary alerts" color="zinc" dot="green">
              <TopoItem label="Bot" note="both agents send here" />
              <TopoItem label="Chat" note="inbound commands to pulse" />
            </TopoCard>
            <TopoCard title="Resend" subtitle="Email fallback" color="zinc" dot="yellow">
              <TopoItem label="Alert fallback" note="fires if Telegram fails" />
              <TopoItem label="Digest CC" note="always also emails digest" />
              <TopoItem label="Key" note="set RESEND_API_KEY to activate" dim />
            </TopoCard>
            <TopoCard title="Sorcerer + eBay" subtitle="Amazon FBA ops" color="zinc" dot="green">
              <TopoItem label="run_pipeline" note="main sync job" />
              <TopoItem label="reprice_ebay" note="eBay repricing cron" />
              <TopoItem label="+" note="6 other Railway crons" />
            </TopoCard>
            <TopoCard title="Voyage AI" subtitle="Embeddings" color="zinc" dot="yellow">
              <TopoItem label="Model" note="voyage-3-lite · 512d" />
              <TopoItem label="Used by" note="knowledge_embeddings table" />
              <TopoItem label="Key" note="set VOYAGE_API_KEY to activate" dim />
            </TopoCard>
          </div>

        </div>
      </section>

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

const topoColors: Record<string, string> = {
  purple:  'border-purple-800 bg-purple-950/30',
  blue:    'border-blue-800 bg-blue-950/30',
  violet:  'border-violet-800 bg-violet-950/30',
  emerald: 'border-emerald-800 bg-emerald-950/30',
  zinc:    'border-zinc-800 bg-zinc-900/40',
}
const dotColors: Record<string, string> = {
  green:  'bg-green-500',
  yellow: 'bg-yellow-400',
  red:    'bg-red-500',
  gray:   'bg-zinc-500',
}

function TopoCard({ title, subtitle, color, dot, children }: {
  title: string; subtitle: string; color: string; dot?: string; children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${topoColors[color] ?? topoColors.zinc}`}>
      <div className="flex items-center gap-2 mb-2">
        {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[dot] ?? dotColors.gray}`} />}
        <span className="text-sm font-semibold text-white font-mono">{title}</span>
      </div>
      <p className="text-xs text-zinc-500 mb-2">{subtitle}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function TopoItem({ label, note, dim }: { label: string; note: string; dim?: boolean }) {
  return (
    <div className="flex gap-1.5 text-xs">
      <span className={`font-mono flex-shrink-0 ${dim ? 'text-zinc-600' : 'text-zinc-400'}`}>{label}</span>
      <span className={dim ? 'text-zinc-700' : 'text-zinc-500'}>— {note}</span>
    </div>
  )
}
