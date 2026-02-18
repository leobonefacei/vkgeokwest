import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const vkId = auth.vk_user_id;

  // Get place details
  const { data: place, error: placeError } = await supabaseAdmin
    .from('knowledge_places')
    .select('*')
    .eq('id', id)
    .single();

  if (placeError || !place) {
    return NextResponse.json({ error: 'Place not found' }, { status: 404 });
  }

  // Get total visit count
  const { count: totalVisits } = await supabaseAdmin
    .from('user_visits')
    .select('*', { count: 'exact', head: true })
    .eq('place_id', id);

  // Check if current user has visited this place
  const { data: userVisit } = await supabaseAdmin
    .from('user_visits')
    .select('timestamp')
    .eq('place_id', id)
    .eq('user_id', vkId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const userHasVisited = !!userVisit;

  // Get recent visitors (last 5)
  const { data: recentVisits } = await supabaseAdmin
    .from('user_visits')
    .select(`
      timestamp,
      user_id,
      profiles (
        vk_id,
        first_name,
        last_name,
        photo_200
      )
    `)
    .eq('place_id', id)
    .order('timestamp', { ascending: false })
    .limit(5);

  const recentVisitors = recentVisits?.map(v => ({
    vk_id: v.profiles?.vk_id,
    first_name: v.profiles?.first_name,
    last_name: v.profiles?.last_name,
    photo_200: v.profiles?.photo_200,
    visited_at: v.timestamp
  })) || [];

  return NextResponse.json({
    place,
    totalVisits: totalVisits || 0,
    userHasVisited,
    recentVisitors
  });
}
