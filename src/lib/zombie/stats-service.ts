// Сервис статистики зомби-режима
// All writes go through /api/zombie-stats (server-validated)
// Reads can still go through supabase proxy for convenience

import { supabase } from '../supabase-proxy';
import { getRawLaunchParams } from '../vk-context';
import { ZombieStats } from './types';

// Helper to call /api/zombie-stats with auth
async function callStatsAPI(body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; data?: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const lp = getRawLaunchParams();
  if (lp) headers['X-Launch-Params'] = lp;

  try {
    const res = await fetch('/api/zombie-stats', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (err: any) {
    console.error('StatsService API error:', err);
    return { error: err.message };
  }
}

export const StatsService = {
  // Получить статистику игрока (read — ok through proxy)
  async getStats(vkId: number): Promise<ZombieStats> {
    if (!supabase) {
      return {
        vk_id: vkId,
        total_deaths: 0,
        best_survival_time_seconds: 0,
        total_zombies_evaded: 0,
        total_resources_collected: 0,
        games_played: 0,
        zombies_educated: 0,
      };
    }
    
    const { data, error } = await supabase
      .from('zombie_stats')
      .select('*')
      .eq('vk_id', vkId)
      .single();
    
    if (error || !data) {
      // Create via API if not exists
      await callStatsAPI({ action: 'ensure_exists' });
      
      return {
        vk_id: vkId,
        total_deaths: 0,
        best_survival_time_seconds: 0,
        total_zombies_evaded: 0,
        total_resources_collected: 0,
        games_played: 0,
        zombies_educated: 0,
      };
    }
    
    return data;
  },
  
  // Записать смерть — server-validated
  async recordDeath(vkId: number, survivalTimeSeconds: number): Promise<void> {
    await callStatsAPI({
      action: 'record_death',
      survival_time_seconds: survivalTimeSeconds,
    });
  },
  
  // Обновить рекорд выживания — server-validated
  async updateSurvivalTime(vkId: number, survivalTimeSeconds: number): Promise<void> {
    await callStatsAPI({
      action: 'update_survival_time',
      survival_time_seconds: survivalTimeSeconds,
    });
  },
  
  // Увеличить счётчик уклонённых зомби
  async incrementZombiesEvaded(vkId: number, count: number = 1): Promise<void> {
    await callStatsAPI({
      action: 'increment_zombies_evaded',
      count,
    });
  },
  
  // Увеличить счётчик собранных ресурсов
  async incrementResourcesCollected(vkId: number, count: number = 1): Promise<void> {
    await callStatsAPI({
      action: 'increment_resources_collected',
      count,
    });
  },
  
  // Увеличить счётчик образованных зомби (устранённых книгой)
  async incrementZombiesEducated(vkId: number, count: number = 1): Promise<void> {
    await callStatsAPI({
      action: 'increment_zombies_educated',
      count,
    });
  },
  
  // Форматировать время выживания для отображения
  formatSurvivalTime(seconds: number): string {
    if (seconds === 0) return '—';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}д ${hours}ч`;
    }
    if (hours > 0) {
      return `${hours}ч ${minutes}м`;
    }
    return `${minutes}м`;
  },
  
  // Получить лидерборд (read-only, goes through proxy)
  async getLeaderboard(limit: number = 10): Promise<Array<ZombieStats & { first_name?: string; last_name?: string; photo_200?: string }>> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_stats')
      .select(`
        *,
        profiles:vk_id (first_name, last_name, photo_200)
      `)
      .order('best_survival_time_seconds', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching zombie leaderboard:', error);
      return [];
    }
    
    return (data || []).map((item: any) => ({
      ...item,
      first_name: item.profiles?.first_name,
      last_name: item.profiles?.last_name,
      photo_200: item.profiles?.photo_200,
    }));
  },
  
  // Получить топ-3 выживших (для виджета квестов)
  async getTop3Survivors(): Promise<Array<{ vk_id: number; first_name: string; last_name: string; photo_200?: string; best_survival_time_seconds: number }>> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_stats')
      .select(`
        vk_id,
        best_survival_time_seconds,
        profiles:vk_id (first_name, last_name, photo_200)
      `)
      .gt('best_survival_time_seconds', 0)
      .order('best_survival_time_seconds', { ascending: false })
      .limit(3);
    
    if (error) {
      console.error('Error fetching top 3 survivors:', error);
      return [];
    }
    
    return (data || []).map((item: any) => ({
      vk_id: item.vk_id,
      best_survival_time_seconds: item.best_survival_time_seconds,
      first_name: item.profiles?.first_name || 'Игрок',
      last_name: item.profiles?.last_name || '',
      photo_200: item.profiles?.photo_200,
    }));
  },
};
