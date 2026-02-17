import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

const ADMIN_VK_IDS = new Set([35645976]);

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Reading places is allowed for any authenticated user (public data)
  const { data, error } = await supabaseAdmin
    .from('knowledge_places')
    .select('*');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Only admins can write places
  if (!ADMIN_VK_IDS.has(auth.vk_user_id)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { places } = body;
  if (!places || !Array.isArray(places)) {
    return NextResponse.json({ error: 'places array required' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('knowledge_places')
    .upsert(places, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
