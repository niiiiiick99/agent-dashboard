import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// "Active" window: an agent is considered actively working if it has written
// any agent_events row in the last ACTIVE_WINDOW_SEC seconds. Tuned to 90s
// because the agents' cron cycles are 30 min apart — a row within the last
// 90s implies a live drive or an in-flight Telegram chat call. Bumping this
// causes more agents to read "active" between cycles.
const ACTIVE_WINDOW_SEC = 90

export async function GET() {
  const since24h = new Date(Date.now() - 86400 * 1000).toISOString()
  const sinceActive = new Date(Date.now() - ACTIVE_WINDOW_SEC * 1000).toISOString()

  const [events24h, recentEvents, logErrors, cursors, activeAgents] = await Promise.all([
    // Claude usage counts (24h) — 4 count queries
    Promise.all([
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
        .in('kind', ['fix_proposed','fix_error','fix_applied']).gte('created_at', since24h),
    ]),
    // Recent events feed
    supabase.from('agent_events').select('id,created_at,agent_name,kind,script,summary')
      .gte('created_at', since24h).neq('kind', 'observation')
      .order('created_at', { ascending: false }).limit(50),
    // Recent errors from log_entries
    supabase.from('log_entries').select('id,created_at,source,script,level,line')
      .in('level', ['error','traceback']).gte('created_at', since24h)
      .order('created_at', { ascending: false }).limit(30),
    // Log shipper cursors (last-seen timestamps per service)
    supabase.from('railway_log_cursors').select('service_id,updated_at').order('updated_at', { ascending: false }),
    // Per-agent "active right now?" — any event in the last ACTIVE_WINDOW_SEC
    supabase.from('agent_events').select('agent_name')
      .gte('created_at', sinceActive).not('agent_name', 'is', null).limit(200),
  ])

  const [pulseHaikuFresh, pulseHaikuCached, crmHaikuFresh, sonnetAll] = events24h

  // Build a set of agent_names with recent activity
  const active = new Set<string>()
  for (const row of activeAgents.data ?? []) {
    if (row.agent_name) active.add(row.agent_name as string)
  }

  return NextResponse.json({
    usage: {
      pulse: { haiku_fresh: pulseHaikuFresh.count ?? 0, haiku_cached: pulseHaikuCached.count ?? 0 },
      crm:   { haiku_fresh: crmHaikuFresh.count ?? 0 },
      sonnet_total: sonnetAll.count ?? 0,
    },
    events: recentEvents.data ?? [],
    errors: logErrors.data ?? [],
    cursors: cursors.data ?? [],
    // Active-state map: { pulse: true/false, crm: ..., manager: ..., optimizer: ... }
    // Consumed by the hierarchy chart to neon-orange agent cards in real time.
    active: {
      pulse:     active.has('pulse'),
      crm:       active.has('crm'),
      manager:   active.has('manager'),
      optimizer: active.has('optimizer'),
    },
    active_window_sec: ACTIVE_WINDOW_SEC,
    as_of: new Date().toISOString(),
  })
}
