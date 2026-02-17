// Client-side Supabase proxy — mimics supabase-js chaining API
// Routes protected tables to dedicated endpoints for security

import { getRawLaunchParams } from './vk-context';

type Filter = { type: string; column: string; value?: any; operator?: string };
type OrderOption = { column: string; ascending: boolean };

class QueryBuilder {
  private _table: string;
  private _operation: string = 'select';
  private _data: any = null;
  private _filters: Filter[] = [];
  private _options: {
    select?: string;
    order?: OrderOption[];
    limit?: number;
    single?: boolean;
    onConflict?: string;
  } = {};

  constructor(table: string) {
    this._table = table;
  }

  select(columns: string = '*') {
    if (this._operation === 'select' || !this._data) {
      this._operation = 'select';
    }
    this._options.select = columns;
    return this;
  }

  insert(data: any) {
    this._operation = 'insert';
    this._data = data;
    return this;
  }

  upsert(data: any, opts?: { onConflict?: string }) {
    this._operation = 'upsert';
    this._data = data;
    if (opts?.onConflict) this._options.onConflict = opts.onConflict;
    return this;
  }

  update(data: any) {
    this._operation = 'update';
    this._data = data;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  eq(column: string, value: any) { this._filters.push({ type: 'eq', column, value }); return this; }
  neq(column: string, value: any) { this._filters.push({ type: 'neq', column, value }); return this; }
  gt(column: string, value: any) { this._filters.push({ type: 'gt', column, value }); return this; }
  gte(column: string, value: any) { this._filters.push({ type: 'gte', column, value }); return this; }
  lt(column: string, value: any) { this._filters.push({ type: 'lt', column, value }); return this; }
  lte(column: string, value: any) { this._filters.push({ type: 'lte', column, value }); return this; }
  in(column: string, values: any[]) { this._filters.push({ type: 'in', column, value: values }); return this; }
  not(column: string, operator: string, value: any) { this._filters.push({ type: 'not', column, operator, value }); return this; }
  is(column: string, value: any) { this._filters.push({ type: 'is', column, value }); return this; }

  order(column: string, opts?: { ascending?: boolean }) {
    if (!this._options.order) this._options.order = [];
    this._options.order.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(count: number) { this._options.limit = count; return this; }

  single() { this._options.single = true; return this; }

  async then(resolve: (value: any) => void, reject?: (reason?: any) => void) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      console.log(`[SupabaseProxy] ${this._operation} on ${this._table}`, { 
        lp: lp ? `present (${lp.length} chars)` : 'missing',
        lpPreview: lp ? lp.substring(0, 100) + '...' : 'N/A'
      });

      // Protected tables routing
      if (this._table === 'user_stats' || this._table === 'user_visits') {
        // Use /api/my-stats for user data
        if (this._operation === 'select') {
          console.log('[SupabaseProxy] Routing to /api/my-stats');
          const res = await fetch('/api/my-stats', { method: 'GET', headers });
          console.log('[SupabaseProxy] /api/my-stats response:', res.status);
          const result = await res.json();
          console.log('[SupabaseProxy] /api/my-stats result:', result);
          
          // Transform response to match supabase format
          if (this._table === 'user_stats') {
            const statsData = result.stats ? [{
              user_id: result.profile?.vk_id,
              mined_balance: result.stats.balance,
              visits_today: result.stats.visitsToday,
              visits_this_week: result.stats.visitsThisWeek,
              weekly_days: result.stats.weeklyDays,
              last_check_in: result.stats.lastCheckIn,
              category_cooldowns: result.stats.categoryCooldowns,
              daily_claimed: result.stats.dailyClaimed,
              weekly_claimed: result.stats.weeklyClaimed,
              last_daily_reset: result.stats.lastDailyReset,
              last_weekly_reset: result.stats.lastWeeklyReset,
            }] : [];
            resolve({ data: this._options.single ? statsData[0] : statsData, error: null });
          } else {
            // user_visits
            resolve({ data: result.visits || [], error: null });
          }
          return;
        }
        
        // For write operations, fallback to /api/db (should use dedicated endpoints)
        resolve({ data: null, error: { message: `Write to ${this._table} not supported via proxy. Use dedicated API.` } });
        return;
      }

      if (this._table === 'profiles') {
        // Extract vk_id from filters if present
        const vkIdFilter = this._filters.find(f => f.type === 'eq' && f.column === 'vk_id');
        
        if (this._operation === 'select' && vkIdFilter) {
          const res = await fetch(`/api/profiles?vk_id=${vkIdFilter.value}`, { method: 'GET', headers });
          const result = await res.json();
          resolve({ data: this._options.single ? result.data : [result.data], error: result.error });
          return;
        }
        
        // For upsert/update, use /api/profiles with action
        if (this._operation === 'upsert' || this._operation === 'update') {
          const action = this._operation === 'upsert' ? 'upsert' : 'update_last_mined';
          const res = await fetch('/api/profiles', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action, ...this._data }),
          });
          const result = await res.json();
          resolve({ data: result.success ? this._data : null, error: result.error });
          return;
        }
      }

      if (this._table === 'follows') {
        // Use /api/friends
        if (this._operation === 'select') {
          // Determine action from context (following or followers)
          const followerFilter = this._filters.find(f => f.type === 'eq' && f.column === 'follower_id');
          const followingFilter = this._filters.find(f => f.type === 'eq' && f.column === 'following_id');
          
          let action = 'following';
          if (followingFilter && !followerFilter) action = 'followers';
          
          const res = await fetch(`/api/friends?action=${action}`, { method: 'GET', headers });
          const result = await res.json();
          resolve({ data: result.data || [], error: null });
          return;
        }
        
        if (this._operation === 'upsert') {
          const isFollow = this._data.is_blocked === false;
          const action = isFollow ? 'follow' : 'toggle_block';
          const res = await fetch('/api/friends', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action, ...this._data }),
          });
          const result = await res.json();
          resolve({ data: result.success ? this._data : null, error: result.error });
          return;
        }
        
        if (this._operation === 'delete') {
          const res = await fetch('/api/friends', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'unfollow', following_id: this._filters.find(f => f.column === 'following_id')?.value }),
          });
          const result = await res.json();
          resolve({ data: result.success ? {} : null, error: result.error });
          return;
        }
      }

      // Default: use /api/db for allowed tables (knowledge_places, etc.)
      const res = await fetch('/api/db', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          table: this._table,
          operation: this._operation,
          data: this._data,
          filters: this._filters.length > 0 ? this._filters : undefined,
          options: Object.keys(this._options).length > 0 ? this._options : undefined,
        }),
      });

      const result = await res.json();
      resolve({ data: result.data, error: result.error });
    } catch (err: any) {
      if (reject) reject(err);
      else resolve({ data: null, error: { message: err.message } });
    }
  }
}

// Proxy object that mimics createClient() result
export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },
};
