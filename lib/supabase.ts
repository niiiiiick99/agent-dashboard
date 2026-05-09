import { createClient } from '@supabase/supabase-js'

const url  = process.env.SUPABASE_URL!
const key  = process.env.SUPABASE_SERVICE_KEY!

// Server-only client (service key — never expose to browser)
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
})
