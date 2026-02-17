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
    // User can only upsert their own profile
    const { first_name, last_name, photo_200 } = payload;
    const vkId = auth.vk_user_id;

    // SECURITY: Validate photo_200 — only VK CDN domains allowed
    const profileData: any = { vk_id: vkId, first_name, last_name };
    if (photo_200 && isAllowedPhotoUrl(photo_200)) {
      profileData.photo_200 = photo_200;
    }
    // If photo_200 is invalid/external, it's silently stripped — existing photo preserved

    const { error } = await supabaseAdmin.from('profiles').upsert(
      profileData,
      { onConflict: 'vk_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
