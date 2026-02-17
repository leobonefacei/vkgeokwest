import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // User can only read their own visits
  const vkId = auth.vk_user_id;

  const { data, error } = await supabaseAdmin
    .from('user_visits')
    .select('*')
    .eq('user_id', vkId)
    .order('timestamp', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { place_id, location_name, category, coins_earned, timestamp, lat, lon } = body;
  // Force user_id to verified user
  const vkId = auth.vk_user_id;

  const { error } = await supabaseAdmin.from('user_visits').insert({
    user_id: vkId,
    place_id,
    location_name,
    category,
    coins_earned,
    timestamp,
    lat,
    lon,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
