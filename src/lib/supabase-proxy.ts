// Client-side Supabase proxy — mimics supabase-js chaining API
// but sends all queries through /api/db server route (no anon key on client)

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
    // If called after insert/upsert/update, don't override operation — just set select option
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
