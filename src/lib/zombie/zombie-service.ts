// Сервис управления зомби
import { supabase } from '../supabase-proxy';
import { 
  Zombie, 
  GAME_CONSTANTS, 
  calculateDistance, 
  moveTowards, 
  generateRandomPoint,
  SpawnRule
} from './types';

export const ZombieService = {
  // Получить аватарки погибших игроков (игроков с deaths > 0)
  async getDeadPlayerAvatars(): Promise<string[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_stats')
      .select('vk_id')
      .gt('total_deaths', 0);
    
    if (error || !data || data.length === 0) return [];
    
    // Получить аватарки этих игроков
    const vkIds = data.map(d => d.vk_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('photo_200')
      .in('vk_id', vkIds)
      .not('photo_200', 'is', null);
    
    if (!profiles) return [];
    
    return profiles.map(p => p.photo_200).filter(Boolean);
  },

  // Создать зомби по правилу спавна (с возможными аватарками)
  async spawnZombiesWithRule(
    sessionId: string, 
    centerLat: number, 
    centerLon: number,
    rule: SpawnRule
  ): Promise<Zombie[]> {
    if (!supabase) return [];
    
    // Получить аватарки погибших если включено
    let deadAvatars: string[] = [];
    if (rule.use_player_avatars) {
      deadAvatars = await this.getDeadPlayerAvatars();
    }
    
    const zombies: Partial<Zombie>[] = [];
    
    for (let i = 0; i < rule.zombie_count; i++) {
      const point = generateRandomPoint(
        centerLat, 
        centerLon, 
        rule.distance_min,
        rule.distance_max
      );
      
      // Определить, будет ли у этого зомби аватарка
      let avatarUrl: string | undefined;
      if (deadAvatars.length > 0 && rule.use_player_avatars) {
        const avatarChance = rule.avatar_chance ?? 50;
        if (Math.random() * 100 < avatarChance) {
          // Выбрать случайную аватарку
          avatarUrl = deadAvatars[Math.floor(Math.random() * deadAvatars.length)];
        }
      }
      
      zombies.push({
        session_id: sessionId,
        lat: point.lat,
        lon: point.lon,
        is_hunting: false,
        speed: rule.speed,
        last_move_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        avatar_url: avatarUrl,
      });
    }
    
    const { data, error } = await supabase
      .from('zombie_entities')
      .insert(zombies)
      .select();
    
    if (error) {
      console.error('Error spawning zombies with rule:', error);
      return [];
    }
    
    return data || [];
  },

  // Создать зомби вокруг точки (legacy)
  async spawnZombies(
    sessionId: string, 
    centerLat: number, 
    centerLon: number,
    count?: number
  ): Promise<Zombie[]> {
    if (!supabase) return [];
    
    const zombieCount = count ?? (
      GAME_CONSTANTS.ZOMBIE_SPAWN_MIN + 
      Math.floor(Math.random() * (GAME_CONSTANTS.ZOMBIE_SPAWN_MAX - GAME_CONSTANTS.ZOMBIE_SPAWN_MIN))
    );
    
    const zombies: Partial<Zombie>[] = [];
    
    for (let i = 0; i < zombieCount; i++) {
      const point = generateRandomPoint(
        centerLat, 
        centerLon, 
        500, // минимум 500м от игрока
        GAME_CONSTANTS.ZOMBIE_SPAWN_RADIUS_KM * 1000
      );
      
      zombies.push({
        session_id: sessionId,
        lat: point.lat,
        lon: point.lon,
        is_hunting: false,
        speed: GAME_CONSTANTS.ZOMBIE_SPEED_M_PER_5MIN,
        last_move_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
    
    const { data, error } = await supabase
      .from('zombie_entities')
      .insert(zombies)
      .select();
    
    if (error) {
      console.error('Error spawning zombies:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Получить всех зомби сессии
  async getZombies(sessionId: string): Promise<Zombie[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('zombie_entities')
      .select('*')
      .eq('session_id', sessionId);
    
    if (error) {
      console.error('Error fetching zombies:', error);
      return [];
    }
    
    return data || [];
  },
  
  // Получить зомби в радиусе видимости
  async getVisibleZombies(
    sessionId: string, 
    playerLat: number, 
    playerLon: number
  ): Promise<Zombie[]> {
    const allZombies = await this.getZombies(sessionId);
    
    return allZombies.filter(zombie => {
      const distance = calculateDistance(playerLat, playerLon, zombie.lat, zombie.lon);
      return distance <= GAME_CONSTANTS.VISIBILITY_RADIUS_M;
    });
  },
  
  // Обновить позиции всех зомби (вызывается при каждом ходе игрока)
  async moveZombies(
    sessionId: string, 
    playerLat: number, 
    playerLon: number,
    noiseLevel: number
  ): Promise<{ zombies: Zombie[]; attacks: number }> {
    if (!supabase) return { zombies: [], attacks: 0 };
    
    const zombies = await this.getZombies(sessionId);
    const now = new Date();
    let attackCount = 0;
    const updatedZombies: Zombie[] = [];
    const zombiesToUpdate: Array<{ id: string; lat: number; lon: number; is_hunting: boolean; target_lat?: number; target_lon?: number; last_move_at: string }> = [];
    
    for (const zombie of zombies) {
      const distanceToPlayer = calculateDistance(zombie.lat, zombie.lon, playerLat, playerLon);
      
      // Начать охоту если игрок в радиусе обнаружения или много шума
      const shouldHunt = distanceToPlayer <= GAME_CONSTANTS.ZOMBIE_DETECTION_RADIUS_M || 
                         noiseLevel >= GAME_CONSTANTS.NOISE_ATTRACT_THRESHOLD;
      
      let newLat = zombie.lat;
      let newLon = zombie.lon;
      
      // Зомби двигаются на каждый ход игрока
      // Скорость = zombie.speed метров за ход
      const moveDistance = zombie.speed;
      
      if (shouldHunt || zombie.is_hunting) {
        // Двигаться к игроку
        const newPos = moveTowards(zombie.lat, zombie.lon, playerLat, playerLon, moveDistance);
        newLat = newPos.lat;
        newLon = newPos.lon;
      } else {
        // Случайное блуждание (медленнее)
        const wanderDistance = moveDistance * 0.3; // 30% от скорости
        const randomMove = generateRandomPoint(zombie.lat, zombie.lon, 0, wanderDistance);
        newLat = randomMove.lat;
        newLon = randomMove.lon;
      }
      
      // Проверка атаки
      const newDistance = calculateDistance(newLat, newLon, playerLat, playerLon);
      if (newDistance <= GAME_CONSTANTS.ZOMBIE_ATTACK_RADIUS_M) {
        attackCount++;
      }
      
      const updatedZombie: Zombie = {
        ...zombie,
        lat: newLat,
        lon: newLon,
        is_hunting: shouldHunt || zombie.is_hunting,
        target_lat: shouldHunt ? playerLat : zombie.target_lat,
        target_lon: shouldHunt ? playerLon : zombie.target_lon,
        last_move_at: now.toISOString(),
      };
      
      updatedZombies.push(updatedZombie);
      
      zombiesToUpdate.push({
        id: zombie.id,
        lat: newLat,
        lon: newLon,
        is_hunting: updatedZombie.is_hunting,
        target_lat: updatedZombie.target_lat,
        target_lon: updatedZombie.target_lon,
        last_move_at: updatedZombie.last_move_at,
      });
    }
    
    // Batch update для производительности
    for (const z of zombiesToUpdate) {
      await supabase
        .from('zombie_entities')
        .update({
          lat: z.lat,
          lon: z.lon,
          is_hunting: z.is_hunting,
          target_lat: z.target_lat,
          target_lon: z.target_lon,
          last_move_at: z.last_move_at,
        })
        .eq('id', z.id);
    }
    
    return { zombies: updatedZombies, attacks: attackCount };
  },
  
  // Удалить всех зомби сессии
  async clearZombies(sessionId: string): Promise<void> {
    if (!supabase) return;
    
    await supabase
      .from('zombie_entities')
      .delete()
      .eq('session_id', sessionId);
  },
  
  // Проверить, атакуют ли зомби игрока прямо сейчас
  async checkAttacks(
    sessionId: string, 
    playerLat: number, 
    playerLon: number
  ): Promise<number> {
    const zombies = await this.getZombies(sessionId);
    
    let attackCount = 0;
    for (const zombie of zombies) {
      const distance = calculateDistance(zombie.lat, zombie.lon, playerLat, playerLon);
      if (distance <= GAME_CONSTANTS.ZOMBIE_ATTACK_RADIUS_M) {
        attackCount++;
      }
    }
    
    return attackCount;
  },

  // Получить всех зомби в расширенном радиусе (для фонарика)
  async getDistantZombies(
    sessionId: string, 
    playerLat: number, 
    playerLon: number,
    maxRange: number = GAME_CONSTANTS.FLASHLIGHT_RANGE_M
  ): Promise<Array<Zombie & { distance: number; direction: number }>> {
    const allZombies = await this.getZombies(sessionId);
    
    return allZombies
      .map(zombie => {
        const distance = calculateDistance(playerLat, playerLon, zombie.lat, zombie.lon);
        // Рассчитать направление (угол от игрока к зомби)
        const dLon = zombie.lon - playerLon;
        const dLat = zombie.lat - playerLat;
        const direction = Math.atan2(dLon, dLat) * (180 / Math.PI); // в градусах, 0 = север
        
        return {
          ...zombie,
          distance,
          direction: (direction + 360) % 360, // нормализовать 0-360
        };
      })
      .filter(z => z.distance > GAME_CONSTANTS.VISIBILITY_RADIUS_M && z.distance <= maxRange)
      .sort((a, b) => a.distance - b.distance);
  },

  // Пассивное движение зомби к игроку (механика "запаха")
  // Зомби медленно подкрадываются к неподвижному игроку и атакуют
  async passiveMoveZombies(
    sessionId: string,
    playerLat: number,
    playerLon: number
  ): Promise<{ zombies: Zombie[]; attacks: number; movedCount: number }> {
    if (!supabase) return { zombies: [], attacks: 0, movedCount: 0 };
    
    const zombies = await this.getZombies(sessionId);
    const now = new Date();
    let attackCount = 0;
    let movedCount = 0;
    const updatedZombies: Zombie[] = [];
    const zombiesToUpdate: Array<{ id: string; lat: number; lon: number; is_hunting: boolean; last_move_at: string }> = [];
    
    for (const zombie of zombies) {
      const distanceToPlayer = calculateDistance(zombie.lat, zombie.lon, playerLat, playerLon);
      
      // Только зомби в радиусе "запаха" реагируют
      if (distanceToPlayer > GAME_CONSTANTS.SMELL_RADIUS_M) {
        updatedZombies.push(zombie);
        continue;
      }
      
      // Медленное движение к игроку (15% от обычной скорости)
      const moveDistance = zombie.speed * GAME_CONSTANTS.SMELL_ZOMBIE_SPEED_MULTIPLIER;
      const newPos = moveTowards(zombie.lat, zombie.lon, playerLat, playerLon, moveDistance);
      
      // Проверка атаки
      const newDistance = calculateDistance(newPos.lat, newPos.lon, playerLat, playerLon);
      if (newDistance <= GAME_CONSTANTS.ZOMBIE_ATTACK_RADIUS_M) {
        attackCount++;
      }
      
      const updatedZombie: Zombie = {
        ...zombie,
        lat: newPos.lat,
        lon: newPos.lon,
        is_hunting: true, // Теперь охотится на игрока
        last_move_at: now.toISOString(),
      };
      
      updatedZombies.push(updatedZombie);
      movedCount++;
      
      zombiesToUpdate.push({
        id: zombie.id,
        lat: newPos.lat,
        lon: newPos.lon,
        is_hunting: true,
        last_move_at: now.toISOString(),
      });
    }
    
    // Batch update для производительности
    for (const z of zombiesToUpdate) {
      await supabase
        .from('zombie_entities')
        .update({
          lat: z.lat,
          lon: z.lon,
          is_hunting: z.is_hunting,
          last_move_at: z.last_move_at,
        })
        .eq('id', z.id);
    }
    
    return { zombies: updatedZombies, attacks: attackCount, movedCount };
  },
};
