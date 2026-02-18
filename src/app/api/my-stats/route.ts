import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = auth.vk_user_id;

  // Get user's profile
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('vk_id', vkId)
    .single();

  // Get user's stats
  let { data: stats, error: statsError } = await supabaseAdmin
    .from('user_stats')
    .select('*')
    .eq('user_id', vkId)
    .single();

  if (statsError && statsError.code === 'PGRST116') {
    // Stats missing - create them
    console.log('[api/my-stats] Creating missing stats for:', vkId);
    const { data: newStats, error: createError } = await supabaseAdmin
      .from('user_stats')
      .insert({
        user_id: vkId,
        balance: 0,
        mined_balance: 0,
        visits_today: 0,
        visits_this_week: 0,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (!createError) stats = newStats;
  }

  // Get recent visits (last 20)
  const { data: visits } = await supabaseAdmin
    .from('user_visits')
    .select('*')
    .eq('user_id', vkId)
    .order('timestamp', { ascending: false })
    .limit(20);

  const now = new Date();
  const mskNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const currentMskDay = mskNow.toISOString().split('T')[0];
  const mskWeek = `${mskNow.getFullYear()}-W${String(Math.ceil((mskNow.getTime() - new Date(mskNow.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))).padStart(2, '0')}`;

  // Auto-reset counters if needed
  let visitsToday = stats?.visits_today || 0;
  let visitsThisWeek = stats?.visits_this_week || 0;
  let dailyClaimed = stats?.daily_claimed || false;
  let weeklyClaimed = stats?.weekly_claimed || false;

  if (stats?.last_daily_reset !== currentMskDay) {
    visitsToday = 0;
    dailyClaimed = false;
  }
  if (stats?.last_weekly_reset !== mskWeek) {
    visitsThisWeek = 0;
    weeklyClaimed = false;
  }

  return NextResponse.json({
    profile: profile || null,
    stats: {
      balance: stats?.balance || 0,
      minedBalance: stats?.mined_balance || 0,
      visitsToday,
      visitsThisWeek,
      weeklyDays: stats?.weekly_days || 0,
      lastCheckIn: stats?.last_check_in || null,
      categoryCooldowns: stats?.category_cooldowns || {},
      dailyClaimed,
      weeklyClaimed,
      lastDailyReset: currentMskDay,
      lastWeeklyReset: mskWeek,
    },
    visits: visits || []
  });
}
