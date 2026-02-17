
import { supabase } from './supabase-proxy';

export interface FriendProfile {
  vk_id: number;
  first_name: string;
  last_name: string;
  photo_200: string;
  last_lat?: number;
  last_lon?: number;
  last_category?: string;
  last_location_name?: string;
  last_mined_at?: string;
  is_private?: boolean;
  is_blocked?: boolean; // Used to indicate if the current user has blocked this follower
}

export const FriendService = {
  async ensureProfile(profile: FriendProfile) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').upsert({
        vk_id: profile.vk_id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_200: profile.photo_200,
      }, { onConflict: 'vk_id' });
      
      if (error) console.error('Error ensuring profile:', error);
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
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').update({
        last_lat: data.lat,
        last_lon: data.lon,
        last_category: data.category,
        last_location_name: data.location_name,
        last_mined_at: new Date().toISOString()
      }).eq('vk_id', vkId);
      
      if (error) console.error('Error updating last mined:', error);
    } catch (err) {
      console.error('Failed to update last mined:', err);
    }
  },

  async togglePrivacy(vkId: number, isPrivate: boolean) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('profiles').update({
        is_private: isPrivate
      }).eq('vk_id', vkId);
      
      if (error) console.error('Error toggling privacy:', error);
    } catch (err) {
      console.error('Failed to toggle privacy:', err);
    }
  },

  async getProfile(vkId: number): Promise<FriendProfile | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('vk_id', vkId)
        .single();
      
      if (error) return null;
      return data;
    } catch (err) {
      return null;
    }
  },

  async followFriend(followerId: number, followingId: number) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('follows').upsert({
        follower_id: followerId,
        following_id: followingId,
        is_blocked: false // Reset block if refollowing
      }, { onConflict: 'follower_id,following_id' });
      
      if (error) console.error('Error following friend:', error);
    } catch (err) {
      console.error('Failed to follow friend:', err);
    }
  },

  async unfollow(followerId: number, followingId: number) {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);
      
      if (error) console.error('Error unfollowing:', error);
    } catch (err) {
      console.error('Failed to unfollow:', err);
    }
  },

  async toggleBlockFollower(followingId: number, followerId: number, isBlocked: boolean) {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('follows')
        .update({ is_blocked: isBlocked })
        .eq('following_id', followingId)
        .eq('follower_id', followerId);
      
      if (error) console.error('Error toggling block:', error);
    } catch (err) {
      console.error('Failed to toggle block:', err);
    }
  },

  async getFollowing(followerId: number): Promise<FriendProfile[]> {
    if (!supabase) return [];
    try {
      // 1. Get IDs and blocked status from follows
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('following_id, is_blocked')
        .eq('follower_id', followerId);
      
      if (followError || !followData) return [];

      const followingIds = followData.map(f => f.following_id);
      if (followingIds.length === 0) return [];

      // 2. Get profiles for those IDs
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('vk_id', followingIds);
      
      if (profileError || !profiles) return [];

      // 3. Merge and apply privacy logic
      return profiles.map(profile => {
        const followInfo = followData.find(f => f.following_id === profile.vk_id);
        const isBlockedByThem = followInfo?.is_blocked;
        
        if (profile.is_private || isBlockedByThem) {
          return {
            ...profile,
            last_lat: undefined,
            last_lon: undefined,
            last_category: undefined,
            last_location_name: undefined,
            last_mined_at: undefined,
            is_private: profile.is_private, // Keep this so UI knows why data is missing
            is_blocked_by_them: isBlockedByThem // Custom flag for UI
          };
        }
        return profile;
      });
    } catch (err) {
      console.error('Failed to get following:', err);
      return [];
    }
  },

  async getFollowers(followingId: number): Promise<FriendProfile[]> {
    if (!supabase) return [];
    try {
      // 1. Get follower IDs and block status
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('follower_id, is_blocked')
        .eq('following_id', followingId);
      
      if (followError || !followData) {
        if (followError) console.error('Error getting followers info:', followError);
        return [];
      }

      const followerIds = followData.map(f => f.follower_id);
      if (followerIds.length === 0) return [];

      // 2. Get profiles for those IDs
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('vk_id', followerIds);
      
      if (profileError || !profiles) {
        if (profileError) console.error('Error getting follower profiles:', profileError);
        return [];
      }

      // 3. Merge block status into profiles
      return profiles.map(profile => {
        const followInfo = followData.find(f => f.follower_id === profile.vk_id);
        return {
          ...profile,
          is_blocked: followInfo?.is_blocked
        };
      });
    } catch (err) {
      console.error('Failed to get followers:', err);
      return [];
    }
  },

  async getFriendHistory(vkId: number, limit = 3) {
    if (!supabase) return [];
    try {
      // First check if user is private
      const profile = await this.getProfile(vkId);
      if (profile?.is_private) return [];

      const { data, error } = await supabase
        .from('user_visits')
        .select('*')
        .eq('user_id', vkId)
        .order('timestamp', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Error getting friend history:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Failed to get friend history:', err);
      return [];
    }
  }
};
