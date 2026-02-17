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
      .select(`
        *,
        user_stats (
          mined_balance
        )
      `)
      .in('vk_id', followingIds);

    if (!profiles) return NextResponse.json({ data: [] });

    const result = profiles.map((profile: any) => {
      const followInfo = followData.find(f => f.following_id === profile.vk_id);
      const isBlockedByThem = followInfo?.is_blocked;
      
      // Handle potential array or object return for joined table
      const stats = Array.isArray(profile.user_stats) ? profile.user_stats[0] : profile.user_stats;
      const points = stats?.mined_balance || 0;

      if (profile.is_private || isBlockedByThem) {
        return {
          vk_id: profile.vk_id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_200: profile.photo_200,
          points,
          is_private: true,
          is_blocked_by_them: isBlockedByThem,
          // Sensitive data hidden
          last_lat: null,
          last_lon: null,
          last_category: null,
          last_location_name: null,
          last_mined_at: null,
        };
      }
      return {
        ...profile,
        points,
        is_private: false,
        is_blocked_by_them: isBlockedByThem,
      };
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

  try {
    const body = await req.json();
    const { action } = body;
    const vkId = auth.vk_user_id;

    console.log('[api/friends] POST action:', action, 'user:', vkId, 'body:', body);

    if (action === 'follow') {
      const { following_id } = body;
      if (!following_id) return NextResponse.json({ error: 'following_id required' }, { status: 400 });
      
      const { error } = await supabaseAdmin.from('follows').upsert(
        { follower_id: vkId, following_id, is_blocked: false },
        { onConflict: 'follower_id,following_id' }
      );
      if (error) {
        console.error('[api/friends] follow error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'unfollow') {
      const { following_id } = body;
      if (!following_id) return NextResponse.json({ error: 'following_id required' }, { status: 400 });

      const { error } = await supabaseAdmin
        .from('follows')
        .delete()
        .eq('follower_id', vkId)
        .eq('following_id', following_id);
      if (error) {
        console.error('[api/friends] unfollow error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'toggle_block') {
      const { follower_id, is_blocked } = body;
      if (!follower_id) return NextResponse.json({ error: 'follower_id required' }, { status: 400 });

      const { error } = await supabaseAdmin
        .from('follows')
        .update({ is_blocked })
        .eq('following_id', vkId)
        .eq('follower_id', follower_id);
      if (error) {
        console.error('[api/friends] toggle_block error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[api/friends] critical error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
