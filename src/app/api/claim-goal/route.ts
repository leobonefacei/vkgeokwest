import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';

const DAILY_GOAL = 8;
const DAILY_REWARD = 15;
const WEEKLY_GOAL = 40;
const WEEKLY_REWARD = 40;

function getMskDay(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}
function getMskWeek(): string {
  const d = new Date();
  const msk = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const jan1 = new Date(msk.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((msk.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${msk.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * POST /api/claim-goal
 * Body: { type: "daily" | "weekly" }
 * 
 * Server verifies visit counts from user_stats before awarding reward.
 */
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = auth.vk_user_id;

  // Rate limit: max 5 claims per minute
  const rl = checkRateLimit(vkId, 'claim-goal', 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await req.json();
  const { type } = body;

  if (type !== 'daily' && type !== 'weekly') {
    return NextResponse.json({ error: 'type must be "daily" or "weekly"' }, { status: 400 });
  }

  // Get current user_stats from DB (source of truth)
  const { data: stats } = await supabaseAdmin
    .from('user_stats')
    .select('*')
    .eq('user_id', vkId)
    .single();

  if (!stats) {
    return NextResponse.json({ success: false, message: 'Нет данных пользователя' });
  }

  const currentMskDay = getMskDay();
  const currentMskWeek = getMskWeek();

  if (type === 'daily') {
    // Check if already claimed (and not reset yet)
    if (stats.daily_claimed && stats.last_daily_reset === currentMskDay) {
      return NextResponse.json({ success: false, message: 'Награда уже получена сегодня' });
    }

    // Verify actual visit count — use visits_today from DB
    const visitsToday = stats.last_daily_reset === currentMskDay ? (stats.visits_today || 0) : 0;
    if (visitsToday < DAILY_GOAL) {
      return NextResponse.json({ success: false, message: `Выполнено ${visitsToday}/${DAILY_GOAL} посещений` });
    }

    // Award
    const { error } = await supabaseAdmin
      .from('user_stats')
      .update({
        balance: (stats.balance || 0) + DAILY_REWARD,
        mined_balance: (stats.mined_balance || 0) + DAILY_REWARD,
        daily_claimed: true,
        last_daily_reset: currentMskDay,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', vkId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      auditLog(vkId, 'claim_daily', { visits: visitsToday, reward: DAILY_REWARD });
      return NextResponse.json({ success: true, message: 'Дневная цель выполнена!', coins: DAILY_REWARD });
  } else {
    // Weekly
    if (stats.weekly_claimed && stats.last_weekly_reset === currentMskWeek) {
      return NextResponse.json({ success: false, message: 'Награда уже получена на этой неделе' });
    }

    const visitsThisWeek = stats.last_weekly_reset === currentMskWeek ? (stats.visits_this_week || 0) : 0;
    if (visitsThisWeek < WEEKLY_GOAL) {
      return NextResponse.json({ success: false, message: `Выполнено ${visitsThisWeek}/${WEEKLY_GOAL} посещений` });
    }

    const { error } = await supabaseAdmin
      .from('user_stats')
      .update({
        balance: (stats.balance || 0) + WEEKLY_REWARD,
        mined_balance: (stats.mined_balance || 0) + WEEKLY_REWARD,
        weekly_claimed: true,
        last_weekly_reset: currentMskWeek,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', vkId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      auditLog(vkId, 'claim_weekly', { visits: visitsThisWeek, reward: WEEKLY_REWARD });
      return NextResponse.json({ success: true, message: 'Недельная цель выполнена!', coins: WEEKLY_REWARD });
  }
}
