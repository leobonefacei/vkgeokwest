'use client';

import { supabase } from './supabase-proxy';
import { getRawLaunchParams } from './vk-context';
import { DateTime } from 'luxon';

const MSK_TZ = 'Europe/Moscow';

function getMskDay(): string {
  return DateTime.now().setZone(MSK_TZ).toFormat('yyyy-MM-dd');
}

function getMskWeek(): string {
  const mskNow = DateTime.now().setZone(MSK_TZ);
  return `${mskNow.weekYear}-W${String(mskNow.weekNumber).padStart(2, '0')}`;
}

// Helper to call server APIs with VK auth
async function callAPI(url: string, body: Record<string, any>): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const lp = getRawLaunchParams();
  if (lp) headers['X-Launch-Params'] = lp;

  const isEmptyBody = Object.keys(body).length === 0;
  const method = isEmptyBody ? 'GET' : 'POST';
  const res = await fetch(url, { method, headers, body: isEmptyBody ? undefined : JSON.stringify(body) });
  return res.json();
}

export interface Location {
  id: string;
  osmId?: string;
  name: string;
  category: 'Школа' | 'Вуз' | 'Библиотека' | 'Музей' | 'Колледж' | 'Памятник';
  lat: number;
  lon: number;
  address: string;
  isMined?: boolean;
  minedAt?: number;
}

export interface Visit {
  id: string;
  locationId: string;
  osmId?: string;
  locationName: string;
  category: string;
  timestamp: number;
  coinsEarned: number;
  lat?: number;
  lon?: number;
}

export interface UserStats {
  balance: number;
  visitsToday: number;
  visitsThisWeek: number;
  lastCheckIn: number;
  history: Visit[];
  banned: boolean;
  weeklyDays: number;
  categoryCooldowns: Record<string, number>;
  dailyClaimed: boolean;
  weeklyClaimed: boolean;
  lastDailyReset: string;
  lastWeeklyReset: string;
}

export const MOCK_LOCATIONS: Location[] = [
  { id: '1', name: 'МГУ им. Ломоносова', category: 'Вуз', lat: 55.7028, lon: 37.5308, address: 'Ленинские горы, 1' },
  { id: '2', name: 'Библиотека им. Ленина', category: 'Библиотека', lat: 55.7516, lon: 37.6089, address: 'ул. Воздвиженка, 3/5' },
  { id: '3', name: 'Третьяковская галерея', category: 'Музей', lat: 55.7415, lon: 37.6208, address: 'Лаврушинский пер., 10' },
  { id: '4', name: 'Школа №1535', category: 'Школа', lat: 55.7275, lon: 37.5750, address: 'Малый Саввинский пер., 8' },
  { id: '5', name: 'МГТУ им. Баумана', category: 'Вуз', lat: 55.7656, lon: 37.6845, address: '2-я Бауманская ул., 5' },
  { id: '6', name: 'Памятник Петру I', category: 'Памятник', lat: 55.7408, lon: 37.6081, address: 'Крымская наб., 10' },
];

const STORAGE_KEY = 'umnicoin_user_data';

let dynamicLocations: Location[] = [];

export const UmnicoinService = {
  getUserData(): UserStats {
    if (typeof window === 'undefined') return this.getDefaultStats();
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : this.getDefaultStats();
  },

  async fetchNearbyRealLocations(lat: number, lon: number, radius = 1000): Promise<Location[]> {
    try {
      // 1. Fetch from Supabase (read-only via proxy)
      if (supabase) {
        const { data: dbPlaces } = await supabase
          .from('knowledge_places')
          .select('*');
        
        if (dbPlaces) {
          dbPlaces.forEach((p: any) => {
            if (!dynamicLocations.find(dl => dl.id === p.id)) {
              dynamicLocations.push({
                id: p.id,
                osmId: p.osm_id,
                name: p.name,
                category: p.category as any,
                lat: p.lat,
                lon: p.lon,
                address: p.address
              });
            }
          });
        }
      }

      const query = `[out:json][timeout:25];
      (
        nwr(around:${radius},${lat},${lon})["amenity"~"school|university|college"];
        nwr(around:${radius},${lat},${lon})["amenity"="library"];
        nwr(around:${radius},${lat},${lon})["tourism"~"museum|gallery"];
        nwr(around:${radius},${lat},${lon})["historic"~"monument|memorial"];
        nwr(around:${radius},${lat},${lon})["tourism"="artwork"];
      );
      out center;`;
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });

      if (!response.ok) throw new Error('Overpass API error');
      
      const data = await response.json();
      const elements = data.elements || [];

      const fetchedLocations: Location[] = elements.map((el: any) => {
        let category: Location['category'] = 'Школа';
        const tags = el.tags || {};
        
        if (tags.amenity === 'library') category = 'Библиотека';
        else if (tags.tourism === 'museum' || tags.tourism === 'gallery') category = 'Музей';
        else if (tags.amenity === 'university') category = 'Вуз';
        else if (tags.amenity === 'college') category = 'Колледж';
        else if (tags.historic === 'monument' || tags.historic === 'memorial' || tags.tourism === 'artwork') category = 'Памятник';

        return {
          id: `osm-${el.id}`,
          osmId: `osm-${el.id}`,
          name: tags.name || tags['name:ru'] || (category === 'Школа' ? 'Школа' : category),
          category,
          lat: el.lat || el.center?.lat,
          lon: el.lon || el.center?.lon,
          address: tags['addr:street'] ? `${tags['addr:street']}, ${tags['addr:housenumber'] || ''}` : 'Адрес не указан'
        };
      }).filter((l: any) => l.lat && l.lon);

      // 2. Save new places via /api/places (will be accepted only for admins; silent fail for others)
      if (fetchedLocations.length > 0) {
        const toInsert = fetchedLocations.map(l => ({
          id: l.id.startsWith('osm-') ? undefined : l.id, // Let DB generate UUID if OSM ID
          name: l.name,
          category: l.category,
          lat: l.lat,
          lon: l.lon,
          address: l.address,
          osm_id: l.id.startsWith('osm-') ? l.id : null // Store OSM ID for reference
        }));
        
        // Fire-and-forget — non-admins will get 403 which is fine
        callAPI('/api/places', { places: toInsert }).catch(() => {});
      }

      fetchedLocations.forEach(fl => {
        if (!dynamicLocations.find(dl => dl.id === fl.id)) {
          dynamicLocations.push(fl);
        }
      });

      return dynamicLocations;
    } catch (error) {
      console.error('Failed to fetch real locations:', error);
      return dynamicLocations;
    }
  },

  async syncUserVisits(vkId: number) {
    try {
      const result = await callAPI('/api/my-stats', {});
      
      if (result?.stats) {
        const stats = this.getUserData();
        
        stats.balance = result.stats.balance || 0;
        stats.visitsToday = result.stats.visitsToday || 0;
        stats.visitsThisWeek = result.stats.visitsThisWeek || 0;
        stats.weeklyDays = result.stats.weeklyDays || 0;
        stats.lastCheckIn = result.stats.lastCheckIn ? new Date(result.stats.lastCheckIn).getTime() : 0;
        stats.categoryCooldowns = result.stats.categoryCooldowns || {};
        stats.dailyClaimed = result.stats.dailyClaimed || false;
        stats.weeklyClaimed = result.stats.weeklyClaimed || false;
        stats.lastDailyReset = result.stats.lastDailyReset || getMskDay();
        stats.lastWeeklyReset = result.stats.lastWeeklyReset || getMskWeek();
        
        if (result.visits) {
          stats.history = result.visits.map((dv: any) => ({
            id: dv.id,
            locationId: dv.place_id,
            osmId: dv.osm_id,
            locationName: dv.location_name || 'Неизвестное место',
            category: dv.category || 'Образование',
            timestamp: new Date(dv.timestamp).getTime(),
            coinsEarned: dv.coins_earned,
            lat: dv.lat,
            lon: dv.lon
          }));
        }
        
        console.log('[UmnicoinService] Synced history count:', stats.history.length);
        this.saveUserData(stats);
      }
    } catch (err) {
      console.error('Failed to sync data:', err);
    }
  },

  // Only sends non-balance fields via /api/user-stats (balance changes go through /api/checkin and /api/claim-goal)
  async updateUserStats(vkId: number, stats: Partial<UserStats>) {
    try {
      const payload: any = {};
      
      if (stats.visitsToday !== undefined) payload.visits_today = stats.visitsToday;
      if (stats.visitsThisWeek !== undefined) payload.visits_this_week = stats.visitsThisWeek;
      if (stats.weeklyDays !== undefined) payload.weekly_days = stats.weeklyDays;
      if (stats.lastCheckIn !== undefined) payload.last_check_in = new Date(stats.lastCheckIn).toISOString();
      if (stats.categoryCooldowns !== undefined) payload.category_cooldowns = stats.categoryCooldowns;
      if (stats.dailyClaimed !== undefined) payload.daily_claimed = stats.dailyClaimed;
      if (stats.weeklyClaimed !== undefined) payload.weekly_claimed = stats.weeklyClaimed;
      if (stats.lastDailyReset !== undefined) payload.last_daily_reset = stats.lastDailyReset;
      if (stats.lastWeeklyReset !== undefined) payload.last_weekly_reset = stats.lastWeeklyReset;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;

      await fetch('/api/user-stats', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('Failed to update user stats in DB:', err);
    }
  },

  getAllLocations(): Location[] {
    const stats = this.getUserData();
    const combined = [...MOCK_LOCATIONS];
    
    dynamicLocations.forEach(dl => {
      if (!combined.some(cl => cl.id === dl.id)) {
        combined.push(dl);
      }
    });

    return combined.map(loc => {
      // Try to find a visit to this location in history
      const visit = stats.history.find(h => {
        // Match by internal UUID
        if (h.locationId === loc.id) return true;
        // Match by OSM ID
        if (loc.osmId && h.osmId === loc.osmId) return true;
        // Match by proximity (very close coordinates)
        if (h.lat && h.lon && loc.lat && loc.lon) {
          const dist = this.calculateDistance(h.lat, h.lon, loc.lat, loc.lon);
          return dist < 50; // Within 50 meters is definitely the same place
        }
        return false;
      });

      if (visit) {
        return { ...loc, isMined: true, minedAt: visit.timestamp };
      }
      return loc;
    });
  },

  getDefaultStats(): UserStats {
    return {
      balance: 0,
      visitsToday: 0,
      visitsThisWeek: 0,
      lastCheckIn: 0,
      history: [],
      banned: false,
      weeklyDays: 0,
      categoryCooldowns: {},
      dailyClaimed: false,
      weeklyClaimed: false,
      lastDailyReset: getMskDay(),
      lastWeeklyReset: getMskWeek()
    };
  },

  saveUserData(stats: UserStats) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    }
  },

  getCategoryCooldown(category: string): { onCooldown: boolean; remainingMin: number } {
    const stats = this.getUserData();
    const now = Date.now();
    const COOLDOWN = 2 * 3600000;
    if (stats.categoryCooldowns[category] && (now - stats.categoryCooldowns[category] < COOLDOWN)) {
      const remaining = Math.ceil((COOLDOWN - (now - stats.categoryCooldowns[category])) / 60000);
      return { onCooldown: true, remainingMin: remaining };
    }
    return { onCooldown: false, remainingMin: 0 };
  },

  // Server-side checkin with category — all validation on server
  async checkInCategory(category: string, lat: number, lon: number, osm_id?: string): Promise<{ success: boolean; message: string; coins?: number }> {
    try {
      const result = await callAPI('/api/checkin', { lat, lon, category, osm_id });
      
      if (result.success && result.visit) {
        const stats = this.getUserData();
        
        // Update stats from server response
        stats.balance = result.stats?.balance ?? result.balance ?? stats.balance;
        stats.visitsToday = result.stats?.visitsToday ?? stats.visitsToday;
        stats.visitsThisWeek = result.stats?.visitsThisWeek ?? stats.visitsThisWeek;
        stats.weeklyDays = result.stats?.weeklyDays ?? stats.weeklyDays;
        stats.categoryCooldowns = result.stats?.categoryCooldowns ?? stats.categoryCooldowns;
        stats.lastCheckIn = result.stats?.lastCheckIn ? new Date(result.stats.lastCheckIn).getTime() : Date.now();
        
        // Add visit to history
        const newVisit = {
          id: Math.random().toString(36).substr(2, 9),
          ...result.visit,
          timestamp: new Date(result.visit.timestamp).getTime()
        };
        
        // Avoid duplicate history entries
        if (!stats.history.some(h => h.timestamp === newVisit.timestamp)) {
          stats.history.unshift(newVisit);
        }
        
        this.saveUserData(stats);

        // Update friend last mined
        const vkId = Number(localStorage.getItem('vk_user_id')) || 0;
        if (vkId) {
          import('./friend-service').then(({ FriendService }) => {
            FriendService.updateLastMined(vkId, {
              lat: result.visit.lat,
              lon: result.visit.lon,
              category: result.visit.category,
              location_name: result.visit.locationName,
            });
          });
        }
      }
      
      return { success: result.success, message: result.message, coins: result.coins };
    } catch (err) {
      console.error('Checkin failed:', err);
      return { success: false, message: 'Ошибка сети' };
    }
  },

  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  },

  findNearestLocation(lat: number, lon: number): { location: Location; distance: number } | null {
    const locations = this.getAllLocations();
    if (locations.length === 0) return null;
    
    let nearest = locations[0];
    let minDistance = this.calculateDistance(lat, lon, nearest.lat, nearest.lon);

    for (let i = 1; i < locations.length; i++) {
      const d = this.calculateDistance(lat, lon, locations[i].lat, locations[i].lon);
      if (d < minDistance) {
        minDistance = d;
        nearest = locations[i];
      }
    }

    return { location: nearest, distance: minDistance };
  },

  // Server-side checkin — all validation on server
  async checkIn(lat: number, lon: number): Promise<{ success: boolean; message: string; coins?: number }> {
    try {
      const result = await callAPI('/api/checkin', { lat, lon });
      
      if (result.success && result.visit) {
        const stats = this.getUserData();
        stats.balance = result.balance || stats.balance;
        stats.visitsToday = result.stats?.visitsToday ?? stats.visitsToday;
        stats.visitsThisWeek = result.stats?.visitsThisWeek ?? stats.visitsThisWeek;
        stats.weeklyDays = result.stats?.weeklyDays ?? stats.weeklyDays;
        stats.categoryCooldowns = result.stats?.categoryCooldowns ?? stats.categoryCooldowns;
        stats.lastCheckIn = Date.now();
        stats.history.unshift({
          id: Math.random().toString(36).substr(2, 9),
          ...result.visit,
        });
        this.saveUserData(stats);

        const vkId = Number(localStorage.getItem('vk_user_id')) || 0;
        if (vkId) {
          import('./friend-service').then(({ FriendService }) => {
            FriendService.updateLastMined(vkId, {
              lat: result.visit.lat,
              lon: result.visit.lon,
              category: result.visit.category,
              location_name: result.visit.locationName,
            });
          });
        }
      }
      
      return { success: result.success, message: result.message, coins: result.coins };
    } catch (err) {
      console.error('Checkin failed:', err);
      return { success: false, message: 'Ошибка сети' };
    }
  },

  async getOtherUserStats(vkId: number) {
    if (!supabase) return null;
    try {
      const { data } = await supabase
        .from('user_stats')
        .select('balance, mined_balance')
        .eq('user_id', vkId)
        .single();
      return data;
    } catch (err) {
      return null;
    }
  },

  getRanking() {
    return [];
  },

  async getRealRanking() {
    try {
      const headers: Record<string, string> = {};
      const lp = getRawLaunchParams();
      if (lp) headers['X-Launch-Params'] = lp;
      
      const res = await fetch('/api/ranking', { headers });
      const result = await res.json();
      
      if (result?.data) {
        return result.data.map((row: any) => ({
          id: row.id,
          name: row.name || `ID: ${row.id}`,
          points: row.points || 0,
          avatar: row.avatar,
          isMe: row.isMe || false
        }));
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch ranking:', err);
      return [];
    }
  },

  // Server-side goal claiming — balance changes happen on server
  async claimGoal(type: 'daily' | 'weekly'): Promise<{ success: boolean; message: string; coins?: number }> {
    try {
      const result = await callAPI('/api/claim-goal', { type });
      
      if (result.success) {
        const stats = this.getUserData();
        stats.balance += result.coins || 0;
        if (type === 'daily') stats.dailyClaimed = true;
        else stats.weeklyClaimed = true;
        this.saveUserData(stats);
      }
      
      return { success: result.success, message: result.message, coins: result.coins };
    } catch (err) {
      console.error('Claim goal failed:', err);
      return { success: false, message: 'Ошибка сети' };
    }
  },

  getCategoryStats(): Record<string, { count: number; lastVisit: Visit | null }> {
    const stats = this.getUserData();
    const result: Record<string, { count: number; lastVisit: Visit | null }> = {};
    
    const categoryMapping: Record<string, string> = {
      'Школа': 'Образовательные учреждения',
      'Вуз': 'Образовательные учреждения',
      'Колледж': 'Образовательные учреждения',
      'Библиотека': 'Библиотека',
      'Музей': 'Музей',
      'Памятник': 'Памятник'
    };
    
    const mainCategories = ['Образовательные учреждения', 'Библиотека', 'Музей', 'Памятник'];
    mainCategories.forEach(cat => {
      result[cat] = { count: 0, lastVisit: null };
    });
    
    for (const visit of stats.history) {
      const mainCat = categoryMapping[visit.category] || visit.category;
      if (!result[mainCat]) {
        result[mainCat] = { count: 0, lastVisit: null };
      }
      result[mainCat].count++;
      
      if (!result[mainCat].lastVisit || visit.timestamp > result[mainCat].lastVisit.timestamp) {
        result[mainCat].lastVisit = visit;
      }
    }
    
    return result;
  },

  // Admin: Update any user's balance (admin can write to user_stats via /api/db)
  async updateUserBalance(targetVkId: number, newBalance: number): Promise<{ success: boolean; message: string }> {
    if (!supabase) {
      return { success: false, message: 'База данных недоступна' };
    }
    
    try {
      const { error } = await supabase
        .from('user_stats')
        .update({
          balance: newBalance,
          mined_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', targetVkId);
      
      if (error) {
        console.error('Failed to update user balance:', error);
        return { success: false, message: 'Ошибка обновления баланса' };
      }
      
      return { success: true, message: 'Баланс обновлён' };
    } catch (err) {
      console.error('Failed to update user balance:', err);
      return { success: false, message: 'Ошибка обновления баланса' };
    }
  }
};
