import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const since24h = new Date(Date.now() - 86400 * 1000).toISOString()
  const since7d  = new Date(Date.now() - 7 * 86400 * 1000).toISOString()

  const [events24h, recentEvents, logErrors, cursors] = await Promise.all([
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
  ])

  const [pulseHaikuFresh, pulseHaikuCached, crmHaikuFresh, sonnetAll] = events24h

  return NextResponse.json({
    usage: {
      pulse: { haiku_fresh: pulseHaikuFresh.count ?? 0, haiku_cached: pulseHaikuCached.count ?? 0 },
      crm:   { haiku_fresh: crmHaikuFresh.count ?? 0 },
      sonnet_total: sonnetAll.count ?? 0,
    },
    events: recentEvents.data ?? [],
    errors: logErrors.data ?? [],
    cursors: cursors.data ?? [],
    as_of: new Date().toISOString(),
  })
}
