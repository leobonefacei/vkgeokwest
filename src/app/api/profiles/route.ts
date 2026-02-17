import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

// SECURITY: Allowed domains for photo_200 field (VK CDN only)
const ALLOWED_PHOTO_HOSTS = [
  'vk.com',
  '.userapi.com',
  '.vk-cdn.net',
  '.vk.com',
  '.vkontakte.ru',
  '.vk.me',
];

function isAllowedPhotoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_PHOTO_HOSTS.some(allowed =>
      host === allowed || host.endsWith(allowed)
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = req.nextUrl.searchParams.get('vk_id');
  if (!vkId) return NextResponse.json({ error: 'vk_id required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('vk_id', Number(vkId))
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
  const { action, ...payload } = body;

  if (action === 'upsert') {
    // User can upsert their own profile, or ensure a friend's profile exists
    const { vk_id: payloadVkId, first_name, last_name, photo_200 } = payload;
    const verifiedUserId = auth.vk_user_id;
    
    // Determine target ID: use payload ID if provided, otherwise the verified user
    const targetVkId = payloadVkId || verifiedUserId;
    const isSelf = targetVkId === verifiedUserId;

    console.log('[api/profiles] Upserting profile for:', targetVkId, 'isSelf:', isSelf);

    // SECURITY: Validate photo_200 — only VK CDN domains allowed
    const profileData: any = { 
      vk_id: targetVkId, 
      first_name: first_name || 'Пользователь', 
      last_name: last_name || '',
      updated_at: new Date().toISOString()
    };

    if (photo_200 && isAllowedPhotoUrl(photo_200)) {
      profileData.photo_200 = photo_200;
    }

    if (isSelf) {
      // User is updating themselves — allow upserting everything provided
      const { error } = await supabaseAdmin.from('profiles').upsert(
        profileData,
        { onConflict: 'vk_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      // User is ensuring a friend exists — only allow basic fields and don't touch is_private
      // We use a query to see if it exists first to be safe, or just use upsert with limited fields
      const { error } = await supabaseAdmin.from('profiles').upsert(
        profileData, // is_private is NOT here, so it won't be overwritten if it exists
        { onConflict: 'vk_id' }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  }

  if (action === 'update_last_mined') {
    // User can only update their own mining location
    const { last_lat, last_lon, last_category, last_location_name } = payload;
    const vkId = auth.vk_user_id;

    const { error } = await supabaseAdmin.from('profiles').update({
      last_lat, last_lon, last_category, last_location_name,
      last_mined_at: new Date().toISOString(),
    }).eq('vk_id', vkId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'toggle_privacy') {
    // User can only toggle their own privacy
    const { is_private } = payload;
    const vkId = auth.vk_user_id;

    const { error } = await supabaseAdmin.from('profiles').update({ is_private }).eq('vk_id', vkId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
