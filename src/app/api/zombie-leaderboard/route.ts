import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Leaderboard is public data for authenticated users
  const limit = Number(req.nextUrl.searchParams.get('limit')) || 10;
  const top3 = req.nextUrl.searchParams.get('top3') === 'true';

  if (top3) {
    const { data, error } = await supabaseAdmin
      .from('zombie_stats')
      .select(`
        vk_id,
        best_survival_time_seconds,
        profiles:vk_id (first_name, last_name, photo_200)
      `)
      .gt('best_survival_time_seconds', 0)
      .order('best_survival_time_seconds', { ascending: false })
      .limit(3);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = (data || []).map(item => ({
      vk_id: item.vk_id,
      best_survival_time_seconds: item.best_survival_time_seconds,
      first_name: (item.profiles as any)?.first_name || 'Игрок',
      last_name: (item.profiles as any)?.last_name || '',
      photo_200: (item.profiles as any)?.photo_200,
    }));

    return NextResponse.json({ data: result });
  }

  const { data, error } = await supabaseAdmin
    .from('zombie_stats')
    .select(`
      *,
      profiles:vk_id (first_name, last_name, photo_200)
    `)
    .order('best_survival_time_seconds', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map(item => ({
    ...item,
    first_name: (item.profiles as any)?.first_name,
    last_name: (item.profiles as any)?.last_name,
    photo_200: (item.profiles as any)?.photo_200,
  }));

  return NextResponse.json({ data: result });
}
