import { supabaseAdmin } from './supabase-server';

/**
 * Fire-and-forget audit log for security-critical operations.
 * Writes to the audit_log table in Supabase.
 * Never throws — errors are silently logged to console.
 */
export function auditLog(
  vkId: number,
  action: string,
  details?: Record<string, unknown>,
) {
  if (!supabaseAdmin) return;

  supabaseAdmin
    .from('audit_log')
    .insert({
      vk_id: vkId,
      action,
      details: details || {},
      created_at: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error('[audit-log] write failed:', error.message);
    });
}
