import { getRawLaunchParams } from './vk-context';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  const lp = getRawLaunchParams();
  if (lp) h['X-Launch-Params'] = lp;
  return h;
}

export const PermissionService = {
  async getGeoPermission(_vkId: number) {
    try {
      const res = await fetch('/api/permissions', { headers: authHeaders() });
      if (!res.ok) return false;
      const data = await res.json();
      return data.geo_permission_granted || false;
    } catch (err) {
      console.error('Failed to get geo permission:', err);
      return false;
    }
  },

  async setGeoPermission(_vkId: number, granted: boolean) {
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ geo_permission_granted: granted }),
      });
      return res.ok;
    } catch (err) {
      console.error('Failed to set geo permission:', err);
      return false;
    }
  },

  async getNotificationPermission(_vkId: number) {
    try {
      const res = await fetch('/api/permissions', { headers: authHeaders() });
      if (!res.ok) return false;
      const data = await res.json();
      return data.notifications_enabled || false;
    } catch (err) {
      return false;
    }
  },

  async setNotificationPermission(_vkId: number, enabled: boolean) {
    try {
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ notifications_enabled: enabled }),
      });
      return res.ok;
    } catch (err) {
      return false;
    }
  }
};
