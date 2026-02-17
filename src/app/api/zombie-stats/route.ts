import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = auth.vk_user_id;

  const { data, error } = await supabaseAdmin
    .from('zombie_stats')
    .select('*')
    .eq('vk_id', vkId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    const newStats = {
      vk_id: vkId,
      total_deaths: 0,
      best_survival_time_seconds: 0,
      total_zombies_evaded: 0,
      total_resources_collected: 0,
      games_played: 0,
      zombies_educated: 0,
    };
    await supabaseAdmin.from('zombie_stats').insert(newStats);
    return NextResponse.json({ data: newStats });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/zombie-stats
 * 
 * Server-authoritative stat updates. The client sends an ACTION (what happened),
 * the server validates it against real game sessions and computes the new values.
 * 
 * Supported actions:
 *   { action: "record_death", survival_time_seconds: number }
 *   { action: "update_survival_time", survival_time_seconds: number }
 *   { action: "increment_zombies_evaded", count?: number }
 *   { action: "increment_resources_collected", count?: number }
 *   { action: "increment_zombies_educated", count?: number }
 *   { action: "ensure_exists" }  — create stats row if missing
 */
export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;

  const vkId = auth.vk_user_id;
  const body = await req.json();
  const { action } = body;

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  // Rate limit: max 30 zombie-stats actions per minute
  const rl = checkRateLimit(vkId, 'zombie-stats', 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  // Helper: get or create stats
  const getStats = async () => {
    const { data } = await supabaseAdmin!
      .from('zombie_stats')
      .select('*')
      .eq('vk_id', vkId)
      .single();

    if (data) return data;

    const newStats = {
      vk_id: vkId,
      total_deaths: 0,
      best_survival_time_seconds: 0,
      total_zombies_evaded: 0,
      total_resources_collected: 0,
      games_played: 0,
      zombies_educated: 0,
    };
    await supabaseAdmin!.from('zombie_stats').insert(newStats);
    return newStats;
  };

  // Helper: validate survival_time_seconds against real game sessions
  const validateSurvivalTime = async (claimedSeconds: number): Promise<number> => {
    // Get the most recent active or just-ended session for this user
    const { data: sessions } = await supabaseAdmin!
      .from('zombie_game_sessions')
      .select('started_at, first_move_at, ended_at, is_active, survival_time_seconds')
      .eq('vk_id', vkId)
      .order('started_at', { ascending: false })
      .limit(1);

    if (!sessions || sessions.length === 0) {
      return 0; // No sessions — can't claim any time
    }

    const session = sessions[0];
    const startTime = session.first_move_at || session.started_at;
    const endTime = session.is_active ? new Date().toISOString() : (session.ended_at || new Date().toISOString());
    
    // Maximum possible survival time = time from first move to now/end
    const maxPossibleSeconds = Math.floor(
      (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
    );

    // Allow a small tolerance (5 seconds) for network latency
    const validatedSeconds = Math.min(claimedSeconds, maxPossibleSeconds + 5);
    return Math.max(0, validatedSeconds);
  };

  try {
    const stats = await getStats();

    switch (action) {
      case 'ensure_exists': {
        return NextResponse.json({ success: true, data: stats });
      }

      case 'record_death': {
        const claimedTime = Number(body.survival_time_seconds) || 0;
        const validatedTime = await validateSurvivalTime(claimedTime);

        const { error } = await supabaseAdmin
          .from('zombie_stats')
          .upsert({
            vk_id: vkId,
            total_deaths: stats.total_deaths + 1,
            best_survival_time_seconds: Math.max(stats.best_survival_time_seconds, validatedTime),
            total_zombies_evaded: stats.total_zombies_evaded,
            total_resources_collected: stats.total_resources_collected,
            games_played: stats.games_played + 1,
            zombies_educated: stats.zombies_educated,
          }, { onConflict: 'vk_id' });

          if (error) return NextResponse.json({ error: error.message }, { status: 500 });
          auditLog(vkId, 'zombie_record_death', {
            claimed_time: claimedTime,
            validated_time: validatedTime,
            best_time: Math.max(stats.best_survival_time_seconds, validatedTime),
          });
          return NextResponse.json({ success: true });
        }

        case 'update_survival_time': {
          const claimedTime = Number(body.survival_time_seconds) || 0;
          const validatedTime = await validateSurvivalTime(claimedTime);

          if (validatedTime > stats.best_survival_time_seconds) {
            const { error } = await supabaseAdmin
              .from('zombie_stats')
              .update({ best_survival_time_seconds: validatedTime })
              .eq('vk_id', vkId);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            auditLog(vkId, 'zombie_new_best_time', { claimed: claimedTime, validated: validatedTime });
        }
        return NextResponse.json({ success: true });
      }

      case 'increment_zombies_evaded': {
        const count = Math.min(Math.max(1, Number(body.count) || 1), 100); // cap at 100 per call
        const { error } = await supabaseAdmin
          .from('zombie_stats')
          .update({ total_zombies_evaded: stats.total_zombies_evaded + count })
          .eq('vk_id', vkId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'increment_resources_collected': {
        const count = Math.min(Math.max(1, Number(body.count) || 1), 100);
        const { error } = await supabaseAdmin
          .from('zombie_stats')
          .update({ total_resources_collected: stats.total_resources_collected + count })
          .eq('vk_id', vkId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      case 'increment_zombies_educated': {
        const count = Math.min(Math.max(1, Number(body.count) || 1), 100);
        const { error } = await supabaseAdmin
          .from('zombie_stats')
          .update({ zombies_educated: (stats.zombies_educated || 0) + count })
          .eq('vk_id', vkId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
