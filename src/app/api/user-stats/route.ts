import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { auditLog } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // User can only read their own stats
  const vkId = auth.vk_user_id;

  const { data, error } = await supabaseAdmin
    .from('user_stats')
    .select('*')
    .eq('user_id', vkId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || null });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const vkId = auth.vk_user_id;

  // SECURITY: Only allow non-balance fields to be set directly.
  // Balance/mined_balance can ONLY be changed by /api/checkin and /api/claim-goal.
  const ALLOWED_FIELDS = new Set([
    'daily_claimed',
    'weekly_claimed',
    'last_daily_reset',
    'last_weekly_reset',
    'visits_today',
    'visits_this_week',
    'weekly_days',
    'last_check_in',
    'category_cooldowns',
  ]);

  const payload: Record<string, any> = {};
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) {
      payload[key] = body[key];
    }
  }

  payload.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('user_stats')
    .upsert({ user_id: vkId, ...payload }, { onConflict: 'user_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  auditLog(vkId, 'user_stats_update', { fields: Object.keys(payload) });
  return NextResponse.json({ success: true });
}
