import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const currentUserId = auth.vk_user_id;

  // Ranking is public for authenticated users, but private profiles are masked
  const { data, error } = await supabaseAdmin
    .from('user_stats')
    .select(`
      user_id,
      mined_balance,
      profiles (
        first_name,
        last_name,
        photo_200,
        is_private
      )
    `)
    .order('mined_balance', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranking = (data || []).map((row: any) => {
    const isPrivate = row.profiles?.is_private;
    
    return {
      id: row.user_id,
      name: isPrivate ? 'Приватный профиль' : (row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name?.[0]}.` : `ID: ${row.user_id}`),
      avatar: isPrivate ? null : row.profiles?.photo_200,
      points: row.mined_balance || 0,
      isMe: row.user_id === currentUserId
    };
  });

  return NextResponse.json({ data: ranking });
}
