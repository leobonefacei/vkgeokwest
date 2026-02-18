
import { getRawLaunchParams } from './vk-context';
import { isAllowedPhotoUrl } from './utils';

async function callAPI(url: string, body: Record<string, any>): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const lp = getRawLaunchParams();
  if (lp) headers['X-Launch-Params'] = lp;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

export interface FriendProfile {
  vk_id: number;
  first_name: string;
  last_name: string;
  photo_200?: string;
  photo_100?: string;
  last_lat?: number;
  last_lon?: number;
  last_category?: string;
  last_location_name?: string;
  last_mined_at?: string;
  is_private?: boolean;
  is_blocked?: boolean;
  points?: number;
}

export const FriendService = {
  async ensureProfile(profile: FriendProfile) {
    try {
      let avatarToSave = profile.photo_200;
      
      if (!avatarToSave || !isAllowedPhotoUrl(avatarToSave)) {
        avatarToSave = profile.photo_100;
      }

      await callAPI('/api/profiles', {
        action: 'upsert',
        vk_id: profile.vk_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_200: avatarToSave,
      });
    } catch (err) {
      console.error('Failed to ensure profile:', err);
    }
  },

  async updateLastMined(vkId: number, data: { 
    lat: number; 
    lon: number; 
    category: string; 
    location_name: string;
  }) {
    try {
      await callAPI('/api/profiles', {
        action: 'update_last_mined',
        last_lat: data.lat,
        last_lon: data.lon,
        last_category: data.category,
        last_location_name: data.location_name,
      });
    } catch (err) {
      console.error('Failed to update last mined:', err);
    }
  },

  async togglePrivacy(vkId: number, isPrivate: boolean) {
    try {
      await callAPI('/api/profiles', {
        action: 'toggle_privacy',
        is_private: isPrivate,
      });
    } catch (err) {
      console.error('Failed to toggle privacy:', err);
    }
  },

  async getProfile(vkId: number): Promise<FriendProfile | null> {
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const result = await fetch(`/api/profiles?vk_id=${vkId}`, { headers });
      const data = await result.json();
      return data?.data || null;
    } catch (err) {
      return null;
    }
  },

  async followFriend(followerId: number, followingId: number) {
    try {
      await callAPI('/api/friends', { action: 'follow', following_id: followingId });
    } catch (err) {
      console.error('Failed to follow friend:', err);
    }
  },

  async unfollow(followerId: number, followingId: number) {
    try {
      await callAPI('/api/friends', { action: 'unfollow', following_id: followingId });
    } catch (err) {
      console.error('Failed to unfollow:', err);
    }
  },

  async toggleBlockFollower(followingId: number, followerId: number, isBlocked: boolean) {
    try {
      await callAPI('/api/friends', { action: 'toggle_block', follower_id: followerId, is_blocked: isBlocked });
    } catch (err) {
      console.error('Failed to toggle block:', err);
    }
  },

  async getFollowing(followerId: number): Promise<FriendProfile[]> {
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const result = await fetch('/api/friends?action=following', { headers });
      const data = await result.json();
      return data?.data || [];
    } catch (err) {
      console.error('Failed to get following:', err);
      return [];
    }
  },

  async getFollowers(followingId: number): Promise<FriendProfile[]> {
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const result = await fetch('/api/friends?action=followers', { headers });
      const data = await result.json();
      return data?.data || [];
    } catch (err) {
      console.error('Failed to get followers:', err);
      return [];
    }
  },

  async getFriendHistory(vkId: number, limit = 3) {
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const result = await fetch(`/api/friends?action=history&vk_id=${vkId}&limit=${limit}`, { headers });
      const data = await result.json();
      return data || { data: [], is_private: false };
    } catch (err) {
      console.error('Failed to get friend history:', err);
      return [];
    }
  }
};
