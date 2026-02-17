import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';

const CHECKIN_RADIUS_M = 200;
const COOLDOWN_MS = 3600_000; // 1 hour general cooldown
const CATEGORY_COOLDOWN_MS = 7200_000; // 2 hours per category
const MAX_VISITS_PER_DAY = 8;
const COINS_PER_CHECKIN = 2;
const COINS_PER_CATEGORY_CHECKIN = 5;

// Moscow timezone helpers
function getMskDay(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}
function getMskWeek(): string {
  const d = new Date();
  const msk = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const jan1 = new Date(msk.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((msk.getTime() - jan1.getTime()) / 86400000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `${msk.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchPlaceFromOSM(osmId: string): Promise<any> {
  // osmId format: "osm-12345"
  const cleanId = osmId.replace('osm-', '');
  const query = `[out:json];
    (
      node(${cleanId});
      way(${cleanId});
      relation(${cleanId});
    );
    out center;`;
  
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: query
  });
  
  if (!res.ok) return null;
  const data = await res.json();
  const el = data.elements?.[0];
  if (!el) return null;

  const tags = el.tags || {};
  let category = 'Школа';
  if (tags.amenity === 'library') category = 'Библиотека';
  else if (tags.tourism === 'museum' || tags.tourism === 'gallery') category = 'Музей';
  else if (tags.amenity === 'university' || tags.amenity === 'college') category = 'Вуз';
  else if (tags.historic === 'monument' || tags.historic === 'memorial' || tags.tourism === 'artwork') category = 'Памятник';

  return {
    osm_id: osmId,
    name: tags.name || tags['name:ru'] || category,
    category,
    lat: el.lat || el.center?.lat,
    lon: el.lon || el.center?.lon,
    description: tags['addr:street'] ? `${tags['addr:street']}, ${tags['addr:housenumber'] || ''}` : null
  };
}

/**
 * POST /api/checkin
 * 
 * Body: { lat: number, lon: number, category?: string, osm_id?: string }
 * 
 * If category is provided, does a category-based checkin (5 coins).
 * Otherwise, does a general checkin (2 coins).
 * 
 * All validation (distance, cooldown, balance) is server-side.
 */
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = auth.vk_user_id;

  // Rate limit: max 10 checkins per minute
  const rl = checkRateLimit(vkId, 'checkin', 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { lat, lon, category, osm_id } = body;

  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  // Get or create user_stats
  let { data: stats } = await supabaseAdmin
    .from('user_stats')
    .select('*')
    .eq('user_id', vkId)
    .single();

  const currentMskDay = getMskDay();
  const currentMskWeek = getMskWeek();

  if (!stats) {
    // Create initial stats
    const initial = {
      user_id: vkId,
      balance: 0,
      mined_balance: 0,
      visits_today: 0,
      visits_this_week: 0,
      weekly_days: 0,
      last_check_in: null,
      category_cooldowns: {},
      daily_claimed: false,
      weekly_claimed: false,
      last_daily_reset: currentMskDay,
      last_weekly_reset: currentMskWeek,
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from('user_stats').insert(initial);
    stats = initial as any;
  }

  // Auto-reset daily/weekly counters
  let visitsToday = stats.visits_today || 0;
  let visitsThisWeek = stats.visits_this_week || 0;
  let weeklyDays = stats.weekly_days || 0;
  let dailyClaimed = stats.daily_claimed || false;
  let weeklyClaimed = stats.weekly_claimed || false;

  if (stats.last_daily_reset !== currentMskDay) {
    visitsToday = 0;
    dailyClaimed = false;
  }
  if (stats.last_weekly_reset !== currentMskWeek) {
    visitsThisWeek = 0;
    weeklyDays = 0;
    weeklyClaimed = false;
  }

  // Daily limit
  if (visitsToday >= MAX_VISITS_PER_DAY) {
    return NextResponse.json({ success: false, message: 'Превышено количество геомайнинга в сутки' });
  }

  const now = Date.now();
  const categoryCooldowns: Record<string, number> = stats.category_cooldowns || {};

  if (category) {
    // Category checkin — check category cooldown
    const lastCatVisit = categoryCooldowns[category] || 0;
    if (now - lastCatVisit < CATEGORY_COOLDOWN_MS) {
      const remaining = Math.ceil((CATEGORY_COOLDOWN_MS - (now - lastCatVisit)) / 60_000);
      return NextResponse.json({ success: false, message: `Посетить ${category} можно через ${remaining} мин.` });
    }
  } else {
    // General checkin — check general cooldown
    const lastCheckIn = stats.last_check_in ? new Date(stats.last_check_in).getTime() : 0;
    if (now - lastCheckIn < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastCheckIn)) / 60_000);
      return NextResponse.json({ success: false, message: `С последнего геомайнинга прошло менее 1 часа. Подождите ${remaining} мин.` });
    }
  }

  let targetPlace: any = null;

  if (osm_id) {
    // 1. Try to find by osm_id in DB
    const { data: existingPlace } = await supabaseAdmin
      .from('knowledge_places')
      .select('*')
      .eq('osm_id', osm_id)
      .single();
    
    if (existingPlace) {
      targetPlace = existingPlace;
    } else {
      // 2. Fetch from OSM and verify
      const osmPlace = await fetchPlaceFromOSM(osm_id);
      if (osmPlace) {
        // Save to DB so it becomes trusted
        const { data: savedPlace, error: saveError } = await supabaseAdmin
          .from('knowledge_places')
          .insert(osmPlace)
          .select()
          .single();
        
        if (!saveError && savedPlace) {
          targetPlace = savedPlace;
        }
      }
    }
  }

  if (!targetPlace) {
    // Fallback: search by proximity (original logic)
    const searchRadiusM = 500;
    const { data: nearbyPlaces } = await supabaseAdmin
      .from('knowledge_places')
      .select('*')
      .gte('lat', lat - 0.005)
      .lte('lat', lat + 0.005)
      .gte('lon', lon - 0.005)
      .lte('lon', lon + 0.005);

    if (nearbyPlaces && nearbyPlaces.length > 0) {
      const categoryMapping: Record<string, string[]> = {
        'Образовательные учреждения': ['Школа', 'Вуз', 'Колледж'],
        'Библиотека': ['Библиотека'],
        'Музей': ['Музей'],
        'Памятник': ['Памятник', 'Монумент'],
      };
      const categoriesToCheck = category ? (categoryMapping[category] || [category]) : undefined;

      let nearest: { place: any; distance: number } | null = null;
      for (const place of nearbyPlaces) {
        if (categoriesToCheck && !categoriesToCheck.includes(place.category)) continue;
        const dist = haversineDistance(lat, lon, place.lat, place.lon);
        if (dist <= searchRadiusM && (!nearest || dist < nearest.distance)) {
          nearest = { place, distance: dist };
        }
      }
      if (nearest) targetPlace = nearest.place;
    }
  }

  if (!targetPlace) {
    return NextResponse.json({ success: false, message: 'Место знаний не найдено или не подтверждено.' });
  }

  // Distance check using TRUSTED coordinates
  const distance = haversineDistance(lat, lon, targetPlace.lat, targetPlace.lon);

  if (distance > CHECKIN_RADIUS_M) {
    return NextResponse.json({ success: false, message: 'Вы слишком далеко от места знаний. Подойдите ближе.' });
  }

  // Check category match if requested
  if (category) {
    const categoryMapping: Record<string, string[]> = {
      'Образовательные учреждения': ['Школа', 'Вуз', 'Колледж'],
      'Библиотека': ['Библиотека'],
      'Музей': ['Музей'],
      'Памятник': ['Памятник', 'Монумент'],
    };
    const validCategories = categoryMapping[category] || [category];
    if (!validCategories.includes(targetPlace.category)) {
      return NextResponse.json({ success: false, message: `Это место не относится к категории "${category}"` });
    }
  }

  // Everything validated! Compute reward and update atomically
  const coinsEarned = category ? COINS_PER_CATEGORY_CHECKIN : COINS_PER_CHECKIN;
  const newBalance = (stats.balance || 0) + coinsEarned;
  const newMinedBalance = (stats.mined_balance || 0) + coinsEarned;
  const newVisitsToday = visitsToday + 1;
  const newVisitsThisWeek = visitsThisWeek + 1;
  const newWeeklyDays = visitsToday === 0 ? weeklyDays + 1 : weeklyDays;

  const updatedCooldowns = { ...categoryCooldowns };
  if (category) {
    updatedCooldowns[category] = now;
  }

  const nowIso = new Date().toISOString();

  // Atomically update user_stats
  const { error: statsError } = await supabaseAdmin
    .from('user_stats')
    .update({
      balance: newBalance,
      mined_balance: newMinedBalance,
      visits_today: newVisitsToday,
      visits_this_week: newVisitsThisWeek,
      weekly_days: newWeeklyDays,
      last_check_in: nowIso,
      category_cooldowns: updatedCooldowns,
      daily_claimed: dailyClaimed,
      weekly_claimed: weeklyClaimed,
      last_daily_reset: currentMskDay,
      last_weekly_reset: currentMskWeek,
      updated_at: nowIso,
    })
    .eq('user_id', vkId);

  if (statsError) {
    return NextResponse.json({ error: statsError.message }, { status: 500 });
  }

    // Insert visit record
    await supabaseAdmin.from('user_visits').insert({
      user_id: vkId,
      place_id: targetPlace.id,
      location_name: targetPlace.name,
      category: targetPlace.category,
      coins_earned: coinsEarned,
      timestamp: nowIso,
      lat: targetPlace.lat,
      lon: targetPlace.lon,
    });

    auditLog(vkId, 'checkin', {
      place_id: targetPlace.id,
      place_name: targetPlace.name,
      category: targetPlace.category,
      coins: coinsEarned,
      distance_m: Math.round(distance),
      balance_after: newMinedBalance,
    });

  return NextResponse.json({
    success: true,
    message: `Вы посетили "${targetPlace.name}"`,
    coins: coinsEarned,
    balance: newMinedBalance,
    visit: {
      locationId: targetPlace.id,
      locationName: targetPlace.name,
      category: targetPlace.category,
      timestamp: Date.now(),
      coinsEarned,
      lat: targetPlace.lat,
      lon: targetPlace.lon,
    },
    stats: {
      visitsToday: newVisitsToday,
      visitsThisWeek: newVisitsThisWeek,
      weeklyDays: newWeeklyDays,
      categoryCooldowns: updatedCooldowns,
    },
  });
}
