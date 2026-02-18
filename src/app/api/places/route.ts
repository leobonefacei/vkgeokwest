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

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  // Only admins can write/update places manually
  const ADMIN_VK_IDS = new Set([35645976]);
  if (!ADMIN_VK_IDS.has(auth.vk_user_id)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { places } = body;
  if (!places || !Array.isArray(places)) {
    return NextResponse.json({ error: 'places array required' }, { status: 400 });
  }

  // Process places - generate UUID if not provided
  const processedPlaces = places.map((p: any) => ({
    id: p.id || undefined,
    name: p.name,
    category: p.category,
    lat: p.lat,
    lon: p.lon,
    description: p.address || null,
    osm_id: p.osm_id || null,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('knowledge_places')
    .upsert(processedPlaces, { onConflict: 'id' });

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
