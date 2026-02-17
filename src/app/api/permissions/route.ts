import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // User can only query their own permissions
  const vkId = auth.vk_user_id;

  const { data, error } = await supabaseAdmin
    .from('users_permissions')
    .select('geo_permission_granted, notifications_enabled')
    .eq('vk_id', vkId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    geo_permission_granted: data?.geo_permission_granted || false,
    notifications_enabled: data?.notifications_enabled || false,
  });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const body = await req.json();
  const { geo_permission_granted, notifications_enabled } = body;

  // Force vk_id to the verified user
  const vkId = auth.vk_user_id;

  const payload: Record<string, unknown> = { vk_id: vkId, updated_at: new Date().toISOString() };
  if (geo_permission_granted !== undefined) payload.geo_permission_granted = geo_permission_granted;
  if (notifications_enabled !== undefined) payload.notifications_enabled = notifications_enabled;

  const { error } = await supabaseAdmin.from('users_permissions').upsert(payload);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
