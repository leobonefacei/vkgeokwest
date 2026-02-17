import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Ranking is public data for authenticated users
  const { data, error } = await supabaseAdmin
    .from('user_stats')
    .select(`
      user_id,
      mined_balance,
      profiles (
        first_name,
        last_name,
        photo_200
      )
    `)
    .order('mined_balance', { ascending: false })
    .order('user_id', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
