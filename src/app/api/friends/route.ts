import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const action = req.nextUrl.searchParams.get('action');
  // For friends queries, use verified user's ID, not the query param
  const vkId = auth.vk_user_id;

  if (action === 'following') {
    const { data: followData, error: followError } = await supabaseAdmin
      .from('follows')
      .select('following_id, is_blocked')
      .eq('follower_id', vkId);

    if (followError || !followData) return NextResponse.json({ data: [] });

    const followingIds = followData.map(f => f.following_id);
    if (followingIds.length === 0) return NextResponse.json({ data: [] });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('vk_id', followingIds);

    if (!profiles) return NextResponse.json({ data: [] });

    const result = profiles.map(profile => {
      const followInfo = followData.find(f => f.following_id === profile.vk_id);
      const isBlockedByThem = followInfo?.is_blocked;

      if (profile.is_private || isBlockedByThem) {
        return {
          ...profile,
          last_lat: undefined,
          last_lon: undefined,
          last_category: undefined,
          last_location_name: undefined,
          last_mined_at: undefined,
          is_private: profile.is_private,
          is_blocked_by_them: isBlockedByThem,
        };
      }
      return profile;
    });

    return NextResponse.json({ data: result });
  }

  if (action === 'followers') {
    const { data: followData, error: followError } = await supabaseAdmin
      .from('follows')
      .select('follower_id, is_blocked')
      .eq('following_id', vkId);

    if (followError || !followData) return NextResponse.json({ data: [] });

    const followerIds = followData.map(f => f.follower_id);
    if (followerIds.length === 0) return NextResponse.json({ data: [] });

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .in('vk_id', followerIds);

    if (!profiles) return NextResponse.json({ data: [] });

    const result = profiles.map(profile => {
      const followInfo = followData.find(f => f.follower_id === profile.vk_id);
      return { ...profile, is_blocked: followInfo?.is_blocked };
    });

    return NextResponse.json({ data: result });
  }

  if (action === 'history') {
    // Allow viewing other user's history (for friend profile), but respect privacy
    const targetVkId = req.nextUrl.searchParams.get('vk_id');
    if (!targetVkId) return NextResponse.json({ error: 'vk_id required' }, { status: 400 });
    const limit = Number(req.nextUrl.searchParams.get('limit')) || 3;

    // Check privacy
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_private')
      .eq('vk_id', Number(targetVkId))
      .single();

    if (profile?.is_private) return NextResponse.json({ data: [] });

    const { data, error } = await supabaseAdmin
      .from('user_visits')
      .select('*')
      .eq('user_id', Number(targetVkId))
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { action } = body;
  const vkId = auth.vk_user_id;

  if (action === 'follow') {
    const { following_id } = body;
    // Follower is always the verified user
    const { error } = await supabaseAdmin.from('follows').upsert(
      { follower_id: vkId, following_id, is_blocked: false },
      { onConflict: 'follower_id,following_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'unfollow') {
    const { following_id } = body;
    const { error } = await supabaseAdmin
      .from('follows')
      .delete()
      .eq('follower_id', vkId)
      .eq('following_id', following_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_block') {
    const { follower_id, is_blocked } = body;
    // User can only block/unblock on their own "following_id" row
    const { error } = await supabaseAdmin
      .from('follows')
      .update({ is_blocked })
      .eq('following_id', vkId)
      .eq('follower_id', follower_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
