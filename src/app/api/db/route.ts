import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/audit-log';

// Admin VK IDs — these users can modify other users' data
const ADMIN_VK_IDS = new Set([35645976]);

// Tables that require user-scoping for writes (protected tables removed from API)
// These tables are now only accessible via dedicated endpoints:
//   - user_stats → /api/checkin, /api/claim-goal, /api/my-stats
//   - user_visits → /api/checkin, /api/my-stats
//   - profiles → /api/profiles
//   - users_permissions → /api/permissions
//   - follows → /api/friends
const USER_SCOPED_TABLES: Record<string, { idColumn: string }> = {
  zombie_entities: { idColumn: 'owner_vk_id' },
  zombie_world_objects: { idColumn: 'placed_by' },
  zombie_game_sessions: { idColumn: 'vk_id' },
};

// Tables allowed for read (select) by any authenticated user
// SECURITY: Sensitive tables (user_stats, user_visits, profiles) are removed
// Use dedicated endpoints instead: /api/ranking, /api/my-stats, /api/my-visits
const READ_ALLOWED_TABLES = new Set([
  'knowledge_places',
  'zombie_stats',
  'zombie_entities',
  'zombie_world_objects',
  'zombie_scenario_presets',
  'zombie_games',
  'zombie_inventory',
  'zombie_game_sessions',
]);

// Tables allowed for write operations by authenticated users
// SECURITY: 
//   - user_stats, user_visits, profiles, users_permissions, follows → protected, use dedicated endpoints
//   - zombie_stats → /api/zombie-stats (server-validated)
//   - knowledge_places → /api/places (admin-only writes)
const WRITE_ALLOWED_TABLES = new Set([
  'zombie_entities',
  'zombie_world_objects',
  'zombie_scenario_presets',
  'zombie_games',
  'zombie_inventory',
  'zombie_game_sessions',
]);

// Fields that are BLOCKED from client writes on zombie_game_sessions
// (these affect leaderboard and must be computed server-side)
const BLOCKED_SESSION_FIELDS = new Set([
  'survival_time_seconds',
]);

// SECURITY: Allowed domains for photo_200 field (VK CDN only)
const ALLOWED_PHOTO_HOSTS = [
  'vk.com',
  'userapi.com',
  'vk-cdn.net',
  'vkontakte.ru',
  'vk.me',
  'pp.vk.me',
  'vkmessenger.com',
  'sun1-',
  'sun9-',
];

function isAllowedPhotoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    
    return ALLOWED_PHOTO_HOSTS.some(allowed =>
      host === allowed || host.endsWith('.' + allowed) || host.startsWith(allowed)
    );
  } catch {
    return false;
  }
}

// Sanitize photo_200 in profiles writes — prevent IP harvesting via external URLs
function sanitizeProfileData(row: any): void {
  if (row && 'photo_200' in row) {
    if (!isAllowedPhotoUrl(row.photo_200)) {
      delete row.photo_200; // Strip invalid URL, don't overwrite existing valid photo
    }
  }
}

export async function POST(req: NextRequest) {
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  // 1. Authenticate
  const auth = authenticateRequest(req);
  if (isAuthError(auth)) return auth;
  const verifiedUserId = auth.vk_user_id;
  const isAdmin = ADMIN_VK_IDS.has(verifiedUserId);

  const body = await req.json();
  const { table, operation, data, filters, options } = body;

    if (!table || !operation) {
      return NextResponse.json({ error: 'table and operation required' }, { status: 400 });
    }

    // Rate limit write operations: 60 writes/min per user
    if (operation !== 'select') {
      const rl = checkRateLimit(verifiedUserId, `db-write:${table}`, 60, 60_000);
      if (!rl.allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs }, { status: 429 });
      }
    }

      // 2. Check table whitelist
    if (operation === 'select' && !READ_ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: `Access denied to table: ${table}` }, { status: 403 });
    }
    // Admin-only write tables (not in general WRITE_ALLOWED_TABLES)
    const ADMIN_WRITE_TABLES = new Set(['user_stats']);
    if (operation !== 'select' && !WRITE_ALLOWED_TABLES.has(table)) {
      if (ADMIN_WRITE_TABLES.has(table) && isAdmin) {
        // Admin can write to these restricted tables
      } else {
        return NextResponse.json({ error: `Write access denied to table: ${table}` }, { status: 403 });
      }
    }

  // 3. For write operations on user-scoped tables, enforce ownership
  //    Admins bypass this check — they can modify any user's data
  const scopeConfig = USER_SCOPED_TABLES[table];
  if (scopeConfig && operation !== 'select' && !isAdmin) {
    // Force the user ID in data for insert/upsert/update
    if (data && (operation === 'insert' || operation === 'upsert' || operation === 'update')) {
      if (Array.isArray(data)) {
        for (const row of data) {
          row[scopeConfig.idColumn] = verifiedUserId;
        }
      } else {
        data[scopeConfig.idColumn] = verifiedUserId;
      }
    }

    // For update/delete, ensure there's a filter on the user ID column
    if (operation === 'update' || operation === 'delete') {
      const hasUserFilter = filters?.some(
        (f: any) => f.column === scopeConfig.idColumn && f.type === 'eq' && Number(f.value) === verifiedUserId
      );
      if (!hasUserFilter) {
        // Auto-add user filter to prevent modifying other users' data
        if (!body.filters) body.filters = [];
        body.filters.push({ type: 'eq', column: scopeConfig.idColumn, value: verifiedUserId });
      }
    }
    }

    // 4. Strip blocked fields from zombie_game_sessions writes
    if (table === 'zombie_game_sessions' && operation !== 'select' && data) {
      const stripBlocked = (row: any) => {
        for (const field of BLOCKED_SESSION_FIELDS) {
          delete row[field];
        }
      };
      if (Array.isArray(data)) {
        data.forEach(stripBlocked);
      } else {
        stripBlocked(data);
      }
    }

    // 5. SECURITY: Sanitize photo_200 in profiles writes to prevent IP harvesting
    if (table === 'profiles' && operation !== 'select' && data) {
      if (Array.isArray(data)) {
        data.forEach(sanitizeProfileData);
      } else {
        sanitizeProfileData(data);
      }
    }

    try {
      let query: any;

    switch (operation) {
      case 'select': {
        query = supabaseAdmin.from(table).select(options?.select || '*');
        break;
      }
      case 'insert': {
        query = supabaseAdmin.from(table).insert(data);
        if (options?.select) query = query.select(options.select);
        break;
      }
      case 'upsert': {
        const upsertOpts: any = {};
        if (options?.onConflict) upsertOpts.onConflict = options.onConflict;
        query = supabaseAdmin.from(table).upsert(data, upsertOpts);
        if (options?.select) query = query.select(options.select);
        break;
      }
      case 'update': {
        query = supabaseAdmin.from(table).update(data);
        break;
      }
      case 'delete': {
        query = supabaseAdmin.from(table).delete();
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown operation: ${operation}` }, { status: 400 });
    }

    // Apply filters (may include auto-added user filter)
    const activeFilters = body.filters || filters;
    if (activeFilters && Array.isArray(activeFilters)) {
      for (const f of activeFilters) {
        switch (f.type) {
          case 'eq': query = query.eq(f.column, f.value); break;
          case 'neq': query = query.neq(f.column, f.value); break;
          case 'gt': query = query.gt(f.column, f.value); break;
          case 'gte': query = query.gte(f.column, f.value); break;
          case 'lt': query = query.lt(f.column, f.value); break;
          case 'lte': query = query.lte(f.column, f.value); break;
          case 'in': query = query.in(f.column, f.value); break;
          case 'not': query = query.not(f.column, f.operator, f.value); break;
          case 'is': query = query.is(f.column, f.value); break;
        }
      }
    }

    // Apply options
    if (options?.order) {
      for (const o of Array.isArray(options.order) ? options.order : [options.order]) {
        query = query.order(o.column, { ascending: o.ascending ?? true });
      }
    }
    if (options?.limit) query = query.limit(options.limit);
    if (options?.single) query = query.single();

      const result = await query;

      // Audit log for write operations
      if (operation !== 'select') {
        auditLog(verifiedUserId, 'db_write', {
          table,
          operation,
          success: !result.error,
          error: result.error?.message,
        });
      }

      return NextResponse.json({ data: result.data, error: result.error });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
